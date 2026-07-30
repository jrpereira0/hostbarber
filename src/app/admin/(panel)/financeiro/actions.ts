"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  closeCashRegister,
  getCashRegisterSession,
  listCashRegisterSessions,
  openCashRegister,
  reopenCashRegister,
  type CashRegisterSession,
} from "@/lib/cash-register-service";
import { payProfessionalCommission } from "@/lib/commission-payout-service";
import { requireAdminClient } from "@/lib/supabase/admin";
import { isActionResult } from "@/lib/is-action-result";
import { getAdminSession } from "@/lib/require-admin";
import { requireOwner } from "@/lib/require-owner";

function revalidateFinance() {
  revalidatePath("/admin");
  revalidatePath("/admin/financeiro");
  revalidatePath("/admin/financeiro/caixas");
  revalidatePath("/admin/financeiro/comissoes");
  revalidatePath("/admin/profissionais", "layout");
}

const serviceDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.");

const openCashRegisterSchema = z.object({
  responsibleName: z.string().trim().min(1, "Informe o responsável pelo caixa."),
  openingBalanceCents: z
    .number()
    .int()
    .min(0, "O valor em dinheiro não pode ser negativo."),
});

export async function loadCashRegisterHistory(
  from: string,
  to: string
): Promise<
  { ok: true; sessions: CashRegisterSession[] } | { ok: false; error: string }
> {
  const denied = await requireOwner();
  if (denied !== null) {
    return denied.ok === false
      ? { ok: false, error: denied.error }
      : { ok: false, error: "Sem permissão." };
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return { ok: false, error: "Período inválido." };
  }

  const auth = await getAdminSession();
  if (!auth) return { ok: false, error: "Você precisa estar logado." };

  const admin = requireAdminClient();
  if (isActionResult(admin)) {
    return { ok: false, error: admin.error };
  }

  const sessions = await listCashRegisterSessions(admin, auth.shopId, from, to);
  return { ok: true, sessions };
}

function parseServiceDate(
  serviceDate: string
): { ok: true; date: string } | { ok: false; error: string } {
  const parsed = serviceDateSchema.safeParse(serviceDate);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }
  return { ok: true, date: parsed.data };
}

export async function openCashRegisterAction(
  serviceDate: string,
  input: { responsibleName: string; openingBalanceCents: number }
): Promise<
  { ok: true; session: CashRegisterSession } | { ok: false; error: string }
> {
  const session = await requireOwner();
  if (session !== null) {
    return session.ok === false
      ? { ok: false, error: session.error }
      : { ok: false, error: "Sem permissão." };
  }

  const dateParsed = parseServiceDate(serviceDate);
  if (!dateParsed.ok) return { ok: false, error: dateParsed.error };

  const parsed = openCashRegisterSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const adminUser = await getAdminSession();
  if (!adminUser) {
    return { ok: false, error: "Você precisa estar logado." };
  }

  const admin = requireAdminClient();
  if (isActionResult(admin)) {
    return { ok: false, error: admin.error };
  }

  const result = await openCashRegister(
    admin,
    adminUser.shopId,
    serviceDate,
    adminUser.userId,
    parsed.data
  );
  if (!result.ok) return { ok: false, error: result.error };

  revalidateFinance();
  return { ok: true, session: result.session };
}

export async function closeCashRegisterAction(
  serviceDate: string
): Promise<
  { ok: true; session: CashRegisterSession } | { ok: false; error: string }
> {
  const session = await requireOwner();
  if (session !== null) {
    return session.ok === false
      ? { ok: false, error: session.error }
      : { ok: false, error: "Sem permissão." };
  }

  const dateParsed = parseServiceDate(serviceDate);
  if (!dateParsed.ok) return { ok: false, error: dateParsed.error };

  const auth = await getAdminSession();
  if (!auth) {
    return { ok: false, error: "Você precisa estar logado." };
  }

  const admin = requireAdminClient();
  if (isActionResult(admin)) {
    return { ok: false, error: admin.error };
  }

  const result = await closeCashRegister(admin, auth.shopId, serviceDate, auth.userId);
  if (!result.ok) return { ok: false, error: result.error };

  revalidateFinance();
  return { ok: true, session: result.session };
}

export async function reopenCashRegisterAction(
  serviceDate: string,
  input: { responsibleName: string; openingBalanceCents: number }
): Promise<
  { ok: true; session: CashRegisterSession } | { ok: false; error: string }
> {
  const session = await requireOwner();
  if (session !== null) {
    return session.ok === false
      ? { ok: false, error: session.error }
      : { ok: false, error: "Sem permissão." };
  }

  const dateParsed = parseServiceDate(serviceDate);
  if (!dateParsed.ok) return { ok: false, error: dateParsed.error };

  const parsed = openCashRegisterSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const auth = await getAdminSession();
  if (!auth) {
    return { ok: false, error: "Você precisa estar logado." };
  }

  const admin = requireAdminClient();
  if (isActionResult(admin)) {
    return { ok: false, error: admin.error };
  }

  const result = await reopenCashRegister(
    admin,
    auth.shopId,
    serviceDate,
    auth.userId,
    parsed.data
  );
  if (!result.ok) return { ok: false, error: result.error };

  revalidateFinance();
  return { ok: true, session: result.session };
}

export async function loadCashRegisterForDate(
  serviceDate: string
): Promise<
  { ok: true; session: CashRegisterSession | null } | { ok: false; error: string }
> {
  const denied = await requireOwner();
  if (denied !== null) {
    return denied.ok === false
      ? { ok: false, error: denied.error }
      : { ok: false, error: "Sem permissão." };
  }

  const dateParsed = parseServiceDate(serviceDate);
  if (!dateParsed.ok) return { ok: false, error: dateParsed.error };

  const auth = await getAdminSession();
  if (!auth) return { ok: false, error: "Você precisa estar logado." };

  const admin = requireAdminClient();
  if (isActionResult(admin)) {
    return { ok: false, error: admin.error };
  }

  const session = await getCashRegisterSession(admin, auth.shopId, serviceDate);
  return { ok: true, session };
}

const commissionPeriodSchema = z.object({
  from: serviceDateSchema,
  to: serviceDateSchema,
  professionalId: z.string().uuid("Barbeiro inválido."),
});

/** Registra o pagamento da comissão em aberto de um barbeiro no período. */
export async function payCommissionAction(input: {
  from: string;
  to: string;
  professionalId: string;
}): Promise<{ ok: true; amountCents: number } | { ok: false; error: string }> {
  const denied = await requireOwner();
  if (denied !== null) {
    return denied.ok === false
      ? { ok: false, error: denied.error }
      : { ok: false, error: "Sem permissão." };
  }

  const auth = await getAdminSession();
  if (!auth) return { ok: false, error: "Faça login novamente." };

  const parsed = commissionPeriodSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const { professionalId } = parsed.data;
  let { from, to } = parsed.data;
  if (from > to) [from, to] = [to, from];

  const admin = requireAdminClient();
  if (isActionResult(admin)) {
    return { ok: false, error: admin.error };
  }

  const result = await payProfessionalCommission(admin, {
    shopId: auth.shopId,
    professionalId,
    from,
    to,
    paidBy: auth.userId,
  });

  if (!result.ok) return { ok: false, error: result.error };

  revalidateFinance();
  return { ok: true, amountCents: result.payout.amountCents };
}
