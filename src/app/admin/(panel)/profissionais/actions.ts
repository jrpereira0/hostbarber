"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient, requireAdminClient } from "@/lib/supabase/admin";
import { isActionResult } from "@/lib/is-action-result";
import { requireOwnerSession, type ActionResult } from "@/lib/require-owner";
import { uploadPublicPhoto } from "@/lib/upload-photo";
import { normalizePhotoPosition } from "@/lib/photo-position";
import {
  parsePermissionsFormData,
  permissionsToDbRow,
} from "@/lib/professional-permissions";

const professionalSchema = z.object({
  firstName: z.string().trim().min(1, "Informe o nome."),
  lastName: z.string().trim().min(1, "Informe o sobrenome."),
  nickname: z.string().trim().min(1, "Informe o apelido."),
  whatsapp: z
    .string()
    .trim()
    .regex(/^\d{10,13}$/, "WhatsApp deve ter de 10 a 13 números (DDD + número)."),
  email: z.email("E-mail inválido."),
  instagram: z.string().trim().optional().or(z.literal("")),
  serviceIds: z.array(z.uuid()).default([]),
  commissionPercent: z.coerce.number().int().min(0).max(100),
});

const passwordSchema = z
  .string()
  .min(6, "A senha deve ter pelo menos 6 caracteres.");

const timeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Horário inválido.");

const scheduleSchema = z.array(
  z.object({
    weekday: z.number().int().min(0).max(6),
    ranges: z
      .array(
        z
          .object({ startTime: timeSchema, endTime: timeSchema })
          .refine((r) => r.startTime < r.endTime, {
            message: "O início da faixa precisa ser antes do fim.",
          })
      )
      .max(4),
  })
);

type Schedule = z.infer<typeof scheduleSchema>;

function parseSchedule(formData: FormData): Schedule | { error: string } {
  let raw: unknown;
  try {
    raw = JSON.parse(String(formData.get("schedule") ?? "[]"));
  } catch {
    return { error: "Horários inválidos." };
  }

  const parsed = scheduleSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  for (const day of parsed.data) {
    const sorted = [...day.ranges].sort((a, b) =>
      a.startTime.localeCompare(b.startTime)
    );
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].startTime < sorted[i - 1].endTime) {
        return { error: "Há faixas de horário sobrepostas no mesmo dia." };
      }
    }
  }
  return parsed.data;
}

async function syncSchedule(professionalId: string, schedule: Schedule) {
  const admin = createAdminClient();
  if (!admin) return;
  await admin
    .from("working_hours")
    .delete()
    .eq("professional_id", professionalId);

  const rows = schedule.flatMap((day) =>
    day.ranges.map((range) => ({
      professional_id: professionalId,
      weekday: day.weekday,
      start_time: range.startTime,
      end_time: range.endTime,
    }))
  );

  if (rows.length > 0) {
    await admin.from("working_hours").insert(rows);
  }
}

function parseForm(formData: FormData) {
  return professionalSchema.safeParse({
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    nickname: formData.get("nickname"),
    whatsapp: String(formData.get("whatsapp") ?? "").replace(/\D/g, ""),
    email: formData.get("email"),
    instagram: String(formData.get("instagram") ?? "").replace(/^@/, ""),
    serviceIds: formData.getAll("serviceIds").map(String),
    commissionPercent: formData.get("commissionPercent"),
  });
}

async function uploadPhoto(
  professionalId: string,
  photo: File
): Promise<string | null> {
  const admin = createAdminClient();
  if (!admin) return null;
  const result = await uploadPublicPhoto(
    admin,
    "professionals",
    professionalId,
    photo
  );
  return result.ok ? result.url : null;
}

