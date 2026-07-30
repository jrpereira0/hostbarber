"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  calculateComandaTotals,
  CASH_INFLOW_PAYMENT_METHODS,
  PAYMENT_METHODS,
  type ComandaDetail,
  type ComandaItemInput,
  type ComandaPaymentInput,
} from "@/lib/comanda-types";
import {
  closeComanda,
  createWalkInComanda,
  discardEmptyWalkInComanda,
  deleteOpenWalkInComanda,
  getComandaById,
  getComandaForAppointment,
  reopenComanda,
  updateComandaItems,
  type CreditDepositInput,
} from "@/lib/comanda-service";
import { barberCanAccessComanda } from "@/lib/comanda-barber-access";
import {
  canCloseComandaInOpenCashRegister,
  getOpenCashRegisterSessionBasic,
} from "@/lib/cash-register-service";
import { getCustomerCreditBalanceByWhatsapp } from "@/lib/customer-credit-service";
import { requireAdminClient } from "@/lib/supabase/admin";
import { isActionResult } from "@/lib/is-action-result";
import { requireAdmin, canViewAllAgendas } from "@/lib/require-admin";
import type { ActionResult } from "@/lib/require-owner";
import { assertPermission } from "@/lib/professional-permissions";
import { formatTime } from "@/lib/format";
import type { AppointmentItem } from "@/components/admin/appointment-item";
import { parseBookingSource } from "@/lib/booking-source";

const itemSchema = z
  .object({
    id: z.uuid().optional(),
    serviceId: z.uuid().optional(),
    productId: z.uuid().optional(),
    serviceName: z.string().trim().min(1),
    catalogPriceCents: z.number().int().min(0),
    chargedPriceCents: z.number().int().min(0),
    quantity: z.number().int().min(1).optional(),
    commissionPercent: z.number().int().min(0).max(100).optional(),
    appointmentId: z.uuid().optional(),
    professionalId: z.uuid().optional(),
    startTime: z.preprocess((value) => {
      if (value == null || value === "") return undefined;
      if (typeof value === "string") return value.trim().slice(0, 5);
      return value;
    }, z.string().regex(/^\d{2}:\d{2}$/, "Horário inválido.").optional()),
    isComandaExtra: z.boolean().optional(),
    isTip: z.boolean().optional(),
  })
  .superRefine((item, ctx) => {
    if (item.isTip) {
      if (!item.professionalId) {
        ctx.addIssue({
          code: "custom",
          message: "Escolha o barbeiro da gorjeta.",
          path: ["professionalId"],
        });
      }
      return;
    }
    if (item.productId) {
      // Profissional opcional — sem barbeiro a venda fica só da barbearia.
      return;
    }
    if (!item.serviceId) {
      ctx.addIssue({
        code: "custom",
        message: "Serviço inválido.",
        path: ["serviceId"],
      });
    }
  });

const paymentSchema = z.object({
  paymentMethod: z.enum(PAYMENT_METHODS),
  amountCents: z.number().int().positive(),
});

const creditDepositSchema = z.object({
  amountCents: z.number().int().positive(),
  paymentMethod: z.enum(CASH_INFLOW_PAYMENT_METHODS),
});

