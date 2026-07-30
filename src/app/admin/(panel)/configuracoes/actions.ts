"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient, requireAdminClient } from "@/lib/supabase/admin";
import { isActionResult } from "@/lib/is-action-result";
import { formatShopAddress } from "@/lib/format";
import { requireOwner, type ActionResult } from "@/lib/require-owner";
import { getAdminSession } from "@/lib/require-admin";
import { uploadPublicPhoto } from "@/lib/upload-photo";
import { normalizeSlugInput, validateSlugFormat } from "@/lib/shops/slug";

import { BOOKING_PATH } from "@/lib/booking-path";

const SETTINGS_PATH = "/admin/configuracoes";

async function requireOwnerShopId(): Promise<
  { ok: true; shopId: string } | { ok: false; error: string }
> {
  const denied = await requireOwner();
  if (denied !== null) {
    return {
      ok: false,
      error: denied.ok === false ? denied.error : "Acesso negado.",
    };
  }
  const session = await getAdminSession();
  if (!session?.isOwner) {
    return { ok: false, error: "Apenas o dono pode fazer isso." };
  }
  return { ok: true, shopId: session.shopId };
}

const timeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Horário inválido.");

// ------------------------------------------------------------
// Horário da barbearia
// ------------------------------------------------------------
const businessDaySchema = z
  .object({
    weekday: z.number().int().min(0).max(6),
    active: z.boolean(),
    openTime: timeSchema,
    closeTime: timeSchema,
  })
  .refine((d) => !d.active || d.openTime < d.closeTime, {
    message: "O horário de abrir precisa ser antes do de fechar.",
  });

const SLOT_STEPS = [15, 30, 45, 60] as const;

export async function saveBusinessHours(
  days: z.infer<typeof businessDaySchema>[],
  slotStepMinutes: number
): Promise<ActionResult> {
  const auth = await requireOwnerShopId();
  if (!auth.ok) return auth;

  const parsed = z.array(businessDaySchema).length(7).safeParse(days);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  if (!SLOT_STEPS.includes(slotStepMinutes as (typeof SLOT_STEPS)[number])) {
    return { ok: false, error: "Intervalo da agenda inválido." };
  }

  const admin = requireAdminClient();
  if (isActionResult(admin)) return admin;

  const { error: settingsError } = await admin
    .from("shops")
    .update({ slot_step_minutes: slotStepMinutes })
    .eq("id", auth.shopId);

  if (settingsError) {
    return { ok: false, error: `Erro ao salvar: ${settingsError.message}` };
  }

  for (const day of parsed.data) {
    const { error } = await admin
      .from("business_hours")
      .update({
        active: day.active,
        open_time: day.openTime,
        close_time: day.closeTime,
      })
      .eq("shop_id", auth.shopId)
      .eq("weekday", day.weekday);

    if (error) return { ok: false, error: `Erro ao salvar: ${error.message}` };
  }

  revalidatePath(SETTINGS_PATH);
  revalidatePath(BOOKING_PATH);
  revalidatePath(`${BOOKING_PATH}/[slug]`, "page");
  return { ok: true };
}

// ------------------------------------------------------------
// Exceções por data
// ------------------------------------------------------------
const exceptionSchema = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe a data."),
    professionalId: z.uuid().nullable(),
    kind: z.enum(["closed", "custom"]),
    startTime: timeSchema.nullable(),
    endTime: timeSchema.nullable(),
    note: z.string().trim().max(200),
  })
  .refine(
    (e) =>
      e.kind === "closed" ||
      (e.startTime && e.endTime && e.startTime < e.endTime),
    { message: "Informe um horário válido pro dia especial." }
  );

export async function createException(
  input: z.infer<typeof exceptionSchema>
): Promise<ActionResult> {
  const auth = await requireOwnerShopId();
  if (!auth.ok) return auth;

  const parsed = exceptionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const admin = requireAdminClient();
  if (isActionResult(admin)) return admin;
  const { error } = await admin.from("schedule_exceptions").insert({
    shop_id: auth.shopId,
    date: parsed.data.date,
    professional_id: parsed.data.professionalId,
    kind: parsed.data.kind,
    start_time: parsed.data.kind === "custom" ? parsed.data.startTime : null,
    end_time: parsed.data.kind === "custom" ? parsed.data.endTime : null,
    note: parsed.data.note,
  });

  if (error) return { ok: false, error: `Erro ao salvar: ${error.message}` };

  revalidatePath(SETTINGS_PATH);
  return { ok: true };
}

export async function deleteException(id: string): Promise<ActionResult> {
  const auth = await requireOwnerShopId();
  if (!auth.ok) return auth;

  const admin = requireAdminClient();
  if (isActionResult(admin)) return admin;
  const { error } = await admin
    .from("schedule_exceptions")
    .delete()
    .eq("id", id)
    .eq("shop_id", auth.shopId);

  if (error) return { ok: false, error: error.message };

  revalidatePath(SETTINGS_PATH);
  return { ok: true };
}

// ------------------------------------------------------------
// Perfil publico da barbearia
// ------------------------------------------------------------
async function uploadLogo(photo: File): Promise<string | null> {
  const admin = createAdminClient();
  if (!admin) return null;
  const result = await uploadPublicPhoto(admin, "shop", "logo", photo);
  return result.ok ? result.url : null;
}

