"use server";

import { revalidatePath } from "next/cache";
import { requireServerClient } from "@/lib/supabase/server";
import { getAdminSession } from "@/lib/require-admin";
import { ONBOARDING_PATH } from "@/lib/onboarding";
import type { ActionResult } from "@/lib/require-owner";

/** Marca o onboarding como concluído (depois da explicação do caixa). */
export async function completeOnboarding(): Promise<ActionResult> {
  const session = await getAdminSession();
  if (!session?.isOwner) {
    return { ok: false, error: "Só o dono pode concluir o onboarding." };
  }

  const supabase = await requireServerClient();
  const { error } = await supabase
    .from("shops")
    .update({ onboarding_completed_at: new Date().toISOString() })
    .eq("id", session.shopId);

  if (error) {
    return { ok: false, error: "Não foi possível salvar. Tente de novo." };
  }

  revalidatePath(ONBOARDING_PATH);
  revalidatePath("/admin");
  return { ok: true };
}

/** Pula o restante e libera a agenda (ex.: loja que já opera). */
export async function skipOnboarding(): Promise<ActionResult> {
  return completeOnboarding();
}