async function assertBarberComandaAccess(
  comandaId: string,
  session: Awaited<ReturnType<typeof requireAdmin>>
): Promise<ActionResult | null> {
  if (!("userId" in session)) return null;

  const admin = requireAdminClient();
  if (isActionResult(admin)) return admin;

  if (canViewAllAgendas(session)) {
    // Dono/recepção enxergam tudo da própria loja — mas não de outra.
    const { data } = await admin
      .from("comandas")
      .select("id")
      .eq("id", comandaId)
      .eq("shop_id", session.shopId)
      .maybeSingle();
    if (!data) {
      return { ok: false, error: "Comanda não encontrada." };
    }
    return null;
  }

  if (!session.professionalId) {
    return { ok: false, error: "Você não pode alterar esta comanda." };
  }

  // Leitura leve — sem hidratar ComandaDetail completo.
  const { data } = await admin
    .from("comandas")
    .select(
      `
      id,
      professional_id,
      comanda_items ( professional_id ),
      comanda_appointments (
        appointments ( professional_id )
      )
    `
    )
    .eq("id", comandaId)
    .eq("shop_id", session.shopId)
    .maybeSingle();

  if (!data) {
    return { ok: false, error: "Comanda não encontrada." };
  }

  const proId = session.professionalId;
  const itemPros = (data.comanda_items ?? []) as {
    professional_id: string | null;
  }[];
  const linkPros = (data.comanda_appointments ?? []) as {
    appointments:
      | { professional_id: string }
      | { professional_id: string }[]
      | null;
  }[];

  const hasAccess =
    data.professional_id === proId ||
    itemPros.some((item) => item.professional_id === proId) ||
    linkPros.some((link) => {
      const apt = Array.isArray(link.appointments)
        ? link.appointments[0]
        : link.appointments;
      return apt?.professional_id === proId;
    });

  if (!hasAccess) {
    return { ok: false, error: "Você não pode alterar esta comanda." };
  }

  return null;
}

export async function loadComandaForAppointment(
  appointmentId: string,
  customerWhatsappHint?: string
): Promise<
  | {
      ok: true;
      comanda: ComandaDetail;
      isOwner: boolean;
      canManageAllAgendas: boolean;
      cashRegisterOpen: boolean;
      openCashRegisterDate: string | null;
      customerCreditBalanceCents: number;
    }
  | { ok: false; error: string }
> {
  const session = await requireAdmin();
  if (!("userId" in session)) {
    return { ok: false, error: "error" in session ? session.error : "Erro." };
  }

  const admin = requireAdminClient();
  if (isActionResult(admin)) {
    return { ok: false, error: admin.error };
  }

  const creditPromise = customerWhatsappHint
    ? getCustomerCreditBalanceByWhatsapp(admin, session.shopId, customerWhatsappHint)
    : null;

  const [result, openCashRegister] = await Promise.all([
    getComandaForAppointment(admin, appointmentId, session.shopId),
    getOpenCashRegisterSessionBasic(admin, session.shopId),
  ]);
  if (!result.ok) return { ok: false, error: result.error };

  if (!canViewAllAgendas(session)) {
    if (!session.professionalId) {
      return { ok: false, error: "Você não pode ver esta comanda." };
    }
    if (!session.permissions.canOpenComanda) {
      return { ok: false, error: "Você não pode abrir comandas." };
    }
    if (!barberCanAccessComanda(result.comanda, session.professionalId)) {
      return { ok: false, error: "Você não pode ver esta comanda." };
    }
  }

  const customerCreditBalanceCents = creditPromise
    ? await creditPromise
    : result.comanda.customerWhatsapp
      ? await getCustomerCreditBalanceByWhatsapp(
          admin,
          session.shopId,
          result.comanda.customerWhatsapp
        )
      : 0;

  return {
    ok: true,
    comanda: result.comanda,
    isOwner: session.isOwner,
    canManageAllAgendas: canViewAllAgendas(session),
    cashRegisterOpen: await canCloseComandaInOpenCashRegister(
      admin,
      session.shopId,
      result.comanda.serviceDate,
      openCashRegister
    ),
    openCashRegisterDate: openCashRegister?.serviceDate ?? null,
    customerCreditBalanceCents,
  };
}

export async function loadComandaById(
  comandaId: string
): Promise<
  | {
      ok: true;
      comanda: ComandaDetail;
      isOwner: boolean;
      canManageAllAgendas: boolean;
      cashRegisterOpen: boolean;
      openCashRegisterDate: string | null;
      customerCreditBalanceCents: number;
    }
  | { ok: false; error: string }
