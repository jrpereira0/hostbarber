"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient, requireAdminClient } from "@/lib/supabase/admin";
import { isActionResult } from "@/lib/is-action-result";
import { requireOwnerSession, type ActionResult } from "@/lib/require-owner";
import {
  minWeekdayPrice,
  parseWeekdayPricesForm,
  type ServiceWeekdayPrice,
} from "@/lib/service-weekday-prices";
import { uploadPublicPhoto } from "@/lib/upload-photo";
import { normalizePhotoPosition } from "@/lib/photo-position";

const serviceSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome do serviço."),
  description: z.string().trim(),
  durationMinutes: z
    .number()
    .int()
    .min(5, "A duração mínima é de 5 minutos.")
    .max(480, "A duração máxima é de 8 horas."),
  professionalIds: z.array(z.uuid()).default([]),
  priceFrom: z.boolean().default(false),
});

async function loadOpenWeekdays(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  shopId: string
) {
  const { data } = await admin
    .from("business_hours")
    .select("weekday, active")
    .eq("shop_id", shopId);
  return (data ?? [])
    .filter((row) => row.active)
    .map((row) => row.weekday);
}

function parseServiceForm(formData: FormData, openWeekdays: number[]) {
  const parsed = serviceSchema.safeParse({
    name: formData.get("name"),
    description: String(formData.get("description") ?? ""),
    durationMinutes: Number(formData.get("durationMinutes") ?? 0),
    professionalIds: formData.getAll("professionalIds").map(String),
    priceFrom: formData.get("priceFrom") === "on",
  });

  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0].message };
  }

  const weekdayParsed = parseWeekdayPricesForm(formData, openWeekdays);
  if (!weekdayParsed.ok) {
    return { ok: false as const, error: weekdayParsed.error };
  }

  return {
    ok: true as const,
    data: {
      ...parsed.data,
      weekdayPrices: weekdayParsed.prices,
    },
  };
}

async function syncProfessionals(
  serviceId: string,
  professionalIds: string[],
  shopId: string
) {
  const admin = createAdminClient();
  if (!admin) return;
  await admin
    .from("professional_services")
    .delete()
    .eq("service_id", serviceId);

  if (professionalIds.length > 0) {
    // Só vincula profissionais que realmente pertencem à loja do serviço.
    const { data: validProfessionals } = await admin
      .from("professionals")
      .select("id")
      .eq("shop_id", shopId)
      .in("id", professionalIds);

    const validIds = new Set((validProfessionals ?? []).map((p) => p.id));
    const rows = professionalIds
      .filter((id) => validIds.has(id))
      .map((professionalId) => ({
        professional_id: professionalId,
        service_id: serviceId,
      }));

    if (rows.length > 0) {
      await admin.from("professional_services").insert(rows);
    }
  }
}

async function syncWeekdayPrices(
  serviceId: string,
  prices: ServiceWeekdayPrice[]
) {
  const admin = createAdminClient();
  if (!admin) return;

  await admin
    .from("service_weekday_prices")
    .delete()
    .eq("service_id", serviceId);

  if (prices.length > 0) {
    await admin.from("service_weekday_prices").insert(
      prices.map((row) => ({
        service_id: serviceId,
        weekday: row.weekday,
        price_cents: row.priceCents,
      }))
    );
  }
}

async function uploadPhoto(serviceId: string, photo: File): Promise<string | null> {
  const admin = createAdminClient();
  if (!admin) return null;
  const result = await uploadPublicPhoto(admin, "services", serviceId, photo);
  return result.ok ? result.url : null;
}

