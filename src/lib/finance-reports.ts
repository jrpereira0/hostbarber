import type { SupabaseClient } from "@supabase/supabase-js";
import { weekdayOf } from "@/lib/availability";
import { WEEKDAYS } from "@/lib/format";
import {
  calculateItemCommissionCents,
  CASH_INFLOW_PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHODS,
  type CashInflowPaymentMethod,
  type PaymentMethod,
} from "@/lib/comanda-types";
import { loadPaidComandaItemIds } from "@/lib/commission-payout-service";
import {
  getProductSalesReport,
  type ProductSalesReport,
} from "@/lib/product-sales-report";

export type CashRegisterOpenComanda = {
  id: string;
  appointmentId: string | null;
  serviceDate: string;
  totalCents: number;
  itemCount: number;
  itemPreview: string;
  customerName: string;
  isWalkIn: boolean;
};

export type CashRegisterSummary = {
  from: string;
  to: string;
  totalCents: number;
  commissionCents: number;
  shopCents: number;
  byPaymentMethod: Record<PaymentMethod, number>;
  creditDepositsByMethod: Record<CashInflowPaymentMethod, number>;
  creditDepositsByDay: Record<string, number>;
  creditDepositsCents: number;
  cashInflowCents: number;
  comandaCount: number;
  comandas: {
    id: string;
    appointmentId: string | null;
    serviceDate: string;
    closedAt: string;
    professionalNickname: string;
    customerName: string;
    totalCents: number;
    commissionCents: number;
    payments: { method: PaymentMethod; amountCents: number }[];
  }[];
  /** Comandas abertas do dia (venda rápida ou horário), ainda não finalizadas. */
  openComandas: CashRegisterOpenComanda[];
};

export type CommissionSummaryRow = {
  professionalId: string;
  professionalNickname: string;
  commissionPercent: number;
  comandaCount: number;
  /** Soma dos itens do barbeiro (serviços + gorjetas dele). */
  totalCents: number;
  commissionCents: number;
  shopCents: number;
  tipCents: number;
  serviceItemCount: number;
};

export type CommissionSummary = {
  from: string;
  to: string;
  rows: CommissionSummaryRow[];
  totals: {
    totalCents: number;
    commissionCents: number;
    shopCents: number;
    comandaCount: number;
    serviceItemCount: number;
  };
};

function applyCreditDepositRow(
  row: {
    amount_cents: number;
    payment_method: string | null;
    comanda_id: string | null;
  },
  creditDepositsByMethod: Record<CashInflowPaymentMethod, number>,
  creditDepositsByDay: Map<string, number>,
  comandaDateById: Map<string, string>
): void {
  const method = row.payment_method as CashInflowPaymentMethod | null;
  if (!method || !(method in creditDepositsByMethod)) return;

  creditDepositsByMethod[method] += row.amount_cents;

  if (!row.comanda_id) return;
  const serviceDate = comandaDateById.get(row.comanda_id);
  if (!serviceDate) return;

  creditDepositsByDay.set(
    serviceDate,
    (creditDepositsByDay.get(serviceDate) ?? 0) + row.amount_cents
  );
}

async function loadCreditDepositsForPeriod(
  admin: SupabaseClient,
  params: {
    shopId: string;
    from: string;
    to: string;
    cashRegisterSessionId?: string;
    comandaDateById: Map<string, string>;
  }
): Promise<{
  byMethod: Record<CashInflowPaymentMethod, number>;
  byDay: Map<string, number>;
}> {
  const byMethod = emptyCashInflowMap();
  const byDay = new Map<string, number>();

  if (params.cashRegisterSessionId) {
    const { data } = await admin
      .from("customer_credit_transactions")
      .select(
        "amount_cents, payment_method, comanda_id, comandas!inner ( service_date, shop_id )"
      )
      .eq("type", "add")
      .eq("cash_register_session_id", params.cashRegisterSessionId)
      .eq("comandas.shop_id", params.shopId);

    for (const row of data ?? []) {
      const comanda = Array.isArray(row.comandas)
        ? row.comandas[0]
        : row.comandas;
      if (row.comanda_id && comanda?.service_date) {
        params.comandaDateById.set(row.comanda_id, comanda.service_date);
      }
      applyCreditDepositRow(row, byMethod, byDay, params.comandaDateById);
    }

    return { byMethod, byDay };
  }

  const { data } = await admin
    .from("customer_credit_transactions")
    .select(
      "amount_cents, payment_method, comanda_id, comandas!inner ( service_date, shop_id )"
    )
    .eq("type", "add")
    .not("cash_register_session_id", "is", null)
    .eq("comandas.shop_id", params.shopId)
    .gte("comandas.service_date", params.from)
    .lte("comandas.service_date", params.to);

  for (const row of data ?? []) {
    const comanda = Array.isArray(row.comandas)
      ? row.comandas[0]
      : row.comandas;
    if (row.comanda_id && comanda?.service_date) {
      params.comandaDateById.set(row.comanda_id, comanda.service_date);
    }
    applyCreditDepositRow(row, byMethod, byDay, params.comandaDateById);
  }

  return { byMethod, byDay };
}

