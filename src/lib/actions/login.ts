"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { loginUrl } from "@/lib/login-path";
import { isShopActive } from "@/lib/shops/queries";

export async function login(formData: FormData) {
  if (!isSupabaseConfigured()) {
    redirect(loginUrl("config"));
  }

  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    redirect(loginUrl("campos"));
  }

  const supabase = await createClient();
  if (!supabase) redirect(loginUrl("config"));

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    redirect(loginUrl("credenciais"));
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    await supabase.auth.signOut();
    redirect(loginUrl("credenciais"));
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("shop_id, role")
    .eq("id", user.id)
    .maybeSingle();

  if (
    !profile?.shop_id ||
    (profile.role !== "owner" &&
      profile.role !== "barber" &&
      profile.role !== "reception")
  ) {
    await supabase.auth.signOut();
    redirect(loginUrl("perfil"));
  }

  const active = await isShopActive(supabase, profile.shop_id);
  if (!active) {
    await supabase.auth.signOut();
    redirect(loginUrl("inativa"));
  }

  redirect("/admin");
}