export async function createService(formData: FormData): Promise<ActionResult> {
  const session = await requireOwnerSession();
  if (!("userId" in session)) return session;

  const admin = requireAdminClient();
  if (isActionResult(admin)) return admin;

  const openWeekdays = await loadOpenWeekdays(admin, session.shopId);
  const parsed = parseServiceForm(formData, openWeekdays);
  if (!parsed.ok) {
    return { ok: false, error: parsed.error };
  }

  const { data: service, error } = await admin
    .from("services")
    .insert({
      shop_id: session.shopId,
      name: parsed.data.name,
      description: parsed.data.description,
      price_cents: minWeekdayPrice(parsed.data.weekdayPrices),
      duration_minutes: parsed.data.durationMinutes,
      price_from: parsed.data.priceFrom,
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: `Erro ao salvar: ${error.message}` };

  const photo = formData.get("photo");
  const photoPosition = normalizePhotoPosition(
    String(formData.get("photoPosition") ?? "")
  );
  if (photo instanceof File && photo.size > 0) {
    const url = await uploadPhoto(service.id, photo);
    if (url) {
      await admin
        .from("services")
        .update({ photo_url: url, photo_position: photoPosition })
        .eq("id", service.id)
        .eq("shop_id", session.shopId);
    }
  } else {
    await admin
      .from("services")
      .update({ photo_position: photoPosition })
      .eq("id", service.id)
      .eq("shop_id", session.shopId);
  }

  await syncWeekdayPrices(service.id, parsed.data.weekdayPrices);
  await syncProfessionals(service.id, parsed.data.professionalIds, session.shopId);

  revalidatePath("/admin/servicos");
  return { ok: true };
}

export async function updateService(
  id: string,
  formData: FormData
): Promise<ActionResult> {
  const session = await requireOwnerSession();
  if (!("userId" in session)) return session;

  const admin = requireAdminClient();
  if (isActionResult(admin)) return admin;

  const { data: current } = await admin
    .from("services")
    .select("id")
    .eq("id", id)
    .eq("shop_id", session.shopId)
    .maybeSingle();
  if (!current) return { ok: false, error: "Serviço não encontrado." };

  const openWeekdays = await loadOpenWeekdays(admin, session.shopId);
  const parsed = parseServiceForm(formData, openWeekdays);
  if (!parsed.ok) {
    return { ok: false, error: parsed.error };
  }

  const updates: Record<string, unknown> = {
    name: parsed.data.name,
    description: parsed.data.description,
    price_cents: minWeekdayPrice(parsed.data.weekdayPrices),
    duration_minutes: parsed.data.durationMinutes,
    price_from: parsed.data.priceFrom,
    photo_position: normalizePhotoPosition(
      String(formData.get("photoPosition") ?? "")
    ),
  };

  const photo = formData.get("photo");
  if (photo instanceof File && photo.size > 0) {
    const url = await uploadPhoto(id, photo);
    if (url) updates.photo_url = url;
  }

  const { error } = await admin
    .from("services")
    .update(updates)
    .eq("id", id)
    .eq("shop_id", session.shopId);
  if (error) return { ok: false, error: `Erro ao salvar: ${error.message}` };

  await syncWeekdayPrices(id, parsed.data.weekdayPrices);
  await syncProfessionals(id, parsed.data.professionalIds, session.shopId);

  revalidatePath("/admin/servicos");
  return { ok: true };
}

export async function setServiceActive(
  id: string,
  active: boolean
): Promise<ActionResult> {
  const session = await requireOwnerSession();
  if (!("userId" in session)) return session;

  const admin = requireAdminClient();
  if (isActionResult(admin)) return admin;
  const { error } = await admin
    .from("services")
    .update({ active })
    .eq("id", id)
    .eq("shop_id", session.shopId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/servicos");
  return { ok: true };
}

export async function deleteService(id: string): Promise<ActionResult> {
  const session = await requireOwnerSession();
  if (!("userId" in session)) return session;

  const admin = requireAdminClient();
  if (isActionResult(admin)) return admin;

  const { data: current } = await admin
    .from("services")
    .select("id")
    .eq("id", id)
    .eq("shop_id", session.shopId)
    .maybeSingle();
  if (!current) return { ok: false, error: "Serviço não encontrado." };

  const { count } = await admin
    .from("appointment_services")
    .select("appointment_id", { count: "exact", head: true })
    .eq("service_id", id);

  if (count && count > 0) {
    return {
      ok: false,
      error:
        "Esse serviço já foi usado em agendamentos. Desative-o em vez de excluir.",
    };
  }

  const { error } = await admin
    .from("services")
    .delete()
    .eq("id", id)
    .eq("shop_id", session.shopId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/servicos");
  return { ok: true };
}
