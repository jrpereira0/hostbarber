"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { platformLoginUrl } from "@/lib/platform-login-path";

export async function platformLogin(formData: FormData) {
  if (!isSupabaseConfigured()) {
    redirect(platformLoginUrl("config"));
  }

  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    redirect(platformLoginUrl("campos"));
  }

  const supabase = await createClient();
  if (!supabase) redirect(platformLoginUrl("config"));

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    redirect(platformLoginUrl("credenciais"));
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(platformLoginUrl("credenciais"));
  }

  const { data: admin } = await supabase
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!admin) {
    await supabase.auth.signOut();
    redirect(platformLoginUrl("perfil"));
  }

  redirect("/plataforma");
}