> {
  const session = await requireAdmin();
  if (!("userId" in session)) {
    return { ok: false, error: "error" in session ? session.error : "Erro." };
  }

  const admin = requireAdminClient();
  if (isActionResult(admin)) {
    return { ok: false, error: admin.error };
  }

  const [result, openCashRegister] = await Promise.all([
    getComandaById(admin, comandaId, { sync: false }),
    getOpenCashRegisterSessionBasic(admin, session.shopId),
  ]);
  if (!result.ok) return { ok: false, error: result.error };

  if (result.comanda.shopId !== session.shopId) {
    return { ok: false, error: "Comanda não encontrada." };
  }

  if (!canViewAllAgendas(session)) {
    if (!session.professionalId) {
      return { ok: false, error: "Você não pode ver esta comanda." };
    }
    if (!session.permissions.canOpenComanda) {
      return { ok: false, error: "Você não pode abrir comandas." };
    }
    if (!barberCanAccessComanda(result.comanda, session.professionalId)) {
      return { ok: false, error: "Você não pode ver esta comanda." };
    }
  }

  return {
    ok: true,
    comanda: result.comanda,
    isOwner: session.isOwner,
    canManageAllAgendas: canViewAllAgendas(session),
    cashRegisterOpen: await canCloseComandaInOpenCashRegister(
      admin,
      session.shopId,
      result.comanda.serviceDate,
      openCashRegister
    ),
    openCashRegisterDate: openCashRegister?.serviceDate ?? null,
    customerCreditBalanceCents: result.comanda.customerWhatsapp
      ? await getCustomerCreditBalanceByWhatsapp(
          admin,
          session.shopId,
          result.comanda.customerWhatsapp
        )
      : 0,
  };
}

/** Abre uma comanda de venda rápida (sem cliente / sem horário). */
export async function startWalkInComanda(
  serviceDate: string
): Promise<
  | {
      ok: true;
      comanda: ComandaDetail;
      isOwner: boolean;
      canManageAllAgendas: boolean;
      cashRegisterOpen: boolean;
      openCashRegisterDate: string | null;
      customerCreditBalanceCents: number;
    }
  | { ok: false; error: string }
> {
  const session = await requireAdmin();
  if (!("userId" in session)) {
    return { ok: false, error: "error" in session ? session.error : "Erro." };
  }

  const denied = assertPermission(session, "canOpenComanda");
  if (denied && !denied.ok) return { ok: false, error: denied.error };

  if (!canViewAllAgendas(session)) {
    return { ok: false, error: "Só o dono ou a recepção podem fazer venda rápida." };
  }

  const admin = requireAdminClient();
  if (isActionResult(admin)) {
    return { ok: false, error: admin.error };
  }

  const [created, openCashRegister] = await Promise.all([
    createWalkInComanda(admin, session.shopId, serviceDate),
    getOpenCashRegisterSessionBasic(admin, session.shopId),
  ]);
  if (!created.ok) return { ok: false, error: created.error };

  revalidatePath("/admin");

  return {
    ok: true,
    comanda: created.comanda,
    isOwner: session.isOwner,
    canManageAllAgendas: canViewAllAgendas(session),
    cashRegisterOpen: await canCloseComandaInOpenCashRegister(
      admin,
      session.shopId,
      created.comanda.serviceDate,
      openCashRegister
    ),
    openCashRegisterDate: openCashRegister?.serviceDate ?? null,
    customerCreditBalanceCents: 0,
  };
}

/** Remove venda rápida aberta e vazia ao fechar a janela sem finalizar. */
export async function discardEmptyWalkInComandaAction(
  comandaId: string
): Promise<{ ok: true; discarded: boolean } | { ok: false; error: string }> {
  const session = await requireAdmin();
  if (!("userId" in session)) {
    return { ok: false, error: "error" in session ? session.error : "Erro." };
  }

  const denied = assertPermission(session, "canOpenComanda");
  if (denied && !denied.ok) return { ok: false, error: denied.error };

  const admin = requireAdminClient();
  if (isActionResult(admin)) {
    return { ok: false, error: admin.error };
  }

  const accessDenied = await assertBarberComandaAccess(comandaId, session);
  if (accessDenied && !accessDenied.ok) {
    return { ok: false, error: accessDenied.error };
  }

  return discardEmptyWalkInComanda(admin, comandaId);
}