async function syncServices(
  professionalId: string,
  serviceIds: string[],
  shopId: string
) {
  const admin = createAdminClient();
  if (!admin) return;
  await admin
    .from("professional_services")
    .delete()
    .eq("professional_id", professionalId);

  if (serviceIds.length > 0) {
    // Só vincula serviços que realmente pertencem à loja do profissional.
    const { data: validServices } = await admin
      .from("services")
      .select("id")
      .eq("shop_id", shopId)
      .in("id", serviceIds);

    const validIds = new Set((validServices ?? []).map((s) => s.id));
    const rows = serviceIds
      .filter((id) => validIds.has(id))
      .map((serviceId) => ({
        professional_id: professionalId,
        service_id: serviceId,
      }));

    if (rows.length > 0) {
      await admin.from("professional_services").insert(rows);
    }
  }
}

export async function createProfessional(
  formData: FormData
): Promise<ActionResult> {
  const session = await requireOwnerSession();
  if (!("userId" in session)) return session;

  const parsed = parseForm(formData);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const schedule = parseSchedule(formData);
  if ("error" in schedule) return { ok: false, error: schedule.error };

  const password = passwordSchema.safeParse(formData.get("password"));
  if (!password.success) {
    return { ok: false, error: password.error.issues[0].message };
  }

  const data = parsed.data;
  const permissions = parsePermissionsFormData(formData);
  const admin = requireAdminClient();
  if (isActionResult(admin)) return admin;

  // Cria o login do barbeiro (já confirmado, sem e-mail de verificação)
  const { data: created, error: userError } =
    await admin.auth.admin.createUser({
      email: data.email,
      password: password.data,
      email_confirm: true,
      user_metadata: { full_name: `${data.firstName} ${data.lastName}` },
    });

  if (userError) {
    return {
      ok: false,
      error:
        userError.code === "email_exists"
          ? "Já existe um usuário com esse e-mail."
          : `Erro ao criar o acesso: ${userError.message}`,
    };
  }

  await admin.from("profiles").upsert({
    id: created.user.id,
    full_name: `${data.firstName} ${data.lastName}`,
    role: "barber",
    shop_id: session.shopId,
  });

  const { data: professional, error: insertError } = await admin
    .from("professionals")
    .insert({
      shop_id: session.shopId,
      first_name: data.firstName,
      last_name: data.lastName,
      nickname: data.nickname,
      whatsapp: data.whatsapp,
      email: data.email,
      instagram: data.instagram || null,
      commission_percent: data.commissionPercent,
      profile_id: created.user.id,
      ...permissionsToDbRow(permissions),
    })
    .select("id")
    .single();

  if (insertError) {
    // Desfaz a criação do login para não deixar usuário órfão
    await admin.auth.admin.deleteUser(created.user.id);
    return { ok: false, error: `Erro ao salvar: ${insertError.message}` };
  }

  const photo = formData.get("photo");
  const photoPosition = normalizePhotoPosition(
    String(formData.get("photoPosition") ?? "")
  );
  if (photo instanceof File && photo.size > 0) {
    const url = await uploadPhoto(professional.id, photo);
    if (url) {
      await admin
        .from("professionals")
        .update({ photo_url: url, photo_position: photoPosition })
        .eq("id", professional.id)
        .eq("shop_id", session.shopId);
    }
  } else {
    await admin
      .from("professionals")
      .update({ photo_position: photoPosition })
      .eq("id", professional.id)
      .eq("shop_id", session.shopId);
  }

  await syncServices(professional.id, data.serviceIds, session.shopId);
  await syncSchedule(professional.id, schedule);

  revalidatePath("/admin/profissionais");
  revalidatePath("/admin/configuracoes");
  revalidatePath("/admin/primeiros-passos");
  revalidatePath("/agenda");
  return { ok: true };
}

