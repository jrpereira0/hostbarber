"use server";

import { revalidatePath } from "next/cache";
import { requireServerClient } from "@/lib/supabase/server";
import { requireAdminClient } from "@/lib/supabase/admin";
import { isActionResult } from "@/lib/is-action-result";
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

/** Garante uma categoria padrão para o passo de produtos. */
export async function ensureDefaultProductCategory(): Promise<
  ActionResult & { categoryId?: string }
> {
  const session = await getAdminSession();
  if (!session?.isOwner) {
    return { ok: false, error: "Só o dono pode cadastrar categorias." };
  }

  const admin = requireAdminClient();
  if (isActionResult(admin)) return admin;

  const { data: existing } = await admin
    .from("product_categories")
    .select("id")
    .eq("shop_id", session.shopId)
    .eq("active", true)
    .order("sort_order")
    .limit(1)
    .maybeSingle();

  if (existing?.id) {
    return { ok: true, categoryId: existing.id };
  }

  const { data: created, error } = await admin
    .from("product_categories")
    .insert({
      shop_id: session.shopId,
      name: "Geral",
      sort_order: 0,
      active: true,
    })
    .select("id")
    .single();

  if (error || !created) {
    return {
      ok: false,
      error: error?.message ?? "Não foi possível criar a categoria.",
    };
  }

  revalidatePath(ONBOARDING_PATH);
  revalidatePath("/admin/produtos");
  return { ok: true, categoryId: created.id };
}
