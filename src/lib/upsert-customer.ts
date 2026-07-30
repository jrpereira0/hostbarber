import { createAdminClient } from "@/lib/supabase/admin";
import {
  normalizeWhatsapp,
  WHATSAPP_INVALID_MESSAGE,
  whatsappLookupKeys,
} from "@/lib/whatsapp";
import { capitalizePersonName } from "@/lib/text";

export type UpsertCustomerInput = {
  firstName: string;
  lastName: string;
  whatsapp: string;
  shopId: string;
};

export type UpsertCustomerResult =
  | { ok: true; customerId: string; firstName: string; lastName: string }
  | { ok: false; error: string };

function namesMatch(a: string, b: string): boolean {
  return (
    a.trim().toLocaleLowerCase("pt-BR") === b.trim().toLocaleLowerCase("pt-BR")
  );
}

function customerNamesCompatible(
  inputFirst: string,
  inputLast: string,
  existingFirst: string,
  existingLast: string
): boolean {
  if (!namesMatch(inputFirst, existingFirst)) return false;
  if (!inputLast.trim()) return true;
  if (!existingLast.trim()) return true;
  return namesMatch(inputLast, existingLast);
}

function formatCustomerLabel(firstName: string, lastName: string): string {
  return [firstName, lastName].filter((part) => part.trim()).join(" ").trim();
}

export async function upsertCustomer(
  input: UpsertCustomerInput
): Promise<UpsertCustomerResult> {
  const whatsapp = normalizeWhatsapp(input.whatsapp);
  if (!whatsapp) {
    return { ok: false, error: WHATSAPP_INVALID_MESSAGE };
  }

  if (!input.shopId) {
    return { ok: false, error: "Barbearia inválida." };
  }

  const firstName = capitalizePersonName(input.firstName);
  const lastName = capitalizePersonName(input.lastName);

  const admin = createAdminClient();
  if (!admin) {
    return { ok: false, error: "Sistema indisponível no momento." };
  }

  const { data: existing, error: lookupError } = await admin
    .from("customers")
    .select("id, first_name, last_name")
    .eq("shop_id", input.shopId)
    .in("whatsapp", whatsappLookupKeys(whatsapp))
    .limit(1)
    .maybeSingle();

  if (lookupError) {
    return { ok: false, error: "Não foi possível salvar os dados do cliente." };
  }

  if (existing) {
    if (
      !customerNamesCompatible(
        firstName,
        lastName,
        existing.first_name,
        existing.last_name
      )
    ) {
      return {
        ok: false,
        error: `Este WhatsApp já pertence a ${formatCustomerLabel(
          capitalizePersonName(existing.first_name),
          capitalizePersonName(existing.last_name)
        )}. Verifique o número ou edite o cadastro em Clientes.`,
      };
    }

    return {
      ok: true,
      customerId: existing.id,
      firstName: capitalizePersonName(existing.first_name),
      lastName: capitalizePersonName(existing.last_name),
    };
  }

  const { data: created, error } = await admin
    .from("customers")
    .insert({
      shop_id: input.shopId,
      first_name: firstName,
      last_name: lastName,
      whatsapp,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      return {
        ok: false,
        error: "Esse WhatsApp já está cadastrado. Tente de novo.",
      };
    }
    return { ok: false, error: "Não foi possível cadastrar o cliente." };
  }

  if (!created) {
    return { ok: false, error: "Não foi possível cadastrar o cliente." };
  }

  return {
    ok: true,
    customerId: created.id,
    firstName,
    lastName,
  };
}
