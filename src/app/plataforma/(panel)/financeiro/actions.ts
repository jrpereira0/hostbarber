"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformAdmin } from "@/lib/require-platform-admin";
import { requireAdminClient } from "@/lib/supabase/admin";
import type { ActionResult } from "@/lib/require-owner";
import {
  findUncoveredBillingMonths,
  monthKey,
  sumPaymentsByShopMonth,
  type PlatformPaymentKind,
} from "@/lib/platform-billing";

const FINANCE_PATH = "/plataforma/financeiro";

function revalidateFinance(shopId?: string) {
  revalidatePath(FINANCE_PATH);
  revalidatePath("/plataforma");
  if (shopId) {
    revalidatePath(`${FINANCE_PATH}/${shopId}`);
  }
}

function parsePositiveCents(raw: unknown): number | null {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n) || n <= 0 || !Number.isInteger(n)) return null;
  return n;
}

function parseDueDay(raw: unknown): number | null {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1 || n > 31) {
    return null;
  }
  return n;
}

/** "YYYY-MM" ou "YYYY-MM-DD" -> "YYYY-MM-01". */
function parseReferenceMonth(raw: string): string | null {
  const trimmed = raw.trim();
  const match = trimmed.match(/^(\d{4})-(\d{2})(?:-\d{2})?$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  return monthKey(new Date(year, month - 1, 1));
}

function parsePaidAt(raw: string): string | null {
  const trimmed = raw.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  const [y, m, d] = trimmed.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  if (
    date.getFullYear() !== y ||
    date.getMonth() !== m - 1 ||
    date.getDate() !== d
  ) {
    return null;
  }
  return trimmed;
}

/** Configura valor da mensalidade e dia de vencimento de um cliente. */
export async function saveShopBilling(input: {
  shopId: string;
  monthlyFeeCents: number;
  billingDueDay: number;
}): Promise<ActionResult> {
  const gate = await requirePlatformAdmin();
  if ("ok" in gate && gate.ok === false) return gate;

  const admin = requireAdminClient();
  if ("ok" in admin) return admin;

  const shopId = String(input.shopId ?? "").trim();
  if (!shopId) return { ok: false, error: "Cliente inválido." };

  const fee = parsePositiveCents(input.monthlyFeeCents);
  if (fee == null) {
    return { ok: false, error: "Informe um valor de mensalidade válido." };
  }

  const dueDay = parseDueDay(input.billingDueDay);
  if (dueDay == null) {
    return { ok: false, error: "O dia de vencimento precisa ser entre 1 e 31." };
  }

  const { data: existing, error: loadError } = await admin
    .from("shops")
    .select("id")
    .eq("id", shopId)
    .maybeSingle();

  if (loadError || !existing) {
    return { ok: false, error: "Cliente não encontrado." };
  }

  const { error } = await admin
    .from("shops")
    .update({
      monthly_fee_cents: fee,
      billing_due_day: dueDay,
      updated_at: new Date().toISOString(),
    })
    .eq("id", shopId);

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidateFinance(shopId);
  return { ok: true };
}

/** Remove a configuração de cobrança de um cliente (volta pra "sem cobrança"). */
export async function clearShopBilling(shopId: string): Promise<ActionResult> {
  const gate = await requirePlatformAdmin();
  if ("ok" in gate && gate.ok === false) return gate;

  const admin = requireAdminClient();
  if ("ok" in admin) return admin;

  const id = String(shopId ?? "").trim();
  if (!id) return { ok: false, error: "Cliente inválido." };

  const { error } = await admin
    .from("shops")
    .update({
      monthly_fee_cents: null,
      billing_due_day: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidateFinance(id);
  return { ok: true };
}

/** Registra um pagamento recebido de um cliente. */
export async function registerPayment(input: {
  shopId: string;
  amountCents: number;
  referenceMonth: string;
  paidAt: string;
  note?: string;
}): Promise<ActionResult> {
  const gate = await requirePlatformAdmin();
  if ("ok" in gate && gate.ok === false) return gate;

  const admin = requireAdminClient();
  if ("ok" in admin) return admin;

  const shopId = String(input.shopId ?? "").trim();
  if (!shopId) return { ok: false, error: "Cliente inválido." };

  const amount = parsePositiveCents(input.amountCents);
  if (amount == null) {
    return { ok: false, error: "Informe um valor de pagamento válido." };
  }

  const referenceMonth = parseReferenceMonth(String(input.referenceMonth ?? ""));
  if (!referenceMonth) {
    return { ok: false, error: "Informe o mês de referência (AAAA-MM)." };
  }

  const paidAt = parsePaidAt(String(input.paidAt ?? ""));
  if (!paidAt) {
    return { ok: false, error: "Informe a data do pagamento." };
  }

  const note = String(input.note ?? "").trim().slice(0, 500) || null;

  const { data: existing, error: loadError } = await admin
    .from("shops")
    .select("id")
    .eq("id", shopId)
    .maybeSingle();

  if (loadError || !existing) {
    return { ok: false, error: "Cliente não encontrado." };
  }

  const { error } = await admin.from("platform_payments").insert({
    shop_id: shopId,
    amount_cents: amount,
    reference_month: referenceMonth,
    paid_at: paidAt,
    note,
    kind: "payment",
    created_by: "userId" in gate ? gate.userId : null,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidateFinance(shopId);
  return { ok: true };
}

/**
 * Dá N meses grátis (cortesia ou indicação): lança no extrato cobrindo
 * os próximos meses ainda sem mensalidade completa.
 */
export async function grantFreeMonths(input: {
  shopId: string;
  months: number;
  kind?: Exclude<PlatformPaymentKind, "payment">;
  note?: string;
}): Promise<ActionResult & { grantedMonths?: string[] }> {
  const gate = await requirePlatformAdmin();
  if ("ok" in gate && gate.ok === false) return gate;

  const admin = requireAdminClient();
  if ("ok" in admin) return admin;

  const shopId = String(input.shopId ?? "").trim();
  if (!shopId) return { ok: false, error: "Cliente inválido." };

  const monthsCount = Number(input.months);
  if (
    !Number.isFinite(monthsCount) ||
    !Number.isInteger(monthsCount) ||
    monthsCount < 1 ||
    monthsCount > 12
  ) {
    return { ok: false, error: "Informe de 1 a 12 meses grátis." };
  }

  const kind: Exclude<PlatformPaymentKind, "payment"> =
    input.kind === "referral" ? "referral" : "complimentary";

  const defaultNote =
    kind === "referral" ? "Mês grátis por indicação" : "Mês grátis (cortesia)";
  const note =
    String(input.note ?? "").trim().slice(0, 500) || defaultNote;

  const { data: shop, error: loadError } = await admin
    .from("shops")
    .select("id, monthly_fee_cents, created_at")
    .eq("id", shopId)
    .maybeSingle();

  if (loadError || !shop) {
    return { ok: false, error: "Cliente não encontrado." };
  }

  const fee = shop.monthly_fee_cents;
  if (fee == null || fee <= 0) {
    return {
      ok: false,
      error: "Configure o valor da mensalidade antes de dar mês grátis.",
    };
  }

  const { data: paymentRows, error: payError } = await admin
    .from("platform_payments")
    .select("shop_id, amount_cents, reference_month")
    .eq("shop_id", shopId);

  if (payError) {
    return { ok: false, error: payError.message };
  }

  const byMonth =
    sumPaymentsByShopMonth(
      (paymentRows ?? []).map((row) => ({
        shopId: row.shop_id,
        referenceMonth: String(row.reference_month).slice(0, 10),
        amountCents: row.amount_cents,
      }))
    ).get(shopId) ?? new Map();

  const uncovered = findUncoveredBillingMonths({
    monthlyFeeCents: fee,
    createdAt: shop.created_at,
    paymentsByMonth: byMonth,
    count: monthsCount,
  });

  if (uncovered.length === 0) {
    return {
      ok: false,
      error: "Não há mês em aberto pra aplicar o crédito agora.",
    };
  }

  const today = new Date().toISOString().slice(0, 10);
  const rows = uncovered.map((referenceMonth) => {
    const already = byMonth.get(referenceMonth) ?? 0;
    const amount = Math.max(fee - already, 0);
    return {
      shop_id: shopId,
      amount_cents: amount > 0 ? amount : fee,
      reference_month: referenceMonth,
      paid_at: today,
      note,
      kind,
      created_by: "userId" in gate ? gate.userId : null,
    };
  });

  const { error } = await admin.from("platform_payments").insert(rows);
  if (error) {
    return { ok: false, error: error.message };
  }

  revalidateFinance(shopId);
  return { ok: true, grantedMonths: uncovered };
}

/** Remove um lançamento de pagamento (correção). */
export async function deletePayment(paymentId: string): Promise<ActionResult> {
  const gate = await requirePlatformAdmin();
  if ("ok" in gate && gate.ok === false) return gate;

  const admin = requireAdminClient();
  if ("ok" in admin) return admin;

  const id = String(paymentId ?? "").trim();
  if (!id) return { ok: false, error: "Pagamento inválido." };

  const { data: existing } = await admin
    .from("platform_payments")
    .select("shop_id")
    .eq("id", id)
    .maybeSingle();

  const { error } = await admin
    .from("platform_payments")
    .delete()
    .eq("id", id);

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidateFinance(existing?.shop_id);
  return { ok: true };
}
