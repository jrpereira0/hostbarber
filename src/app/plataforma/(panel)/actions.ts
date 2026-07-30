"use server";

import { redirect } from "next/navigation";
import { PLATFORM_LOGIN_PATH } from "@/lib/platform-login-path";
import { requireServerClient } from "@/lib/supabase/server";

export async function platformSignOut() {
  const supabase = await requireServerClient();
  await supabase.auth.signOut();
  redirect(PLATFORM_LOGIN_PATH);
}