/** Exclui venda rápida aberta (com produtos, ainda sem finalizar). */
export async function deleteOpenWalkInComandaAction(
  comandaId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await requireAdmin();
  if (!("userId" in session)) {
    return { ok: false, error: "error" in session ? session.error : "Erro." };
  }

  const denied = assertPermission(session, "canOpenComanda");
  if (denied && !denied.ok) return { ok: false, error: denied.error };

  const admin = requireAdminClient();
  if (isActionResult(admin)) {
    return { ok: false, error: admin.error };
  }

  const accessDenied = await assertBarberComandaAccess(comandaId, session);
  if (accessDenied && !accessDenied.ok) {
    return { ok: false, error: accessDenied.error };
  }

  const result = await deleteOpenWalkInComanda(admin, comandaId);
  if (!result.ok) return result;

  revalidatePath("/admin");
  revalidatePath("/admin/financeiro");
  return { ok: true };
}

export async function saveComandaItems(
  comandaId: string,
  items: ComandaItemInput[]
): Promise<
  { ok: true; comanda: ComandaDetail } | { ok: false; error: string }
> {
  const session = await requireAdmin();
  if (!("userId" in session)) {
    return { ok: false, error: "error" in session ? session.error : "Erro." };
  }

  const denied = assertPermission(session, "canEditComanda");
  if (denied && !denied.ok) return { ok: false, error: denied.error };

  const parsed = z.array(itemSchema).safeParse(items);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const admin = requireAdminClient();
  if (isActionResult(admin)) {
    return { ok: false, error: admin.error };
  }

  const accessDenied = await assertBarberComandaAccess(comandaId, session);
  if (accessDenied && !accessDenied.ok) {
    return { ok: false, error: accessDenied.error };
  }

  const result = await updateComandaItems(admin, comandaId, parsed.data);
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath("/admin");
  return { ok: true, comanda: result.comanda };
}

export async function closeComandaWithItemsAction(
  comandaId: string,
  items: ComandaItemInput[],
  payments: ComandaPaymentInput[],
  options?: {
    creditDeposits?: CreditDepositInput[];
    /** Itens iguais ao último load — pula regravação pesada. */
    skipItemsUpdate?: boolean;
  }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await requireAdmin();
  if (!("userId" in session)) {
    return { ok: false, error: "error" in session ? session.error : "Erro." };
  }
  if (!session.isOwner) {
    const denied = assertPermission(session, "canCloseComanda");
    if (denied && !denied.ok) return { ok: false, error: denied.error };
  }

  const parsedItems = z.array(itemSchema).safeParse(items);
  if (!parsedItems.success) {
    return { ok: false, error: parsedItems.error.issues[0].message };
  }

  const billableItems = parsedItems.data.filter((item) => !item.isTip);
  if (billableItems.length === 0) {
    return {
      ok: false,
      error: "Informe ao menos um serviço ou produto na comanda.",
    };
  }

  const parsedPayments = z.array(paymentSchema).min(1).safeParse(payments);
  if (!parsedPayments.success) {
    return { ok: false, error: parsedPayments.error.issues[0].message };
  }

  const parsedCreditDeposits = z
    .array(creditDepositSchema)
    .optional()
    .safeParse(options?.creditDeposits);
  if (!parsedCreditDeposits.success) {
    return { ok: false, error: parsedCreditDeposits.error.issues[0].message };
  }

  const admin = requireAdminClient();
  if (isActionResult(admin)) {
    return { ok: false, error: admin.error };
  }

  const accessDenied = await assertBarberComandaAccess(comandaId, session);
  if (accessDenied && !accessDenied.ok) {
    return { ok: false, error: accessDenied.error };
  }

  try {
    let prefetched: ComandaDetail | undefined;

    if (!options?.skipItemsUpdate) {
      const itemsResult = await updateComandaItems(
        admin,
        comandaId,
        parsedItems.data,
        { skipAgendaSync: true, returnDetail: false }
      );
      if (!itemsResult.ok) return { ok: false, error: itemsResult.error };
      prefetched = itemsResult.comanda;
    }

    const closeResult = await closeComanda(
      admin,
      comandaId,
      parsedPayments.data,
      session.userId,
      {
        creditDeposits: parsedCreditDeposits.data,
        skipScrub: true,
        returnDetail: false,
        prefetched,
      }
    );
    if (!closeResult.ok) return { ok: false, error: closeResult.error };

    after(() => {
      revalidatePath("/admin");
      revalidatePath("/admin/financeiro");
    });
    return { ok: true };
  } catch {
    return {
      ok: false,
      error:
        "Não foi possível finalizar a comanda. Verifique a internet e tente de novo.",
    };
  }
}

