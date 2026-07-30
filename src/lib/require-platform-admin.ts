import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import type { ActionResult } from "@/lib/require-owner";

export type PlatformAdminSession = {
  userId: string;
  email: string;
};

export async function getPlatformAdminSession(): Promise<PlatformAdminSession | null> {
  if (!isSupabaseConfigured()) return null;

  const supabase = await createClient();
  if (!supabase) return null;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: row } = await supabase
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!row) return null;

  return {
    userId: user.id,
    email: user.email ?? "",
  };
}

export async function requirePlatformAdmin(): Promise<
  ActionResult | PlatformAdminSession
> {
  const session = await getPlatformAdminSession();
  if (!session) {
    return { ok: false, error: "Você precisa estar logado como superadmin." };
  }
  return session;
}
