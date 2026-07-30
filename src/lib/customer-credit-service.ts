import type { SupabaseClient } from "@supabase/supabase-js";
import type { CashInflowPaymentMethod } from "@/lib/comanda-types";
import { formatPriceBRL } from "@/lib/format";

type CreditTxRow = {
  id: string;
  customer_id: string;
  amount_cents: number;
  type: "add" | "use";
};

function sortTransactionsForReversal(
  transactions: CreditTxRow[]
): CreditTxRow[] {
  return [...transactions].sort((a, b) => {
    if (a.type === "use" && b.type === "add") return -1;
    if (a.type === "add" && b.type === "use") return 1;
    return 0;
  });
}

export type CreditReverseCheckResult =
  | { ok: true }
  | {
      ok: false;
      error: string;
      code?: "credit_shortfall";
      shortfallCents?: number;
    };

export async function canReverseComandaCreditTransactions(
  admin: SupabaseClient,
  comandaId: string
): Promise<CreditReverseCheckResult> {
  const { data: transactions } = await admin
    .from("customer_credit_transactions")
    .select("id, customer_id, amount_cents, type")
    .eq("comanda_id", comandaId);

  if (!transactions?.length) return { ok: true };

  const balanceByCustomer = new Map<string, number>();

  for (const tx of transactions) {
    if (!balanceByCustomer.has(tx.customer_id)) {
      const { data: customer } = await admin
        .from("customers")
        .select("credit_balance_cents")
        .eq("id", tx.customer_id)
        .maybeSingle();

      if (!customer) {
        return { ok: false, error: "Cliente não encontrado para estornar o crédito." };
      }

      balanceByCustomer.set(tx.customer_id, customer.credit_balance_cents);
    }
  }

  for (const tx of sortTransactionsForReversal(transactions)) {
    const balance = balanceByCustomer.get(tx.customer_id) ?? 0;
    const nextBalance = balance - tx.amount_cents;

    if (nextBalance < 0) {
      const shortfallCents = tx.amount_cents - balance;
      return {
        ok: false,
        code: tx.type === "add" ? "credit_shortfall" : undefined,
        shortfallCents: tx.type === "add" ? shortfallCents : undefined,
        error:
          tx.type === "add"
            ? `O cliente já usou ${formatPriceBRL(shortfallCents)} deste crédito em outro lugar.`
            : "Saldo de crédito inconsistente para reabrir esta comanda.",
      };
    }

    balanceByCustomer.set(tx.customer_id, nextBalance);
  }

  return { ok: true };
}

export async function getCustomerCreditBalance(
  admin: SupabaseClient,
  customerId: string
): Promise<number> {
  const { data } = await admin
    .from("customers")
    .select("credit_balance_cents")
    .eq("id", customerId)
    .maybeSingle();

  return data?.credit_balance_cents ?? 0;
}

export async function getCustomerCreditBalanceByWhatsapp(
  admin: SupabaseClient,
  shopId: string,
  whatsapp: string
): Promise<number> {
  const { data } = await admin
    .from("customers")
    .select("credit_balance_cents")
    .eq("shop_id", shopId)
    .eq("whatsapp", whatsapp)
    .maybeSingle();

  return data?.credit_balance_cents ?? 0;
}

export async function resolveCustomerIdByWhatsapp(
  admin: SupabaseClient,
  shopId: string,
  whatsapp: string
): Promise<string | null> {
  const { data } = await admin
    .from("customers")
    .select("id")
    .eq("shop_id", shopId)
    .eq("whatsapp", whatsapp)
    .maybeSingle();

  return data?.id ?? null;
}

async function applyCreditDelta(
  admin: SupabaseClient,
  customerId: string,
  deltaCents: number
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: customer } = await admin
    .from("customers")
    .select("credit_balance_cents")
    .eq("id", customerId)
    .maybeSingle();

  if (!customer) {
    return { ok: false, error: "Cliente não encontrado." };
  }

  const nextBalance = customer.credit_balance_cents + deltaCents;
  if (nextBalance < 0) {
    return { ok: false, error: "Saldo de crédito insuficiente." };
  }

  const { error } = await admin
    .from("customers")
    .update({
      credit_balance_cents: nextBalance,
      updated_at: new Date().toISOString(),
    })
    .eq("id", customerId);

  if (error) {
    return { ok: false, error: "Não foi possível atualizar o saldo de crédito." };
  }

  return { ok: true };
}

export async function addCustomerCredit(
  admin: SupabaseClient,
  input: {
    customerId: string;
    amountCents: number;
    paymentMethod?: CashInflowPaymentMethod | null;
    comandaId?: string | null;
    description?: string | null;
    cashRegisterSessionId?: string | null;
    createdBy?: string | null;
  }
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (input.amountCents <= 0) {
    return { ok: false, error: "Valor de crédito inválido." };
  }

  if (input.cashRegisterSessionId && !input.paymentMethod) {
    return {
      ok: false,
      error: "Informe a forma de pagamento do depósito de crédito.",
    };
  }

  const { error: txError } = await admin
    .from("customer_credit_transactions")
    .insert({
      customer_id: input.customerId,
      amount_cents: input.amountCents,
      type: "add",
      payment_method: input.paymentMethod ?? null,
      description: input.description ?? null,
      comanda_id: input.comandaId ?? null,
      cash_register_session_id: input.cashRegisterSessionId ?? null,
      created_by: input.createdBy ?? null,
    });

  if (txError) {
    return { ok: false, error: "Não foi possível registrar o crédito." };
  }

  return applyCreditDelta(admin, input.customerId, input.amountCents);
}