export async function updateProfessional(
  id: string,
  formData: FormData
): Promise<ActionResult> {
  const session = await requireOwnerSession();
  if (!("userId" in session)) return session;

  const parsed = parseForm(formData);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const schedule = parseSchedule(formData);
  if ("error" in schedule) return { ok: false, error: schedule.error };

  const data = parsed.data;
  const permissions = parsePermissionsFormData(formData);
  const admin = requireAdminClient();
  if (isActionResult(admin)) return admin;

  const { data: current } = await admin
    .from("professionals")
    .select("profile_id, email")
    .eq("id", id)
    .eq("shop_id", session.shopId)
    .single();

  if (!current) return { ok: false, error: "Profissional não encontrado." };

  // Atualiza login (e-mail e/ou senha) se necessário
  if (current.profile_id) {
    const authUpdates: { email?: string; password?: string } = {};
    if (data.email !== current.email) authUpdates.email = data.email;

    const rawPassword = String(formData.get("password") ?? "");
    if (rawPassword) {
      const password = passwordSchema.safeParse(rawPassword);
      if (!password.success) {
        return { ok: false, error: password.error.issues[0].message };
      }
      authUpdates.password = password.data;
    }

    if (Object.keys(authUpdates).length > 0) {
      const { error } = await admin.auth.admin.updateUserById(
        current.profile_id,
        authUpdates
      );
      if (error) {
        return { ok: false, error: `Erro ao atualizar acesso: ${error.message}` };
      }
    }
  }

  const updates: Record<string, unknown> = {
    first_name: data.firstName,
    last_name: data.lastName,
    nickname: data.nickname,
    whatsapp: data.whatsapp,
    email: data.email,
    instagram: data.instagram || null,
    commission_percent: data.commissionPercent,
    photo_position: normalizePhotoPosition(
      String(formData.get("photoPosition") ?? "")
    ),
    ...permissionsToDbRow(permissions),
  };

  const photo = formData.get("photo");
  if (photo instanceof File && photo.size > 0) {
    const url = await uploadPhoto(id, photo);
    if (url) updates.photo_url = url;
  }

  const { error: updateError } = await admin
    .from("professionals")
    .update(updates)
    .eq("id", id)
    .eq("shop_id", session.shopId);

  if (updateError) {
    return { ok: false, error: `Erro ao salvar: ${updateError.message}` };
  }

  await syncServices(id, data.serviceIds, session.shopId);
  await syncSchedule(id, schedule);

  revalidatePath("/admin/profissionais");
  revalidatePath("/admin/configuracoes");
  revalidatePath("/admin/primeiros-passos");
  revalidatePath("/agenda");
  return { ok: true };
}

export async function setProfessionalActive(
  id: string,
  active: boolean
): Promise<ActionResult> {
  const session = await requireOwnerSession();
  if (!("userId" in session)) return session;

  const admin = requireAdminClient();
  if (isActionResult(admin)) return admin;
  const { error } = await admin
    .from("professionals")
    .update({ active })
    .eq("id", id)
    .eq("shop_id", session.shopId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/profissionais");
  revalidatePath("/agenda");
  return { ok: true };
}

export async function deleteProfessional(id: string): Promise<ActionResult> {
  const session = await requireOwnerSession();
  if (!("userId" in session)) return session;

  const admin = requireAdminClient();
  if (isActionResult(admin)) return admin;

  const { data: professional } = await admin
    .from("professionals")
    .select("profile_id")
    .eq("id", id)
    .eq("shop_id", session.shopId)
    .single();

  if (!professional) {
    return { ok: false, error: "Profissional não encontrado." };
  }

  const { count } = await admin
    .from("appointments")
    .select("id", { count: "exact", head: true })
    .eq("professional_id", id)
    .eq("shop_id", session.shopId);

  if (count && count > 0) {
    return {
      ok: false,
      error:
        "Esse profissional tem agendamentos no histórico. Desative-o em vez de excluir.",
    };
  }

  const { error } = await admin
    .from("professionals")
    .delete()
    .eq("id", id)
    .eq("shop_id", session.shopId);
  if (error) return { ok: false, error: error.message };

  if (professional?.profile_id) {
    await admin.auth.admin.deleteUser(professional.profile_id);
  }

  revalidatePath("/admin/profissionais");
  revalidatePath("/agenda");
  return { ok: true };
}
