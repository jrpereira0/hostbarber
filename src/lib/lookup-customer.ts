import { createAdminClient } from "@/lib/supabase/admin";
import {
  normalizeWhatsapp,
  whatsappLookupKeys,
} from "@/lib/whatsapp";
import { capitalizePersonName } from "@/lib/text";
import {
  DEFAULT_PHOTO_POSITION,
  normalizePhotoPosition,
} from "@/lib/photo-position";

export type CustomerLookupResult =
  | { found: true; firstName: string; lastName: string }
  | { found: false };

export type CustomerPublic = {
  id: string;
  firstName: string;
  lastName: string;
  whatsapp: string;
  /** Saldo de crédito na loja (centavos). */
  creditBalanceCents: number;
  photoUrl: string | null;
  photoPosition: string;
};

export type CustomerByWhatsappResult =
  | { ok: true; found: true; customer: CustomerPublic }
  | { ok: true; found: false; customer: null }
  | { ok: false; error: string; httpStatus: number };

function mapCustomerRow(
  data: {
    id: string;
    first_name: string;
    last_name: string;
    credit_balance_cents?: number | null;
    photo_url?: string | null;
    photo_position?: string | null;
  },
  whatsapp: string
): CustomerPublic {
  return {
    id: data.id,
    firstName: capitalizePersonName(data.first_name),
    lastName: capitalizePersonName(data.last_name),
    whatsapp,
    creditBalanceCents:
      typeof data.credit_balance_cents === "number"
        ? data.credit_balance_cents
        : 0,
    photoUrl: data.photo_url?.trim() || null,
    photoPosition: normalizePhotoPosition(
      data.photo_position ?? DEFAULT_PHOTO_POSITION
    ),
  };
}

export async function getCustomerByWhatsapp(
  rawWhatsapp: string,
  shopId: string
): Promise<CustomerByWhatsappResult> {
  const whatsapp = normalizeWhatsapp(rawWhatsapp);
  if (!whatsapp) {
    return { ok: false, error: "WhatsApp inválido.", httpStatus: 400 };
  }
  if (!shopId.trim()) {
    return { ok: false, error: "Barbearia não encontrada.", httpStatus: 400 };
  }

  const admin = createAdminClient();
  if (!admin) {
    return {
      ok: false,
      error: "Sistema indisponível no momento.",
      httpStatus: 503,
    };
  }

  const { data, error } = await admin
    .from("customers")
    .select(
      "id, first_name, last_name, credit_balance_cents, photo_url, photo_position"
    )
    .eq("shop_id", shopId)
    .in("whatsapp", whatsappLookupKeys(whatsapp))
    .limit(1)
    .maybeSingle();

  if (error) {
    return {
      ok: false,
      error: "Não foi possível consultar o cliente.",
      httpStatus: 500,
    };
  }

  if (!data) {
    return { ok: true, found: false, customer: null };
  }

  return {
    ok: true,
    found: true,
    customer: mapCustomerRow(data, whatsapp),
  };
}

export async function lookupCustomerByWhatsapp(
  whatsapp: string,
  shopId: string
): Promise<CustomerLookupResult> {
  const result = await getCustomerByWhatsapp(whatsapp, shopId);
  if (!result.ok || !result.found) {
    return { found: false };
  }

  return {
    found: true,
    firstName: result.customer.firstName,
    lastName: result.customer.lastName,
  };
}

export type UpdateCustomerProfileResult =
  | { ok: true; customer: CustomerPublic }
  | { ok: false; error: string; httpStatus: number };

/**
 * Atualiza nome/sobrenome (e opcionalmente foto) do cliente autenticado.
 * WhatsApp imutável. Se ainda não existir cadastro, cria.
 */
export async function updateCustomerProfileByWhatsapp(input: {
  whatsapp: string;
  shopId: string;
  firstName: string;
  lastName: string;
  photoUrl?: string | null;
  photoPosition?: string | null;
}): Promise<UpdateCustomerProfileResult> {
  const whatsapp = normalizeWhatsapp(input.whatsapp);
  if (!whatsapp) {
    return { ok: false, error: "WhatsApp inválido.", httpStatus: 400 };
  }
  if (!input.shopId.trim()) {
    return { ok: false, error: "Barbearia não encontrada.", httpStatus: 400 };
  }

  const firstName = capitalizePersonName(input.firstName);
  const lastName = capitalizePersonName(input.lastName);
  if (!firstName) {
    return { ok: false, error: "Informe o nome.", httpStatus: 400 };
  }

  const admin = createAdminClient();
  if (!admin) {
    return {
      ok: false,
      error: "Sistema indisponível no momento.",
      httpStatus: 503,
    };
  }

  const photoPosition =
    input.photoPosition != null
      ? normalizePhotoPosition(input.photoPosition)
      : null;
  const hasPhotoUpdate =
    input.photoUrl !== undefined || input.photoPosition != null;

  const { data: existing, error: lookupError } = await admin
    .from("customers")
    .select("id, credit_balance_cents, photo_url, photo_position")
    .eq("shop_id", input.shopId)
    .in("whatsapp", whatsappLookupKeys(whatsapp))
    .limit(1)
    .maybeSingle();

  if (lookupError) {
    return {
      ok: false,
      error: "Não foi possível salvar os dados.",
      httpStatus: 500,
    };
  }

  if (existing) {
    const updates: Record<string, unknown> = {
      first_name: firstName,
      last_name: lastName,
      updated_at: new Date().toISOString(),
    };
    if (input.photoUrl !== undefined) {
      updates.photo_url = input.photoUrl;
    }
    if (photoPosition != null) {
      updates.photo_position = photoPosition;
    }

    const { error } = await admin
      .from("customers")
      .update(updates)
      .eq("id", existing.id);

    if (error) {
      return {
        ok: false,
        error: "Não foi possível atualizar o cadastro.",
        httpStatus: 500,
      };
    }

    return {
      ok: true,
      customer: mapCustomerRow(
        {
          id: existing.id,
          first_name: firstName,
          last_name: lastName,
          credit_balance_cents: existing.credit_balance_cents,
          photo_url:
            input.photoUrl !== undefined ? input.photoUrl : existing.photo_url,
          photo_position:
            photoPosition ?? existing.photo_position ?? DEFAULT_PHOTO_POSITION,
        },
        whatsapp
      ),
    };
  }

  const insertRow: Record<string, unknown> = {
    shop_id: input.shopId,
    first_name: firstName,
    last_name: lastName,
    whatsapp,
  };
  if (hasPhotoUpdate) {
    if (input.photoUrl !== undefined) insertRow.photo_url = input.photoUrl;
    if (photoPosition != null) insertRow.photo_position = photoPosition;
  }

  const { data: created, error } = await admin
    .from("customers")
    .insert(insertRow)
    .select(
      "id, first_name, last_name, credit_balance_cents, photo_url, photo_position"
    )
    .single();

  if (error || !created) {
    if (error?.code === "23505") {
      return {
        ok: false,
        error: "Esse WhatsApp já está cadastrado. Tente de novo.",
        httpStatus: 409,
      };
    }
    return {
      ok: false,
      error: "Não foi possível criar o cadastro.",
      httpStatus: 500,
    };
  }

  return {
    ok: true,
    customer: mapCustomerRow(created, whatsapp),
  };
}