export async function getFinancePeriodSummary(
  admin: SupabaseClient,
  shopId: string,
  from: string,
  to: string,
  options: { cashRegisterSessionId?: string } = {}
): Promise<CashRegisterSummary> {
  let query = admin
    .from("comandas")
    .select(
      `
      id,
      appointment_id,
      service_date,
      closed_at,
      total_cents,
      commission_cents,
      customer_whatsapp,
      professionals ( nickname ),
      appointments (
        customer_first_name,
        customer_last_name
      ),
      comanda_payments ( payment_method, amount_cents )
    `
    )
    .eq("shop_id", shopId)
    .eq("status", "closed")
    .gte("service_date", from)
    .lte("service_date", to)
    .order("service_date", { ascending: true })
    .order("closed_at", { ascending: true });

  if (options.cashRegisterSessionId) {
    query = query.eq(
      "cash_register_session_id",
      options.cashRegisterSessionId
    );
  }

  const { data } = await query;

  const byPaymentMethod = emptyPaymentMap();

  let totalCents = 0;
  let commissionCents = 0;

  const comandas = (data ?? []).map((row) => {
    totalCents += row.total_cents;
    commissionCents += row.commission_cents;

    const payments = (row.comanda_payments ?? []).map((p) => {
      const method = p.payment_method as PaymentMethod;
      if (method in byPaymentMethod) {
        byPaymentMethod[method] += p.amount_cents;
      }
      return { method, amountCents: p.amount_cents };
    });

    const apt = Array.isArray(row.appointments)
      ? row.appointments[0]
      : row.appointments;
    const pro = Array.isArray(row.professionals)
      ? row.professionals[0]
      : row.professionals;

    return {
      id: row.id,
      appointmentId: row.appointment_id ?? null,
      serviceDate: row.service_date as string,
      closedAt: row.closed_at as string,
      professionalNickname: pro?.nickname ?? "—",
      customerName: apt
        ? `${apt.customer_first_name} ${apt.customer_last_name}`
        : !row.customer_whatsapp
          ? "Venda rápida"
          : "—",
      totalCents: row.total_cents,
      commissionCents: row.commission_cents,
      payments,
    };
  });

  const comandaDateById = new Map(
    comandas.map((comanda) => [comanda.id, comanda.serviceDate])
  );
  const { byMethod: creditDepositsByMethod, byDay: creditDepositsByDay } =
    await loadCreditDepositsForPeriod(admin, {
      shopId,
      from,
      to,
      cashRegisterSessionId: options.cashRegisterSessionId,
      comandaDateById,
    });

  const creditDepositsCents = CASH_INFLOW_PAYMENT_METHODS.reduce(
    (sum, method) => sum + creditDepositsByMethod[method],
    0
  );
  const cashInflowCents =
    CASH_INFLOW_PAYMENT_METHODS.reduce(
      (sum, method) => sum + byPaymentMethod[method],
      0
    ) + creditDepositsCents;

  return {
    from,
    to,
    totalCents,
    commissionCents,
    shopCents: totalCents - commissionCents,
    byPaymentMethod,
    creditDepositsByMethod,
    creditDepositsByDay: Object.fromEntries(creditDepositsByDay),
    creditDepositsCents,
    cashInflowCents,
    comandaCount: comandas.length,
    comandas,
    openComandas: [],
  };
}

async function loadOpenComandasForDate(
  admin: SupabaseClient,
  shopId: string,
  date: string
): Promise<CashRegisterOpenComanda[]> {
  const { data } = await admin
    .from("comandas")
    .select(
      `
      id,
      appointment_id,
      customer_whatsapp,
      service_date,
      total_cents,
      appointments (
        customer_first_name,
        customer_last_name
      ),
      comanda_items ( id, service_name, quantity, is_tip )
    `
    )
    .eq("shop_id", shopId)
    .eq("status", "open")
    .eq("service_date", date)
    .order("created_at", { ascending: false });

  return (data ?? [])
    .map((row) => {
      const items = (row.comanda_items ?? []).filter((item) => !item.is_tip);
      if (items.length === 0) return null;

      const isWalkIn = !row.customer_whatsapp && !row.appointment_id;
      const apt = Array.isArray(row.appointments)
        ? row.appointments[0]
        : row.appointments;
      const customerName = isWalkIn
        ? "Venda rápida"
        : apt
          ? `${apt.customer_first_name} ${apt.customer_last_name}`
          : "Comanda aberta";

      const names = items.map((item) => {
        const qty = item.quantity && item.quantity > 1 ? `${item.quantity}x ` : "";
        return `${qty}${item.service_name}`;
      });
      const itemPreview =
        names.length <= 2
          ? names.join(" · ")
          : `${names.slice(0, 2).join(" · ")} +${names.length - 2}`;

      return {
        id: row.id as string,
        appointmentId: (row.appointment_id as string | null) ?? null,
        serviceDate: row.service_date as string,
        totalCents: row.total_cents as number,
        itemCount: items.length,
        itemPreview,
        customerName,
        isWalkIn,
      };
    })
    .filter((row): row is CashRegisterOpenComanda => row != null);
}

/** Quantidade de comandas abertas com itens no dia (bloqueia encerrar caixa). */
export async function countOpenComandasWithItems(
  admin: SupabaseClient,
  shopId: string,
  date: string
): Promise<number> {
  const open = await loadOpenComandasForDate(admin, shopId, date);
  return open.length;
}

