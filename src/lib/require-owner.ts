import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { LOGIN_PATH, loginUrl } from "@/lib/login-path";
import {
  canManageCustomers,
  getAdminSession,
  type AdminSession,
} from "@/lib/require-admin";

export type ActionResult = { ok: true } | { ok: false; error: string };

// Garante que quem chama a action é o dono. Retorna null se estiver
// tudo certo, ou um ActionResult de erro pra devolver direto.
export async function requireOwner(): Promise<ActionResult | null> {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Sistema indisponível. Tente de novo em instantes." };
  }

  const supabase = await createClient();
  if (!supabase) {
    return {
      ok: false,
      error: "Sistema indisponível no momento. Tente de novo em instantes.",
    };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { ok: false, error: "Você precisa estar logado." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "owner") {
    return { ok: false, error: "Apenas o dono pode fazer isso." };
  }
  return null;
}

// Redireciona barbeiros e visitantes que tentarem abrir páginas só do dono.
export async function assertOwnerPage(): Promise<void> {
  const denied = await requireOwner();
  if (denied) redirect("/admin");
}

// Como requireOwner, mas devolve a sessão (com shopId) pra actions que
// precisam escopar suas queries por loja.
export async function requireOwnerSession(): Promise<ActionResult | AdminSession> {
  const session = await getAdminSession();
  if (!session) return { ok: false, error: "Você precisa estar logado." };
  if (!session.isOwner) {
    return { ok: false, error: "Apenas o dono pode fazer isso." };
  }
  return session;
}

/** Dono ou recepção — cadastro de clientes (sem crédito manual). */
export async function assertCustomerManagerPage(): Promise<AdminSession> {
  const session = await getAdminSession();
  if (!session || !canManageCustomers(session)) redirect("/admin");
  return session;
}

// Configurações da barbearia: dono entra; barbeiro vai para Minha conta.
export async function assertOwnerSettingsPage(): Promise<void> {
  if (!isSupabaseConfigured()) redirect(LOGIN_PATH);

  const supabase = await createClient();
  if (!supabase) redirect(loginUrl("config"));

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect(LOGIN_PATH);

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "owner") redirect("/admin/minha-conta");
}