export async function deductCustomerCredit(
  admin: SupabaseClient,
  input: {
    customerId: string;
    amountCents: number;
    comandaId?: string | null;
    description?: string | null;
    createdBy?: string | null;
  }
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (input.amountCents <= 0) {
    return { ok: false, error: "Valor de crédito inválido." };
  }

  const { error: txError } = await admin
    .from("customer_credit_transactions")
    .insert({
      customer_id: input.customerId,
      amount_cents: -input.amountCents,
      type: "use",
      description: input.description ?? null,
      comanda_id: input.comandaId ?? null,
      created_by: input.createdBy ?? null,
    });

  if (txError) {
    return { ok: false, error: "Não foi possível usar o crédito." };
  }

  return applyCreditDelta(admin, input.customerId, -input.amountCents);
}

async function rollbackCreditDeltas(
  admin: SupabaseClient,
  appliedDeltas: Array<{ customerId: string; deltaCents: number }>
): Promise<void> {
  for (const applied of [...appliedDeltas].reverse()) {
    await applyCreditDelta(admin, applied.customerId, -applied.deltaCents);
  }
}

/**
 * Estorna movimentos de crédito da comanda.
 * - `use` (pagamento com crédito): sempre devolve o valor inteiro ao saldo.
 * - `add` (crédito gerado no fechamento): remove do saldo; com `allowShortfall`,
 *   só o que ainda existir (crédito já gasto em outro lugar não volta).
 * Se houver pagamento `store_credit` sem movimentação `use` correspondente,
 * o valor pago é devolvido ao saldo mesmo assim.
 */
export async function reverseComandaCreditTransactions(
  admin: SupabaseClient,
  comandaId: string,
  options?: { allowShortfall?: boolean; customerId?: string | null }
): Promise<CreditReverseCheckResult> {
  const canReverse = await canReverseComandaCreditTransactions(admin, comandaId);
  if (!canReverse.ok) {
    if (!(options?.allowShortfall && canReverse.code === "credit_shortfall")) {
      return canReverse;
    }
  }

  const [{ data: transactions }, { data: payments }] = await Promise.all([
    admin
      .from("customer_credit_transactions")
      .select("id, customer_id, amount_cents, type")
      .eq("comanda_id", comandaId),
    admin
      .from("comanda_payments")
      .select("amount_cents, payment_method")
      .eq("comanda_id", comandaId),
  ]);

  const storeCreditPaidCents = (payments ?? [])
    .filter((payment) => payment.payment_method === "store_credit")
    .reduce((sum, payment) => sum + payment.amount_cents, 0);

  if (!transactions?.length && storeCreditPaidCents <= 0) {
    return { ok: true };
  }

  const appliedDeltas: Array<{ customerId: string; deltaCents: number }> = [];
  let restoredUseCents = 0;
  let customerId =
    options?.customerId ??
    transactions?.[0]?.customer_id ??
    null;

  for (const tx of sortTransactionsForReversal(transactions ?? [])) {
    customerId = customerId ?? tx.customer_id;
    let deltaCents = -tx.amount_cents;

    if (tx.type === "use") {
      // Pagamento com crédito: sempre devolve o valor integral.
      deltaCents = -tx.amount_cents;
    } else if (options?.allowShortfall && deltaCents < 0) {
      // Crédito gerado nesta comanda: estorna só o que ainda sobrou no saldo.
      const balance = await getCustomerCreditBalance(admin, tx.customer_id);
      deltaCents = -Math.min(balance, -deltaCents);
    }

    if (deltaCents !== 0) {
      const balanceResult = await applyCreditDelta(
        admin,
        tx.customer_id,
        deltaCents
      );
      if (!balanceResult.ok) {
        await rollbackCreditDeltas(admin, appliedDeltas);
        return {
          ok: false,
          error:
            "Não foi possível estornar o crédito desta comanda. Tente de novo.",
        };
      }
      appliedDeltas.push({ customerId: tx.customer_id, deltaCents });
      if (tx.type === "use") {
        restoredUseCents += deltaCents;
      }
    }

    const { error: deleteError } = await admin
      .from("customer_credit_transactions")
      .delete()
      .eq("id", tx.id);

    if (deleteError) {
      await rollbackCreditDeltas(admin, appliedDeltas);
      return {
        ok: false,
        error: "Não foi possível estornar o crédito desta comanda.",
      };
    }
  }

  // Fallback: pagamento com crédito registrado na comanda sem `use` no histórico.
  const missingStoreCreditCents = storeCreditPaidCents - restoredUseCents;
  if (missingStoreCreditCents > 0) {
    if (!customerId) {
      await rollbackCreditDeltas(admin, appliedDeltas);
      return {
        ok: false,
        error: "Cliente não encontrado para devolver o crédito do pagamento.",
      };
    }

    const balanceResult = await applyCreditDelta(
      admin,
      customerId,
      missingStoreCreditCents
    );
    if (!balanceResult.ok) {
      await rollbackCreditDeltas(admin, appliedDeltas);
      return {
        ok: false,
        error: "Não foi possível devolver o crédito usado no pagamento.",
      };
    }
  }

  return { ok: true };
}