export async function closeComandaAction(
  comandaId: string,
  payments: ComandaPaymentInput[]
): Promise<
  { ok: true; comanda: ComandaDetail } | { ok: false; error: string }
> {
  const session = await requireAdmin();
  if (!("userId" in session)) {
    return { ok: false, error: "error" in session ? session.error : "Erro." };
  }
  if (!session.isOwner) {
    const denied = assertPermission(session, "canCloseComanda");
    if (denied && !denied.ok) return { ok: false, error: denied.error };
  }

  const parsed = z.array(paymentSchema).min(1).safeParse(payments);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const admin = requireAdminClient();
  if (isActionResult(admin)) {
    return { ok: false, error: admin.error };
  }

  const accessDenied = await assertBarberComandaAccess(comandaId, session);
  if (accessDenied && !accessDenied.ok) {
    return { ok: false, error: accessDenied.error };
  }

  const result = await closeComanda(
    admin,
    comandaId,
    parsed.data,
    session.userId
  );
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath("/admin");
  revalidatePath("/admin/financeiro");
  return { ok: true, comanda: result.comanda };
}

export async function reopenComandaAction(
  comandaId: string,
  options?: { confirmCreditShortfall?: boolean }
): Promise<
  | { ok: true; comanda: ComandaDetail }
  | {
      ok: false;
      error: string;
      code?: "credit_shortfall";
      shortfallCents?: number;
    }
> {
  try {
    const session = await requireAdmin();
    if (!("userId" in session)) {
      return {
        ok: false,
        error: "error" in session ? session.error : "Erro.",
      };
    }
    if (!session.isOwner) {
      return { ok: false, error: "Apenas o dono pode reabrir comandas." };
    }

    const admin = requireAdminClient();
    if (isActionResult(admin)) {
      return { ok: false, error: admin.error };
    }

    const { data: comandaRow } = await admin
      .from("comandas")
      .select("id")
      .eq("id", comandaId)
      .eq("shop_id", session.shopId)
      .maybeSingle();
    if (!comandaRow) {
      return { ok: false, error: "Comanda não encontrada." };
    }

    const result = await reopenComanda(admin, comandaId, options);
    if (!result.ok) {
      return {
        ok: false,
        error: result.error,
        code: result.code,
        shortfallCents: result.shortfallCents,
      };
    }

    revalidatePath("/admin");
    revalidatePath("/admin/financeiro");
    revalidatePath("/admin/clientes");
    return { ok: true, comanda: result.comanda };
  } catch {
    return {
      ok: false,
      error:
        "Não foi possível reabrir a comanda. Verifique a internet e tente de novo.",
    };
  }
}

