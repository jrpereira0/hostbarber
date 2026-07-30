/** Tipos e cálculo de status da mensalidade da plataforma. */

export type BillingStatusKind =
  | "paid"
  | "pending"
  | "overdue"
  | "unconfigured";

export type BillingStatus = {
  kind: BillingStatusKind;
  /** Meses em atraso (só quando kind === "overdue"). */
  overdueMonths: number;
  /** Quanto já foi pago no mês de referência atual (centavos). */
  paidThisMonthCents: number;
  /** Quanto falta pra cobrir a mensalidade do mês atual (centavos). */
  remainingThisMonthCents: number;
};

export type ShopBillingInput = {
  id: string;
  monthlyFeeCents: number | null;
  billingDueDay: number | null;
  /** Data de cadastro (ISO). Usada pra não olhar meses anteriores ao cadastro. */
  createdAt: string;
};

export type PaymentMonthSum = {
  shopId: string;
  /** YYYY-MM-01 */
  referenceMonth: string;
  totalCents: number;
};

/** Primeiro dia do mês no fuso local, como "YYYY-MM-01". */
export function monthKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}-01`;
}

/** Volta N meses a partir de um monthKey ("YYYY-MM-01"). */
export function shiftMonthKey(key: string, deltaMonths: number): string {
  const [yStr, mStr] = key.split("-");
  const y = Number(yStr);
  const m = Number(mStr);
  const d = new Date(y, m - 1 + deltaMonths, 1);
  return monthKey(d);
}

function parseDayLocal(isoDate: string): { year: number; month: number; day: number } {
  // Aceita "YYYY-MM-DD" ou ISO completo.
  const datePart = isoDate.slice(0, 10);
  const [y, m, d] = datePart.split("-").map(Number);
  return { year: y, month: m, day: d };
}

/** Dia real de vencimento no mês (1–12): se o dia não existir, usa o último dia. */
export function effectiveDueDay(
  year: number,
  month: number,
  dueDay: number
): number {
  const daysInMonth = new Date(year, month, 0).getDate();
  return Math.min(Math.max(1, dueDay), daysInMonth);
}

/**
 * Calcula o status de cobrança de um cliente na data de referência `today`.
 * `paymentsByMonth` é um mapa "YYYY-MM-01" -> total pago naquele mês (em centavos).
 */
export function computeShopBillingStatus(
  shop: ShopBillingInput,
  paymentsByMonth: Map<string, number>,
  today: Date = new Date()
): BillingStatus {
  const fee = shop.monthlyFeeCents;
  const dueDay = shop.billingDueDay;

  if (fee == null || fee <= 0 || dueDay == null || dueDay < 1 || dueDay > 31) {
    return {
      kind: "unconfigured",
      overdueMonths: 0,
      paidThisMonthCents: 0,
      remainingThisMonthCents: 0,
    };
  }

  const currentKey = monthKey(today);
  const paidThisMonth = paymentsByMonth.get(currentKey) ?? 0;
  const remaining = Math.max(0, fee - paidThisMonth);

  if (remaining === 0) {
    return {
      kind: "paid",
      overdueMonths: 0,
      paidThisMonthCents: paidThisMonth,
      remainingThisMonthCents: 0,
    };
  }

  const todayDay = today.getDate();
  const monthPaid = (key: string) => (paymentsByMonth.get(key) ?? 0) >= fee;

  // Quantos meses atrás (incluindo o atual) ainda não foram pagos de forma completa.
  // Não conta meses anteriores ao cadastro da loja.
  const created = parseDayLocal(shop.createdAt);
  const createdKey = `${created.year}-${String(created.month).padStart(2, "0")}-01`;

  let overdueMonths = 0;
  let cursor = currentKey;
  // Limite de segurança: 60 meses.
  for (let i = 0; i < 60; i++) {
    if (cursor < createdKey) break;
    if (monthPaid(cursor)) break;

    if (cursor === currentKey) {
      // Mês atual só conta como atraso se já passou o dia de vencimento
      // (em fev. etc., dia 31 vira o último dia do mês).
      const dueThisMonth = effectiveDueDay(
        today.getFullYear(),
        today.getMonth() + 1,
        dueDay
      );
      if (todayDay > dueThisMonth) {
        overdueMonths += 1;
      }
    } else {
      overdueMonths += 1;
    }
    cursor = shiftMonthKey(cursor, -1);
  }

  if (overdueMonths > 0) {
    return {
      kind: "overdue",
      overdueMonths,
      paidThisMonthCents: paidThisMonth,
      remainingThisMonthCents: remaining,
    };
  }

  return {
    kind: "pending",
    overdueMonths: 0,
    paidThisMonthCents: paidThisMonth,
    remainingThisMonthCents: remaining,
  };
}

/** Rótulo amigável do status. */
export function billingStatusLabel(status: BillingStatus): string {
  switch (status.kind) {
    case "paid":
      return "Em dia";
    case "pending":
      return "No prazo";
    case "overdue":
      return status.overdueMonths === 1
        ? "Atrasado há 1 mês"
        : `Atrasado há ${status.overdueMonths} meses`;
    case "unconfigured":
      return "Sem cobrança";
  }
}

/** Agrupa pagamentos por (shopId, referenceMonth) somando amount_cents. */
export function sumPaymentsByShopMonth(
  payments: { shopId: string; referenceMonth: string; amountCents: number }[]
): Map<string, Map<string, number>> {
  const byShop = new Map<string, Map<string, number>>();
  for (const payment of payments) {
    const month = payment.referenceMonth.slice(0, 10);
    let byMonth = byShop.get(payment.shopId);
    if (!byMonth) {
      byMonth = new Map();
      byShop.set(payment.shopId, byMonth);
    }
    byMonth.set(month, (byMonth.get(month) ?? 0) + payment.amountCents);
  }
  return byShop;
}

/** Rótulo do mês: "2026-07-01" -> "Julho de 2026". */
export function formatBillingMonthLabel(monthKeyStr: string): string {
  const [y, m] = monthKeyStr.slice(0, 10).split("-").map(Number);
  const date = new Date(y, m - 1, 1);
  const label = date.toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export type PlatformPaymentKind = "payment" | "complimentary" | "referral";

export type PlatformPaymentRow = {
  id: string;
  shopId: string;
  shopName: string;
  amountCents: number;
  referenceMonth: string;
  paidAt: string;
  note: string | null;
  kind: PlatformPaymentKind;
  createdAt: string;
};

export function paymentKindLabel(kind: PlatformPaymentKind): string {
  switch (kind) {
    case "complimentary":
      return "Mês grátis";
    case "referral":
      return "Indicação";
    default:
      return "Pagamento";
  }
}

export function normalizePaymentKind(value: unknown): PlatformPaymentKind {
  if (value === "complimentary" || value === "referral") return value;
  return "payment";
}

/**
 * Próximos meses (a partir do cadastro) que ainda não cobrem a mensalidade.
 * Usado para aplicar mês grátis / indicação no extrato.
 */
export function findUncoveredBillingMonths(input: {
  monthlyFeeCents: number;
  createdAt: string;
  paymentsByMonth: Map<string, number>;
  count: number;
  today?: Date;
}): string[] {
  const fee = input.monthlyFeeCents;
  const count = Math.max(0, Math.min(24, Math.floor(input.count)));
  if (fee <= 0 || count === 0) return [];

  const today = input.today ?? new Date();
  const created = parseDayLocal(input.createdAt);
  let cursor = `${created.year}-${String(created.month).padStart(2, "0")}-01`;
  const endKey = shiftMonthKey(monthKey(today), 18);
  const months: string[] = [];

  while (cursor <= endKey && months.length < count) {
    const paid = input.paymentsByMonth.get(cursor) ?? 0;
    if (paid < fee) months.push(cursor);
    cursor = shiftMonthKey(cursor, 1);
  }

  return months;
}

export type BillingShopRow = {
  id: string;
  name: string;
  slug: string;
  active: boolean;
  city: string;
  state: string;
  ownerEmail: string;
  ownerWhatsapp: string;
  monthlyFeeCents: number | null;
  billingDueDay: number | null;
  createdAt: string;
  status: BillingStatus;
  lastPaymentAt: string | null;
  lastPaymentCents: number | null;
};
