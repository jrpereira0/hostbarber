"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient, requireAdminClient } from "@/lib/supabase/admin";
import { isActionResult } from "@/lib/is-action-result";
import { requireOwnerSession, type ActionResult } from "@/lib/require-owner";

const SETTINGS_PATH = "/admin/configuracoes";

const receptionSchema = z.object({
  fullName: z.string().trim().min(1, "Informe o nome."),
  email: z.email("E-mail inválido."),
  password: z.string().min(6, "A senha deve ter pelo menos 6 caracteres."),
});

export type ReceptionStaffItem = {
  id: string;
  fullName: string;
  email: string | null;
};

export async function listReceptionStaff(): Promise<
  { ok: true; staff: ReceptionStaffItem[] } | ActionResult
> {
  const session = await requireOwnerSession();
  if (!("userId" in session)) return session;

  const admin = requireAdminClient();
  if (isActionResult(admin)) return admin;

  const { data: profiles, error } = await admin
    .from("profiles")
    .select("id, full_name")
    .eq("role", "reception")
    .eq("shop_id", session.shopId)
    .order("full_name");

  if (error) {
    return { ok: false, error: "Não foi possível carregar a equipe." };
  }

  const staff: ReceptionStaffItem[] = [];
  for (const profile of profiles ?? []) {
    const { data: userData } = await admin.auth.admin.getUserById(profile.id);
    staff.push({
      id: profile.id,
      fullName: profile.full_name || "Recepção",
      email: userData.user?.email ?? null,
    });
  }

  return { ok: true, staff };
}

export async function createReceptionStaff(input: {
  fullName: string;
  email: string;
  password: string;
}): Promise<ActionResult> {
  const session = await requireOwnerSession();
  if (!("userId" in session)) return session;

  const parsed = receptionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const admin = requireAdminClient();
  if (isActionResult(admin)) return admin;

  const { data: created, error: createError } =
    await admin.auth.admin.createUser({
      email: parsed.data.email,
      password: parsed.data.password,
      email_confirm: true,
      user_metadata: { full_name: parsed.data.fullName },
    });

  if (createError || !created.user) {
    const message = createError?.message ?? "";
    if (message.toLowerCase().includes("already")) {
      return { ok: false, error: "Já existe um login com este e-mail." };
    }
    return { ok: false, error: "Não foi possível criar o acesso." };
  }

  const { error: profileError } = await admin.from("profiles").upsert({
    id: created.user.id,
    full_name: parsed.data.fullName,
    role: "reception",
    shop_id: session.shopId,
  });

  if (profileError) {
    await admin.auth.admin.deleteUser(created.user.id);
    return { ok: false, error: "Não foi possível salvar o perfil da recepção." };
  }

  revalidatePath(SETTINGS_PATH);
  return { ok: true };
}

export async function deleteReceptionStaff(
  profileId: string
): Promise<ActionResult> {
  const session = await requireOwnerSession();
  if (!("userId" in session)) return session;

  const id = z.uuid().safeParse(profileId);
  if (!id.success) {
    return { ok: false, error: "Usuário inválido." };
  }

  const admin = requireAdminClient();
  if (isActionResult(admin)) return admin;

  const { data: profile } = await admin
    .from("profiles")
    .select("id, role")
    .eq("id", id.data)
    .eq("shop_id", session.shopId)
    .maybeSingle();

  if (!profile || profile.role !== "reception") {
    return { ok: false, error: "Acesso de recepção não encontrado." };
  }

  const { error: deleteAuthError } = await admin.auth.admin.deleteUser(id.data);
  if (deleteAuthError) {
    return { ok: false, error: "Não foi possível remover o login." };
  }

  await admin
    .from("profiles")
    .delete()
    .eq("id", id.data)
    .eq("shop_id", session.shopId);

  revalidatePath(SETTINGS_PATH);
  return { ok: true };
}

export async function resetReceptionPassword(input: {
  profileId: string;
  password: string;
}): Promise<ActionResult> {
  const session = await requireOwnerSession();
  if (!("userId" in session)) return session;

  const parsed = z
    .object({
      profileId: z.uuid(),
      password: z.string().min(6, "A senha deve ter pelo menos 6 caracteres."),
    })
    .safeParse(input);

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const admin = requireAdminClient();
  if (isActionResult(admin)) return admin;

  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", parsed.data.profileId)
    .eq("shop_id", session.shopId)
    .maybeSingle();

  if (profile?.role !== "reception") {
    return { ok: false, error: "Acesso de recepção não encontrado." };
  }

  const { error } = await admin.auth.admin.updateUserById(
    parsed.data.profileId,
    { password: parsed.data.password }
  );

  if (error) {
    return { ok: false, error: "Não foi possível atualizar a senha." };
  }

  return { ok: true };
}

/** Usado na page de configurações (server). */
export async function loadReceptionStaffForSettings(
  shopId: string
): Promise<ReceptionStaffItem[]> {
  const admin = createAdminClient();
  if (!admin) return [];

  const { data: profiles } = await admin
    .from("profiles")
    .select("id, full_name")
    .eq("role", "reception")
    .eq("shop_id", shopId)
    .order("full_name");

  const staff: ReceptionStaffItem[] = [];
  for (const profile of profiles ?? []) {
    const { data: userData } = await admin.auth.admin.getUserById(profile.id);
    staff.push({
      id: profile.id,
      fullName: profile.full_name || "Recepção",
      email: userData.user?.email ?? null,
    });
  }
  return staff;
}