export async function getCashRegisterSummary(
  admin: SupabaseClient,
  shopId: string,
  date: string,
  options: { cashRegisterSessionId?: string } = {}
): Promise<CashRegisterSummary> {
  const [summary, openComandas] = await Promise.all([
    getFinancePeriodSummary(admin, shopId, date, date, options),
    loadOpenComandasForDate(admin, shopId, date),
  ]);
  return { ...summary, openComandas };
}

export async function getCommissionSummary(
  admin: SupabaseClient,
  shopId: string,
  from: string,
  to: string,
  professionalId?: string,
  options: { excludePaid?: boolean } = {}
): Promise<CommissionSummary> {
  const excludePaid = options.excludePaid !== false;

  const { data } = await admin
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

  const paidItemIds = excludePaid
    ? await loadPaidComandaItemIds(
        admin,
        (data ?? []).flatMap((row) =>
          (row.comanda_items ?? []).map((item) => item.id).filter(Boolean)
        )
      )
    : new Set<string>();

  const map = new Map<
    string,
    CommissionSummaryRow & { comandaIds: Set<string> }
  >();
  const allComandaIds = new Set<string>();

  for (const row of data ?? []) {
    const items = (row.comanda_items ?? []).filter((item) => {
      if (!item.id) return false;
      if (excludePaid && paidItemIds.has(item.id)) return false;
      return professionalId ? item.professional_id === professionalId : true;
    });
    if (items.length === 0) continue;
    allComandaIds.add(row.id);

    for (const item of items) {
      if (!item.professional_id) continue;

      const pro = Array.isArray(item.professionals)
        ? item.professionals[0]
        : item.professionals;
      const pid = item.professional_id;
      const existing = map.get(pid) ?? {
        professionalId: pid,
        professionalNickname: pro?.nickname ?? "—",
        commissionPercent: pro?.commission_percent ?? 50,
        comandaCount: 0,
        totalCents: 0,
        commissionCents: 0,
        shopCents: 0,
        tipCents: 0,
        serviceItemCount: 0,
        comandaIds: new Set<string>(),
      };

      const pct = pro?.commission_percent ?? existing.commissionPercent;
      const itemCommission = calculateItemCommissionCents(
        {
          chargedPriceCents: item.charged_price_cents,
          professionalId: pid,
          isTip: item.is_tip,
          productId: item.product_id,
          commissionPercentSnapshot: item.commission_percent_snapshot,
        },
        new Map([[pid, pct]])
      );

      existing.totalCents += item.charged_price_cents;
      existing.commissionCents += itemCommission;
      existing.comandaIds.add(row.id);
      if (item.is_tip) {
        existing.tipCents += item.charged_price_cents;
      } else {
        existing.serviceItemCount += 1;
        existing.shopCents += item.charged_price_cents - itemCommission;
      }
      map.set(pid, existing);
    }
  }

  const rows = [...map.values()]
    .map(({ comandaIds, ...row }) => ({
      ...row,
      comandaCount: comandaIds.size,
    }))
    .sort((a, b) =>
      a.professionalNickname.localeCompare(b.professionalNickname, "pt-BR")
    );

  const totals = rows.reduce(
    (acc, row) => ({
      totalCents: acc.totalCents + row.totalCents,
      commissionCents: acc.commissionCents + row.commissionCents,
      shopCents: acc.shopCents + row.shopCents,
      comandaCount: acc.comandaCount,
      serviceItemCount: acc.serviceItemCount + row.serviceItemCount,
    }),
    {
      totalCents: 0,
      commissionCents: 0,
      shopCents: 0,
      comandaCount: 0,
      serviceItemCount: 0,
    }
  );
  totals.comandaCount = allComandaIds.size;

  return { from, to, rows, totals };
}

export type FinanceDayMetric = {
  date: string;
  totalCents: number;
  cashInflowCents: number;
  creditDepositsCents: number;
  commissionCents: number;
  shopCents: number;
  serviceItemCount: number;
};

export type FinancePeriodComparison = {
  previousFrom: string;
  previousTo: string;
  totalCents: number;
  cashInflowCents: number;
  commissionCents: number;
  serviceItemCount: number;
  /** @deprecated use totalChangePercent */
  changePercent: number | null;
  totalChangePercent: number | null;
  cashInflowChangePercent: number | null;
  serviceChangePercent: number | null;
};

export type FinanceServiceRow = {
  serviceName: string;
  isTip: boolean;
  quantity: number;
  grossCents: number;
};

export type FinanceWeekdayRow = {
  weekday: number;
  label: string;
  grossCents: number;
  cashInflowCents: number;
  serviceItemCount: number;
};

export type FinanceMetricsReport = {
  from: string;
  to: string;
  totals: {
    totalCents: number;
    cashInflowCents: number;
    creditDepositsCents: number;
    commissionCents: number;
    shopCents: number;
    serviceItemCount: number;
    /** Comandas finalizadas no período (atendimentos). */
    comandaCount: number;
    servicesGrossCents: number;
  };
  averageServiceCents: number;
  averageServicesPerActiveDay: number;
  commissionRatePercent: number;
  shopRatePercent: number;
  activeDays: number;
  idleDays: number;
  periodDayCount: number;
  byDay: FinanceDayMetric[];
  byPaymentMethod: Record<PaymentMethod, number>;
  cashInflowByPaymentMethod: Record<PaymentMethod, number>;
  professionals: CommissionSummaryRow[];
  serviceBreakdown: FinanceServiceRow[];
  weekdayBreakdown: FinanceWeekdayRow[];
  comparison: FinancePeriodComparison | null;
  /** Vendas de produto (comandas fechadas) no período. */
  productSales: ProductSalesReport;
};

