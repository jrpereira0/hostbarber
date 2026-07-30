import type { SupabaseClient } from "@supabase/supabase-js";
import { calculateItemCommissionCents } from "@/lib/comanda-types";

export type CommissionPayout = {
  id: string;
  professionalId: string;
  periodFrom: string;
  periodTo: string;
  amountCents: number;
  paidAt: string;
};

/** Histórico de repasses registrados para um barbeiro (mais recentes primeiro). */
export async function listProfessionalCommissionPayouts(
  admin: SupabaseClient,
  shopId: string,
  professionalId: string,
  limit = 50
): Promise<CommissionPayout[]> {
  const { data } = await admin
    .from("commission_payouts")
    .select(
      "id, professional_id, period_from, period_to, amount_cents, paid_at"
    )
    .eq("shop_id", shopId)
    .eq("professional_id", professionalId)
    .order("paid_at", { ascending: false })
    .limit(limit);

  return (data ?? []).map((row) => ({
    id: row.id,
    professionalId: row.professional_id,
    periodFrom: row.period_from,
    periodTo: row.period_to,
    amountCents: row.amount_cents,
    paidAt: row.paid_at,
  }));
}

type UnpaidItemRow = {
  id: string;
  charged_price_cents: number;
  professional_id: string;
  is_tip: boolean;
  product_id: string | null;
  commission_percent_snapshot: number | null;
  professionals:
    | { nickname: string; commission_percent: number }
    | { nickname: string; commission_percent: number }[]
    | null;
};

function firstPro(
  value: UnpaidItemRow["professionals"]
): { nickname: string; commission_percent: number } | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

/** IDs de itens de comanda que já entraram em algum repasse. */
export async function loadPaidComandaItemIds(
  admin: SupabaseClient,
  itemIds: string[]
): Promise<Set<string>> {
  if (itemIds.length === 0) return new Set();

  const paid = new Set<string>();
  const chunkSize = 200;
  for (let i = 0; i < itemIds.length; i += chunkSize) {
    const chunk = itemIds.slice(i, i + chunkSize);
    const { data } = await admin
      .from("commission_payout_items")
      .select("comanda_item_id")
      .in("comanda_item_id", chunk);
    for (const row of data ?? []) {
      paid.add(row.comanda_item_id);
    }
  }
  return paid;
}

type PayCommissionResult =
  | { ok: true; payout: CommissionPayout; itemCount: number }
  | { ok: false; error: string; status: number };

/**
 * Registra o pagamento das comissões ainda em aberto do barbeiro no período.
 * Os itens pagos não entram de novo no próximo repasse.
 */
export async function payProfessionalCommission(
  admin: SupabaseClient,
  input: {
    shopId: string;
    professionalId: string;
    from: string;
    to: string;
    paidBy: string;
  }
): Promise<PayCommissionResult> {
  const { shopId, professionalId, from, to, paidBy } = input;

  const { data: comandaRows, error: loadError } = await admin
    .from("comandas")
    .select(
      `
      id,
      comanda_items (
        id,
        charged_price_cents,
        professional_id,
        is_tip,
        product_id,
        commission_percent_snapshot,
        professionals ( nickname, commission_percent )
      )
    `
    )
    .eq("shop_id", shopId)
    .eq("status", "closed")
    .gte("service_date", from)
    .lte("service_date", to);

  if (loadError) {
    return { ok: false, error: "Não foi possível carregar as comissões.", status: 500 };
  }

  const candidateItems: UnpaidItemRow[] = [];
  for (const comanda of comandaRows ?? []) {
    for (const item of comanda.comanda_items ?? []) {
      if (item.professional_id !== professionalId) continue;
      if (!item.id) continue;
      candidateItems.push(item as UnpaidItemRow);
    }
  }

  if (candidateItems.length === 0) {
    return {
      ok: false,
      error: "Não há comissão em aberto neste período para este barbeiro.",
      status: 400,
    };
  }

  const paidIds = await loadPaidComandaItemIds(
    admin,
    candidateItems.map((item) => item.id)
  );

  const unpaidItems = candidateItems.filter((item) => !paidIds.has(item.id));
  if (unpaidItems.length === 0) {
    return {
      ok: false,
      error: "Tudo deste período já foi pago para este barbeiro.",
      status: 409,
    };
  }

  const payoutItems: { comanda_item_id: string; commission_cents: number }[] =
    [];
  let amountCents = 0;

  for (const item of unpaidItems) {
    const pro = firstPro(item.professionals);
    const pct = pro?.commission_percent ?? 50;
    const commissionCents = calculateItemCommissionCents(
      {
        chargedPriceCents: item.charged_price_cents,
        professionalId: item.professional_id,
        isTip: item.is_tip,
        productId: item.product_id,
        commissionPercentSnapshot: item.commission_percent_snapshot,
      },
      new Map([[item.professional_id, pct]])
    );
    amountCents += commissionCents;
    payoutItems.push({
      comanda_item_id: item.id,
      commission_cents: commissionCents,
    });
  }

  if (amountCents <= 0) {
    return {
      ok: false,
      error: "O valor a pagar neste período é zero.",
      status: 400,
    };
  }

  const { data: payoutRow, error: payoutError } = await admin
    .from("commission_payouts")
    .insert({
      shop_id: shopId,
      professional_id: professionalId,
      period_from: from,
      period_to: to,
      amount_cents: amountCents,
      paid_by: paidBy,
    })
    .select("id, professional_id, period_from, period_to, amount_cents, paid_at")
    .single();

  if (payoutError || !payoutRow) {
    return { ok: false, error: "Não foi possível registrar o pagamento.", status: 500 };
  }

  const { error: itemsError } = await admin.from("commission_payout_items").insert(
    payoutItems.map((item) => ({
      payout_id: payoutRow.id,
      comanda_item_id: item.comanda_item_id,
      commission_cents: item.commission_cents,
    }))
  );

  if (itemsError) {
    await admin.from("commission_payouts").delete().eq("id", payoutRow.id);
    if (itemsError.code === "23505") {
      return {
        ok: false,
        error: "Alguns atendimentos já foram pagos. Atualize a página e tente de novo.",
        status: 409,
      };
    }
    return { ok: false, error: "Não foi possível registrar o pagamento.", status: 500 };
  }

  return {
    ok: true,
    itemCount: payoutItems.length,
    payout: {
      id: payoutRow.id,
      professionalId: payoutRow.professional_id,
      periodFrom: payoutRow.period_from,
      periodTo: payoutRow.period_to,
      amountCents: payoutRow.amount_cents,
      paidAt: payoutRow.paid_at,
    },
  };
}
