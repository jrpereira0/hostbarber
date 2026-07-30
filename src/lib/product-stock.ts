import type { SupabaseClient } from "@supabase/supabase-js";

export const STOCK_ADJUST_REASONS = [
  "purchase",
  "loss",
  "inventory",
  "adjustment",
] as const;

export type StockAdjustReason = (typeof STOCK_ADJUST_REASONS)[number];

export type StockMovementReason =
  | StockAdjustReason
  | "sale"
  | "sale_reopen";

export const STOCK_ADJUST_REASON_LABELS: Record<StockAdjustReason, string> = {
  purchase: "Compra / reposição",
  loss: "Perda / quebra",
  inventory: "Inventário (correção)",
  adjustment: "Ajuste manual",
};

export type ApplyStockDeltaResult =
  | { ok: true; quantityAfter: number }
  | { ok: false; error: string; status: number };

/**
 * Altera o estoque e registra o movimento.
 * `delta` positivo = entrada; negativo = saída.
 */
export async function applyProductStockDelta(
  admin: SupabaseClient,
  params: {
    productId: string;
    shopId: string;
    delta: number;
    reason: StockMovementReason;
    comandaId?: string | null;
    note?: string;
    createdBy?: string | null;
  }
): Promise<ApplyStockDeltaResult> {
  if (!Number.isInteger(params.delta) || params.delta === 0) {
    return { ok: false, error: "Informe uma quantidade diferente de zero.", status: 400 };
  }

  const { data: product } = await admin
    .from("products")
    .select("id, name, stock_quantity")
    .eq("id", params.productId)
    .eq("shop_id", params.shopId)
    .maybeSingle();

  if (!product) {
    return { ok: false, error: "Produto não encontrado.", status: 404 };
  }

  const nextQty = product.stock_quantity + params.delta;
  if (nextQty < 0) {
    return {
      ok: false,
      error: `Estoque insuficiente para "${product.name}" (disponível: ${product.stock_quantity}).`,
      status: 400,
    };
  }

  const { data: updated, error: updateError } = await admin
    .from("products")
    .update({
      stock_quantity: nextQty,
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.productId)
    .eq("stock_quantity", product.stock_quantity)
    .select("id")
    .maybeSingle();

  if (updateError || !updated) {
    return {
      ok: false,
      error: `Não foi possível atualizar o estoque de "${product.name}". Tente de novo.`,
      status: 409,
    };
  }

  const { error: logError } = await admin.from("product_stock_movements").insert({
    product_id: params.productId,
    delta: params.delta,
    quantity_after: nextQty,
    reason: params.reason,
    comanda_id: params.comandaId ?? null,
    note: (params.note ?? "").trim(),
    created_by: params.createdBy ?? null,
  });

  if (logError) {
    console.error("[stock] falha ao registrar movimento", logError);
    // Estoque já mudou — não reverte automaticamente para não oscilar.
  }

  return { ok: true, quantityAfter: nextQty };
}