export async function previewComandaTotals(
  professionalId: string,
  items: Pick<ComandaItemInput, "chargedPriceCents">[]
): Promise<{ totalCents: number; commissionCents: number } | null> {
  const session = await requireAdmin();
  if (!("userId" in session)) return null;

  if (!canViewAllAgendas(session) && session.professionalId !== professionalId) {
    return null;
  }

  const admin = requireAdminClient();
  if (isActionResult(admin)) return null;

  const { data } = await admin
    .from("professionals")
    .select("commission_percent")
    .eq("id", professionalId)
    .eq("shop_id", session.shopId)
    .maybeSingle();

  return calculateComandaTotals(items, data?.commission_percent ?? 50);
}

/** Carrega o agendamento no formato da agenda para abrir a comanda fora dela. */
export async function loadAppointmentItemAction(
  appointmentId: string
): Promise<
  | { ok: true; appointment: AppointmentItem }
  | { ok: false; error: string }
> {
  const session = await requireAdmin();
  if (!("userId" in session)) {
    return { ok: false, error: "error" in session ? session.error : "Erro." };
  }

  const admin = requireAdminClient();
  if (isActionResult(admin)) {
    return { ok: false, error: admin.error };
  }

  if (!z.uuid().safeParse(appointmentId).success) {
    return { ok: false, error: "Agendamento inválido." };
  }

  const { data, error } = await admin
    .from("appointments")
    .select(
      `
      id,
      date,
      professional_id,
      customer_id,
      customer_first_name,
      customer_last_name,
      customer_whatsapp,
      start_time,
      end_time,
      status,
      is_squeeze_in,
      is_comanda_extra,
      booking_source,
      customers ( credit_balance_cents ),
      professionals ( nickname ),
      appointment_services (
        quantity,
        services ( id, name, duration_minutes, price_cents )
      )
    `
    )
    .eq("id", appointmentId)
    .eq("shop_id", session.shopId)
    .maybeSingle();

  if (error || !data) {
    return { ok: false, error: "Agendamento não encontrado." };
  }

  if (!canViewAllAgendas(session)) {
    if (!session.professionalId) {
      return { ok: false, error: "Você não pode ver esta comanda." };
    }
    if (data.professional_id !== session.professionalId) {
      return { ok: false, error: "Você não pode ver esta comanda." };
    }
  }

  const rawPro = data.professionals as
    | { nickname: string }
    | { nickname: string }[]
    | null;
  const professionalNickname = Array.isArray(rawPro)
    ? (rawPro[0]?.nickname ?? "—")
    : (rawPro?.nickname ?? "—");

  const rawCustomer = data.customers as
    | { credit_balance_cents?: number | null }
    | null;

  const appointment: AppointmentItem = {
    id: data.id,
    date: data.date,
    professionalId: data.professional_id,
    professionalNickname,
    customerId: data.customer_id ?? null,
    customerCreditBalanceCents:
      typeof rawCustomer?.credit_balance_cents === "number"
        ? rawCustomer.credit_balance_cents
        : 0,
    customerFirstName: data.customer_first_name,
    customerLastName: data.customer_last_name,
    customerWhatsapp: data.customer_whatsapp,
    startTime: formatTime(data.start_time),
    endTime: formatTime(data.end_time),
    status: data.status as AppointmentItem["status"],
    isSqueezeIn: data.is_squeeze_in ?? false,
    isComandaExtra: data.is_comanda_extra ?? false,
    bookingSource: parseBookingSource(data.booking_source),
    services: (data.appointment_services ?? []).flatMap((row) => {
      const quantity = Math.max(1, row.quantity ?? 1);
      const raw = row.services as
        | {
            id: string;
            name: string;
            duration_minutes: number;
            price_cents: number;
          }
        | {
            id: string;
            name: string;
            duration_minutes: number;
            price_cents: number;
          }[]
        | null;
      const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
      return Array.from({ length: quantity }, () =>
        list.map((s) => ({
          id: s.id,
          name: s.name,
          durationMinutes: s.duration_minutes,
          priceCents: s.price_cents,
        }))
      ).flat();
    }),
  };

  return { ok: true, appointment };
}