function shiftIsoDate(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function inclusiveDayCount(from: string, to: string): number {
  const start = new Date(`${from}T00:00:00Z`).getTime();
  const end = new Date(`${to}T00:00:00Z`).getTime();
  return Math.max(1, Math.round((end - start) / 86_400_000) + 1);
}

function listDatesInRange(from: string, to: string): string[] {
  const dates: string[] = [];
  let cursor = from;
  while (cursor <= to) {
    dates.push(cursor);
    cursor = shiftIsoDate(cursor, 1);
  }
  return dates;
}

function percentChange(current: number, previous: number): number | null {
  if (previous > 0) {
    return Math.round(((current - previous) / previous) * 100);
  }
  if (current > 0) return 100;
  return null;
}

async function loadFinanceServiceBreakdown(
  admin: SupabaseClient,
  comandaIds: string[]
): Promise<FinanceServiceRow[]> {
  if (comandaIds.length === 0) return [];

  const { data } = await admin
    .from("comanda_items")
    .select("service_name, charged_price_cents, is_tip")
    .in("comanda_id", comandaIds);

  const map = new Map<string, FinanceServiceRow>();
  for (const row of data ?? []) {
    const key = `${row.is_tip ? "tip" : "svc"}:${row.service_name}`;
    const existing = map.get(key) ?? {
      serviceName: row.service_name,
      isTip: row.is_tip,
      quantity: 0,
      grossCents: 0,
    };
    existing.quantity += 1;
    existing.grossCents += row.charged_price_cents;
    map.set(key, existing);
  }

  return [...map.values()].sort((a, b) => b.grossCents - a.grossCents);
}

async function loadFinanceServiceVolume(
  admin: SupabaseClient,
  shopId: string,
  from: string,
  to: string
): Promise<{
  totalServiceItemCount: number;
  byDay: Map<string, number>;
}> {
  const { data } = await admin
    .from("comanda_items")
    .select("is_tip, comandas!inner(service_date, status, shop_id)")
    .eq("comandas.status", "closed")
    .eq("comandas.shop_id", shopId)
    .eq("is_tip", false)
    .gte("comandas.service_date", from)
    .lte("comandas.service_date", to);

  const byDay = new Map<string, number>();
  let totalServiceItemCount = 0;

  for (const row of data ?? []) {
    const comanda = Array.isArray(row.comandas)
      ? row.comandas[0]
      : row.comandas;
    const date = comanda?.service_date;
    if (!date) continue;
    totalServiceItemCount += 1;
    byDay.set(date, (byDay.get(date) ?? 0) + 1);
  }

  return { totalServiceItemCount, byDay };
}

function sumServicesGrossCents(serviceBreakdown: FinanceServiceRow[]): number {
  return serviceBreakdown
    .filter((row) => !row.isTip)
    .reduce((sum, row) => sum + row.grossCents, 0);
}

function buildWeekdayBreakdown(byDay: FinanceDayMetric[]): FinanceWeekdayRow[] {
  const map = new Map<number, FinanceWeekdayRow>();
  for (let weekday = 0; weekday <= 6; weekday++) {
    map.set(weekday, {
      weekday,
      label: WEEKDAYS[weekday],
      grossCents: 0,
      cashInflowCents: 0,
      serviceItemCount: 0,
    });
  }

  for (const day of byDay) {
    const weekday = weekdayOf(day.date);
    const entry = map.get(weekday)!;
    entry.grossCents += day.totalCents;
    entry.cashInflowCents += day.cashInflowCents;
    entry.serviceItemCount += day.serviceItemCount;
  }

  return [...map.values()];
}

function buildCashInflowByPaymentMethod(
  byPaymentMethod: Record<PaymentMethod, number>,
  creditDepositsByMethod: Record<CashInflowPaymentMethod, number>
): Record<PaymentMethod, number> {
  const merged = { ...byPaymentMethod };
  for (const method of CASH_INFLOW_PAYMENT_METHODS) {
    merged[method] += creditDepositsByMethod[method];
  }
  return merged;
}

function buildDayMetrics(
  comandas: CashRegisterSummary["comandas"],
  creditDepositsByDay: Map<string, number>,
  servicesByDay: Map<string, number>,
  from: string,
  to: string
): FinanceDayMetric[] {
  const map = new Map<string, FinanceDayMetric>();

  for (const date of listDatesInRange(from, to)) {
    map.set(date, {
      date,
      totalCents: 0,
      cashInflowCents: 0,
      creditDepositsCents: 0,
      commissionCents: 0,
      shopCents: 0,
      serviceItemCount: servicesByDay.get(date) ?? 0,
    });
  }

  for (const comanda of comandas) {
    const entry =
      map.get(comanda.serviceDate) ??
      {
        date: comanda.serviceDate,
        totalCents: 0,
        cashInflowCents: 0,
        creditDepositsCents: 0,
        commissionCents: 0,
        shopCents: 0,
        serviceItemCount: servicesByDay.get(comanda.serviceDate) ?? 0,
      };
    entry.totalCents += comanda.totalCents;
    entry.commissionCents += comanda.commissionCents;
    entry.shopCents += comanda.totalCents - comanda.commissionCents;
    entry.cashInflowCents += comanda.payments
      .filter((payment) =>
        (CASH_INFLOW_PAYMENT_METHODS as readonly string[]).includes(payment.method)
      )
      .reduce((sum, payment) => sum + payment.amountCents, 0);
    map.set(comanda.serviceDate, entry);
  }

  for (const [date, creditDepositsCents] of creditDepositsByDay) {
    const entry =
      map.get(date) ??
      {
        date,
        totalCents: 0,
        cashInflowCents: 0,
        creditDepositsCents: 0,
        commissionCents: 0,
        shopCents: 0,
        serviceItemCount: servicesByDay.get(date) ?? 0,
      };
    entry.creditDepositsCents += creditDepositsCents;
    entry.cashInflowCents += creditDepositsCents;
    map.set(date, entry);
  }

  return [...map.values()];
}

export async function getFinanceMetricsReport(
  admin: SupabaseClient,
  shopId: string,
  from: string,
  to: string
): Promise<FinanceMetricsReport> {
  const [summary, commissions, serviceVolume, productSales] = await Promise.all([
    getFinancePeriodSummary(admin, shopId, from, to),
    getCommissionSummary(admin, shopId, from, to, undefined, { excludePaid: false }),
    loadFinanceServiceVolume(admin, shopId, from, to),
    getProductSalesReport(admin, shopId, from, to),
  ]);

  const serviceBreakdown = await loadFinanceServiceBreakdown(
    admin,
    summary.comandas.map((comanda) => comanda.id)
  );
  const servicesGrossCents = sumServicesGrossCents(serviceBreakdown);
  const serviceItemCount = serviceVolume.totalServiceItemCount;

  const byDay = buildDayMetrics(
    summary.comandas,
    new Map(Object.entries(summary.creditDepositsByDay)),
    serviceVolume.byDay,
    from,
    to
  );
  const cashInflowByPaymentMethod = buildCashInflowByPaymentMethod(
    summary.byPaymentMethod,
    summary.creditDepositsByMethod
  );
  const activeDays = byDay.filter((day) => day.serviceItemCount > 0).length;
  const periodDayCount = inclusiveDayCount(from, to);
  const idleDays = periodDayCount - activeDays;
  const averageServiceCents =
    serviceItemCount > 0
      ? Math.round(servicesGrossCents / serviceItemCount)
      : 0;
  const averageServicesPerActiveDay =
    activeDays > 0
      ? Math.round((serviceItemCount / activeDays) * 10) / 10
      : 0;
  const commissionRatePercent =
    summary.totalCents > 0
      ? Math.round((summary.commissionCents / summary.totalCents) * 100)
      : 0;
  const shopRatePercent =
    summary.totalCents > 0 ? 100 - commissionRatePercent : 0;

  let comparison: FinancePeriodComparison | null = null;
  const previousTo = shiftIsoDate(from, -1);
  const previousFrom = shiftIsoDate(previousTo, -(periodDayCount - 1));

  if (previousFrom <= previousTo) {
    const [previous, previousServiceVolume] = await Promise.all([
      getFinancePeriodSummary(admin, shopId, previousFrom, previousTo),
      loadFinanceServiceVolume(admin, shopId, previousFrom, previousTo),
    ]);
    const totalChangePercent = percentChange(summary.totalCents, previous.totalCents);
    comparison = {
      previousFrom,
      previousTo,
      totalCents: previous.totalCents,
      cashInflowCents: previous.cashInflowCents,
      commissionCents: previous.commissionCents,
      serviceItemCount: previousServiceVolume.totalServiceItemCount,
      changePercent: totalChangePercent,
      totalChangePercent,
      cashInflowChangePercent: percentChange(
        summary.cashInflowCents,
        previous.cashInflowCents
      ),
      serviceChangePercent: percentChange(
        serviceItemCount,
        previousServiceVolume.totalServiceItemCount
      ),
    };
  }

  const weekdayBreakdown = buildWeekdayBreakdown(byDay);

  return {
    from,
    to,
    totals: {
      totalCents: summary.totalCents,
      cashInflowCents: summary.cashInflowCents,
      creditDepositsCents: summary.creditDepositsCents,
      commissionCents: summary.commissionCents,
      shopCents: summary.shopCents,
      serviceItemCount,
      comandaCount: summary.comandaCount,
      servicesGrossCents,
    },
    averageServiceCents,
    averageServicesPerActiveDay,
    commissionRatePercent,
    shopRatePercent,
    activeDays,
    idleDays,
    periodDayCount,
    byDay,
    byPaymentMethod: summary.byPaymentMethod,
    cashInflowByPaymentMethod,
    professionals: commissions.rows,
    serviceBreakdown,
    weekdayBreakdown,
    comparison,
    productSales,
  };
}

export function formatPaymentMethodLabel(method: PaymentMethod): string {
  return PAYMENT_METHOD_LABELS[method];
}

/** Faturamento só de serviços (sem gorjeta). */
export function commissionServiceRevenueCents(summary: {
  servicesGrossCents: number;
  tipCents: number;
}): number {
  return summary.servicesGrossCents - summary.tipCents;
}

export type CommissionReportSummary = {
  servicesGrossCents: number;
  commissionCents: number;
  itemCount: number;
  comandaCount: number;
  tipCents: number;
  serviceItemCount: number;
  shopCents: number;
};

export type CommissionDayRow = {
  date: string;
  servicesGrossCents: number;
  commissionCents: number;
  comandaCount: number;
  itemCount: number;
  tipCents: number;
  serviceItemCount: number;
  shopCents: number;
};

export type CommissionServiceBreakdownRow = {
  serviceName: string;
  isTip: boolean;
  quantity: number;
  grossCents: number;
  commissionCents: number;
};

export type CommissionComandaItemDetail = {
  serviceName: string;
  isTip: boolean;
  chargedPriceCents: number;
  commissionCents: number;
};

export type CommissionComandaPaymentDetail = {
  method: PaymentMethod;
  amountCents: number;
  professionalShareCents: number;
};

export type CommissionComandaDetail = {
  comandaId: string;
  serviceDate: string;
  closedAt: string | null;
  customerWhatsapp: string;
  customerName: string | null;
  grossCents: number;
  commissionCents: number;
  tipCents: number;
  serviceItemCount: number;
  items: CommissionComandaItemDetail[];
  payments: CommissionComandaPaymentDetail[];
};

export type CommissionProfessionalReport = {
  professionalId: string;
  professionalNickname: string;
  commissionPercent: number;
  summary: CommissionReportSummary;
  byPaymentMethod: Record<PaymentMethod, number>;
  byDay: CommissionDayRow[];
  serviceBreakdown: CommissionServiceBreakdownRow[];
  comandas: CommissionComandaDetail[];
};

export type CommissionReport = {
  from: string;
  to: string;
  professionalId: string | null;
  summary: CommissionReportSummary;
  byPaymentMethod: Record<PaymentMethod, number>;
  byDay: CommissionDayRow[];
  professionals: CommissionProfessionalReport[];
};

type ComandaCommissionRow = {
  id: string;
  service_date: string;
  total_cents: number;
  customer_whatsapp: string;
  closed_at: string | null;
  comanda_items: {
    id: string;
    service_name: string;
    charged_price_cents: number;
    professional_id: string | null;
    is_tip: boolean;
    product_id: string | null;
    commission_percent_snapshot: number | null;
    professionals:
      | { nickname: string; commission_percent: number }
      | { nickname: string; commission_percent: number }[]
      | null;
  }[];
  comanda_payments: {
    payment_method: string;
    amount_cents: number;
  }[];
};

type DayAccumulator = {
  servicesGrossCents: number;
  commissionCents: number;
  comandaIds: Set<string>;
  itemCount: number;
  tipCents: number;
  serviceItemCount: number;
  shopCents: number;
};

function emptySummary(): Omit<CommissionReportSummary, "comandaCount"> {
  return {
    servicesGrossCents: 0,
    commissionCents: 0,
    itemCount: 0,
    tipCents: 0,
    serviceItemCount: 0,
    shopCents: 0,
  };
}

function emptyDayMap(): Map<string, DayAccumulator> {
  return new Map();
}

function bumpDay(
  map: Map<string, DayAccumulator>,
  date: string,
  grossCents: number,
  commissionCents: number,
  comandaId: string,
  isTip: boolean
) {
  const entry = map.get(date) ?? {
    servicesGrossCents: 0,
    commissionCents: 0,
    comandaIds: new Set<string>(),
    itemCount: 0,
    tipCents: 0,
    serviceItemCount: 0,
    shopCents: 0,
  };
  entry.servicesGrossCents += grossCents;
  entry.commissionCents += commissionCents;
  entry.comandaIds.add(comandaId);
  entry.itemCount += 1;
  if (isTip) {
    entry.tipCents += grossCents;
  } else {
    entry.serviceItemCount += 1;
    entry.shopCents += grossCents - commissionCents;
  }
  map.set(date, entry);
}

function dayMapToRows(map: Map<string, DayAccumulator>): CommissionDayRow[] {
  return [...map.entries()]
    .map(([date, entry]) => ({
      date,
      servicesGrossCents: entry.servicesGrossCents,
      commissionCents: entry.commissionCents,
      comandaCount: entry.comandaIds.size,
      itemCount: entry.itemCount,
      tipCents: entry.tipCents,
      serviceItemCount: entry.serviceItemCount,
      shopCents: entry.shopCents,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function bumpServiceBreakdown(
  map: Map<string, CommissionServiceBreakdownRow>,
  serviceName: string,
  isTip: boolean,
  grossCents: number,
  commissionCents: number
) {
  const key = `${isTip ? "tip" : "svc"}:${serviceName}`;
  const existing = map.get(key) ?? {
    serviceName,
    isTip,
    quantity: 0,
    grossCents: 0,
    commissionCents: 0,
  };
  existing.quantity += 1;
  existing.grossCents += grossCents;
  existing.commissionCents += commissionCents;
  map.set(key, existing);
}

type ComandaAccumulator = {
  comandaId: string;
  serviceDate: string;
  closedAt: string | null;
  customerWhatsapp: string;
  comandaTotalCents: number;
  grossCents: number;
  commissionCents: number;
  tipCents: number;
  serviceItemCount: number;
  items: CommissionComandaItemDetail[];
  payments: ComandaCommissionRow["comanda_payments"];
};

function finalizeComandaPayments(
  comanda: ComandaAccumulator,
  payments: ComandaCommissionRow["comanda_payments"]
): CommissionComandaPaymentDetail[] {
  if (comanda.comandaTotalCents <= 0 || comanda.grossCents <= 0) return [];
  const share = comanda.grossCents / comanda.comandaTotalCents;
  return (payments ?? [])
    .map((payment) => {
      const method = payment.payment_method as PaymentMethod;
      if (!PAYMENT_METHODS.includes(method)) return null;
      return {
        method,
        amountCents: payment.amount_cents,
        professionalShareCents: Math.round(payment.amount_cents * share),
      };
    })
    .filter((row): row is CommissionComandaPaymentDetail => row !== null);
}

async function loadCustomerNamesByWhatsapp(
  admin: SupabaseClient,
  shopId: string,
  whatsapps: string[]
): Promise<Map<string, string>> {
  if (whatsapps.length === 0) return new Map();
  const { data } = await admin
    .from("customers")
    .select("whatsapp, first_name, last_name")
    .eq("shop_id", shopId)
    .in("whatsapp", whatsapps);

  const map = new Map<string, string>();
  for (const row of data ?? []) {
    const name = `${row.first_name} ${row.last_name}`.trim();
    if (name) map.set(row.whatsapp, name);
  }
  return map;
}

function emptyPaymentMap(): Record<PaymentMethod, number> {
  return {
    pix: 0,
    cash: 0,
    debit: 0,
    credit: 0,
    store_credit: 0,
  };
}

function emptyCashInflowMap(): Record<CashInflowPaymentMethod, number> {
  return { pix: 0, cash: 0, debit: 0, credit: 0 };
}

function firstPro(
  value: ComandaCommissionRow["comanda_items"][0]["professionals"]
): { nickname: string; commission_percent: number } | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

export async function getCommissionReport(
  admin: SupabaseClient,
  shopId: string,
  from: string,
  to: string,
  professionalId?: string
): Promise<CommissionReport> {
  const { data } = await admin
    .from("comandas")
    .select(
      `
      id,
      service_date,
      total_cents,
      customer_whatsapp,
      closed_at,
      comanda_items (
        id,
        service_name,
        charged_price_cents,
        professional_id,
        is_tip,
        product_id,
        commission_percent_snapshot,
        professionals ( nickname, commission_percent )
      ),
      comanda_payments ( payment_method, amount_cents )
    `
    )
    .eq("shop_id", shopId)
    .eq("status", "closed")
    .gte("service_date", from)
    .lte("service_date", to);

  const rawRows = (data ?? []) as ComandaCommissionRow[];
  const allItemIds = rawRows.flatMap((row) =>
    (row.comanda_items ?? []).map((item) => item.id).filter(Boolean)
  );
  const paidItemIds = await loadPaidComandaItemIds(admin, allItemIds);

  const proMap = new Map<
    string,
    {
      professionalNickname: string;
      commissionPercent: number;
      summary: Omit<CommissionReportSummary, "comandaCount">;
      byPaymentMethod: Record<PaymentMethod, number>;
      byDay: ReturnType<typeof emptyDayMap>;
      comandaIds: Set<string>;
      serviceBreakdown: Map<string, CommissionServiceBreakdownRow>;
      comandas: Map<string, ComandaAccumulator>;
    }
  >();
  const allComandaIds = new Set<string>();
  const reportByDay = emptyDayMap();

  for (const row of rawRows) {
    const serviceDate = row.service_date;
    const items = (row.comanda_items ?? []).filter((item) => {
      if (!item.id || paidItemIds.has(item.id)) return false;
      return professionalId ? item.professional_id === professionalId : true;
    });
    if (items.length === 0) continue;
    allComandaIds.add(row.id);

    const comandaTotal =
      row.total_cents > 0
        ? row.total_cents
        : (row.comanda_items ?? []).reduce(
            (sum, item) => sum + item.charged_price_cents,
            0
          );

    const grossByPro = new Map<string, number>();
    const commissionByPro = new Map<string, number>();

    for (const item of items) {
      if (!item.professional_id) continue;
      const pro = firstPro(item.professionals);
      const entry =
        proMap.get(item.professional_id) ??
        {
          professionalNickname: pro?.nickname ?? "—",
          commissionPercent: pro?.commission_percent ?? 50,
          summary: emptySummary(),
          byPaymentMethod: emptyPaymentMap(),
          byDay: emptyDayMap(),
          comandaIds: new Set<string>(),
          serviceBreakdown: new Map(),
          comandas: new Map(),
        };

      const pct = pro?.commission_percent ?? entry.commissionPercent;
      const itemCommission = calculateItemCommissionCents(
        {
          chargedPriceCents: item.charged_price_cents,
          professionalId: item.professional_id,
          isTip: item.is_tip,
          productId: item.product_id,
          commissionPercentSnapshot: item.commission_percent_snapshot,
        },
        new Map([[item.professional_id, pct]])
      );

      entry.summary.servicesGrossCents += item.charged_price_cents;
      entry.summary.commissionCents += itemCommission;
      entry.summary.itemCount += 1;
      if (item.is_tip) {
        entry.summary.tipCents += item.charged_price_cents;
      } else {
        entry.summary.serviceItemCount += 1;
        entry.summary.shopCents += item.charged_price_cents - itemCommission;
      }
      entry.comandaIds.add(row.id);

      bumpDay(
        entry.byDay,
        serviceDate,
        item.charged_price_cents,
        itemCommission,
        row.id,
        item.is_tip
      );
      bumpServiceBreakdown(
        entry.serviceBreakdown,
        item.service_name,
        item.is_tip,
        item.charged_price_cents,
        itemCommission
      );

      const comandaKey = row.id;
      const comandaAcc =
        entry.comandas.get(comandaKey) ??
        {
          comandaId: row.id,
          serviceDate,
          closedAt: row.closed_at,
          customerWhatsapp: row.customer_whatsapp,
          comandaTotalCents: comandaTotal,
          grossCents: 0,
          commissionCents: 0,
          tipCents: 0,
          serviceItemCount: 0,
          items: [],
          payments: row.comanda_payments ?? [],
        };
      comandaAcc.items.push({
        serviceName: item.service_name,
        isTip: item.is_tip,
        chargedPriceCents: item.charged_price_cents,
        commissionCents: itemCommission,
      });
      comandaAcc.grossCents += item.charged_price_cents;
      comandaAcc.commissionCents += itemCommission;
      if (item.is_tip) {
        comandaAcc.tipCents += item.charged_price_cents;
      } else {
        comandaAcc.serviceItemCount += 1;
      }
      entry.comandas.set(comandaKey, comandaAcc);

      grossByPro.set(
        item.professional_id,
        (grossByPro.get(item.professional_id) ?? 0) + item.charged_price_cents
      );
      commissionByPro.set(
        item.professional_id,
        (commissionByPro.get(item.professional_id) ?? 0) + itemCommission
      );
      proMap.set(item.professional_id, entry);
    }

    for (const item of items) {
      bumpDay(
        reportByDay,
        serviceDate,
        item.charged_price_cents,
        calculateItemCommissionCents(
          {
            chargedPriceCents: item.charged_price_cents,
            professionalId: item.professional_id,
            isTip: item.is_tip,
            productId: item.product_id,
            commissionPercentSnapshot: item.commission_percent_snapshot,
          },
          new Map([
            [
              item.professional_id ?? "",
              firstPro(item.professionals)?.commission_percent ?? 50,
            ],
          ])
        ),
        row.id,
        item.is_tip
      );
    }

    if (comandaTotal <= 0) continue;

    for (const [pid, proGross] of grossByPro) {
      const entry = proMap.get(pid);
      if (!entry) continue;
      const share = proGross / comandaTotal;
      for (const payment of row.comanda_payments ?? []) {
        const method = payment.payment_method as PaymentMethod;
        if (!(method in entry.byPaymentMethod)) continue;
        entry.byPaymentMethod[method] += Math.round(payment.amount_cents * share);
      }
    }
  }

  const whatsapps = [
    ...new Set(
      [...proMap.values()].flatMap((entry) =>
        [...entry.comandas.values()].map((comanda) => comanda.customerWhatsapp)
      )
    ),
  ];
  const customerNames = await loadCustomerNamesByWhatsapp(admin, shopId, whatsapps);

  const professionals: CommissionProfessionalReport[] = [...proMap.entries()]
    .map(([id, entry]) => ({
      professionalId: id,
      professionalNickname: entry.professionalNickname,
      commissionPercent: entry.commissionPercent,
      summary: {
        ...entry.summary,
        comandaCount: entry.comandaIds.size,
      },
      byPaymentMethod: entry.byPaymentMethod,
      byDay: dayMapToRows(entry.byDay),
      serviceBreakdown: [...entry.serviceBreakdown.values()].sort(
        (a, b) => b.grossCents - a.grossCents
      ),
      comandas: [...entry.comandas.values()]
        .map((comanda) => ({
          comandaId: comanda.comandaId,
          serviceDate: comanda.serviceDate,
          closedAt: comanda.closedAt,
          customerWhatsapp: comanda.customerWhatsapp,
          customerName: customerNames.get(comanda.customerWhatsapp) ?? null,
          grossCents: comanda.grossCents,
          commissionCents: comanda.commissionCents,
          tipCents: comanda.tipCents,
          serviceItemCount: comanda.serviceItemCount,
          items: comanda.items,
          payments: finalizeComandaPayments(comanda, comanda.payments),
        }))
        .sort((a, b) => {
          const closedA = a.closedAt ?? "";
          const closedB = b.closedAt ?? "";
          return closedB.localeCompare(closedA);
        }),
    }))
    .sort((a, b) =>
      a.professionalNickname.localeCompare(b.professionalNickname, "pt-BR")
    );

  const summary = professionals.reduce<Omit<CommissionReportSummary, "comandaCount">>(
    (acc, row) => ({
      servicesGrossCents: acc.servicesGrossCents + row.summary.servicesGrossCents,
      commissionCents: acc.commissionCents + row.summary.commissionCents,
      itemCount: acc.itemCount + row.summary.itemCount,
      tipCents: acc.tipCents + row.summary.tipCents,
      serviceItemCount: acc.serviceItemCount + row.summary.serviceItemCount,
      shopCents: acc.shopCents + row.summary.shopCents,
    }),
    emptySummary()
  );

  const reportSummary: CommissionReportSummary = {
    ...summary,
    comandaCount: allComandaIds.size,
  };

  const byPaymentMethod = emptyPaymentMap();
  for (const row of professionals) {
    for (const method of PAYMENT_METHODS) {
      byPaymentMethod[method] += row.byPaymentMethod[method];
    }
  }

  return {
    from,
    to,
    professionalId: professionalId ?? null,
    summary: reportSummary,
    byPaymentMethod,
    byDay: dayMapToRows(reportByDay),
    professionals,
  };
}