const shopProfileSchema = z.object({
  shopName: z.string().trim().min(1, "Informe o nome da barbearia."),
  bio: z.string().trim().max(500, "A bio pode ter no máximo 500 caracteres."),
  cep: z
    .string()
    .regex(/^(\d{8})?$/, "CEP deve ter 8 dígitos."),
  street: z.string().trim(),
  addressNumber: z.string().trim(),
  addressComplement: z.string().trim(),
  neighborhood: z.string().trim(),
  city: z.string().trim(),
  state: z
    .string()
    .trim()
    .regex(/^([A-Za-z]{2})?$/, "UF inválida."),
  whatsapp: z
    .string()
    .regex(/^(\d{10,13})?$/, "WhatsApp deve ter de 10 a 13 números."),
  instagram: z.string().trim(),
});

export async function saveShopProfile(formData: FormData): Promise<ActionResult> {
  const denied = await requireOwner();
  if (denied) return denied;

  const parsed = shopProfileSchema.safeParse({
    shopName: formData.get("shopName"),
    bio: String(formData.get("bio") ?? ""),
    cep: String(formData.get("cep") ?? "").replace(/\D/g, ""),
    street: String(formData.get("street") ?? ""),
    addressNumber: String(formData.get("addressNumber") ?? ""),
    addressComplement: String(formData.get("addressComplement") ?? ""),
    neighborhood: String(formData.get("neighborhood") ?? ""),
    city: String(formData.get("city") ?? ""),
    state: String(formData.get("state") ?? "").toUpperCase(),
    whatsapp: String(formData.get("whatsapp") ?? "").replace(/\D/g, ""),
    instagram: String(formData.get("instagram") ?? "").replace(/^@/, ""),
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const address = formatShopAddress({
    street: parsed.data.street,
    addressNumber: parsed.data.addressNumber,
    addressComplement: parsed.data.addressComplement,
    neighborhood: parsed.data.neighborhood,
    city: parsed.data.city,
    state: parsed.data.state,
  });

  const admin = requireAdminClient();
  if (isActionResult(admin)) return admin;
  const update: Record<string, string | null> = {
    name: parsed.data.shopName,
    bio: parsed.data.bio,
    cep: parsed.data.cep,
    street: parsed.data.street,
    address_number: parsed.data.addressNumber,
    address_complement: parsed.data.addressComplement,
    neighborhood: parsed.data.neighborhood,
    city: parsed.data.city,
    state: parsed.data.state,
    address,
    whatsapp: parsed.data.whatsapp,
    instagram: parsed.data.instagram || null,
  };

  const logo = formData.get("logo");
  if (logo instanceof File && logo.size > 0) {
    const logoUrl = await uploadLogo(logo);
    if (!logoUrl) {
      return { ok: false, error: "Não foi possível enviar a logo." };
    }
    update.logo_url = logoUrl;
  }

  const auth = await requireOwnerShopId();
  if (!auth.ok) return auth;

  const { error } = await admin
    .from("shops")
    .update(update)
    .eq("id", auth.shopId);

  if (error) {
    return { ok: false, error: `Erro ao salvar: ${error.message}` };
  }

  revalidatePath(SETTINGS_PATH);
  revalidatePath(BOOKING_PATH);
  revalidatePath(`${BOOKING_PATH}/[slug]`, "page");
  return { ok: true };
}

// ------------------------------------------------------------
// Link de agendamento (slug)
// ------------------------------------------------------------
export async function saveShopSlug(input: { slug: string }): Promise<ActionResult> {
  const auth = await requireOwnerShopId();
  if (!auth.ok) return auth;

  const normalized = normalizeSlugInput(input.slug ?? "");
  const formatError = validateSlugFormat(normalized);
  if (formatError) {
    return { ok: false, error: formatError };
  }

  const admin = requireAdminClient();
  if (isActionResult(admin)) return admin;

  const { data: taken } = await admin
    .from("shops")
    .select("id")
    .eq("slug", normalized)
    .neq("id", auth.shopId)
    .maybeSingle();

  if (taken) {
    return { ok: false, error: "Esse link já está em uso por outra barbearia." };
  }

  const { error } = await admin
    .from("shops")
    .update({ slug: normalized })
    .eq("id", auth.shopId);

  if (error) {
    return { ok: false, error: `Erro ao salvar: ${error.message}` };
  }

  revalidatePath(SETTINGS_PATH);
  revalidatePath("/admin", "layout");
  revalidatePath(BOOKING_PATH);
  revalidatePath(`${BOOKING_PATH}/[slug]`, "page");
  return { ok: true };
}

// ------------------------------------------------------------
// Mensagem de confirmação no WhatsApp
// ------------------------------------------------------------
const confirmationMessageSchema = z
  .string()
  .trim()
  .min(1, "Escreva a mensagem de confirmação.")
  .max(2000, "A mensagem pode ter no máximo 2000 caracteres.");

export async function saveConfirmationWhatsappMessage(input: {
  message: string;
  enabled: boolean;
}): Promise<ActionResult> {
  const auth = await requireOwnerShopId();
  if (!auth.ok) return auth;

  const parsed = confirmationMessageSchema.safeParse(input.message);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const admin = requireAdminClient();
  if (isActionResult(admin)) return admin;

  const { error } = await admin
    .from("shops")
    .update({
      confirmation_whatsapp_message: parsed.data,
      confirmation_whatsapp_enabled: Boolean(input.enabled),
    })
    .eq("id", auth.shopId);

  if (error) {
    return { ok: false, error: `Erro ao salvar: ${error.message}` };
  }

  revalidatePath(SETTINGS_PATH);
  revalidatePath("/admin");
  return { ok: true };
}
