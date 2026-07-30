export const PAYMENT_METHODS = [
  "pix",
  "cash",
  "debit",
  "credit",
  "store_credit",
] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const CASH_INFLOW_PAYMENT_METHODS = [
  "pix",
  "cash",
  "debit",
  "credit",
] as const;

export type CashInflowPaymentMethod =
  (typeof CASH_INFLOW_PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  pix: "Pix",
  cash: "Dinheiro",
  debit: "Cartão débito",
  credit: "Cartão crédito",
  store_credit: "Crédito do cliente",
};

export type ComandaStatus = "open" | "closed";

export type ComandaItem = {
  id: string;
  serviceId: string | null;
  productId: string | null;
  serviceName: string;
  catalogPriceCents: number;
  chargedPriceCents: number;
  quantity: number;
  commissionPercentSnapshot: number | null;
  sortOrder: number;
  squeezeAppointmentId: string | null;
  appointmentId: string | null;
  professionalId: string | null;
  professionalNickname: string;
  isTip: boolean;
};

export type ComandaPayment = {
  id: string;
  paymentMethod: PaymentMethod;
  amountCents: number;
};

export type ComandaLinkedAppointment = {
  id: string;
  professionalId: string;
  professionalNickname: string;
  startTime: string;
  endTime: string;
  status: string;
  isSqueezeIn: boolean;
  isComandaExtra?: boolean;
};

export type ComandaDetail = {
  id: string;
  shopId: string;
  appointmentId: string;
  professionalId: string;
  professionalNickname: string;
  status: ComandaStatus;
  commissionPercentSnapshot: number | null;
  totalCents: number;
  commissionCents: number;
  closedAt: string | null;
  items: ComandaItem[];
  payments: ComandaPayment[];
  linkedAppointments: ComandaLinkedAppointment[];
  customerFirstName: string;
  customerLastName: string;
  customerWhatsapp: string;
  serviceDate: string;
  /** Venda rápida sem cliente/horário (geladeira, avulso). */
  isWalkIn: boolean;
  /** @deprecated use linkedAppointments */
  appointment: {
    date: string;
    startTime: string;
    endTime: string;
    status: string;
    customerFirstName: string;
    customerLastName: string;
    customerWhatsapp: string;
    isSqueezeIn: boolean;
  };
};

export type ComandaItemInput = {
  id?: string;
  serviceId?: string;
  productId?: string;
  serviceName: string;
  catalogPriceCents: number;
  chargedPriceCents: number;
  quantity?: number;
  commissionPercent?: number;
  appointmentId?: string;
  professionalId?: string;
  /** Horário do serviço extra na agenda (HH:mm). */
  startTime?: string;
  /** Serviço adicionado na comanda com barbeiro e horário próprios. */
  isComandaExtra?: boolean;
  /** Gorjeta: barbeiro recebe 100% do valor. */
  isTip?: boolean;
};

export type ComandaPaymentInput = {
  paymentMethod: PaymentMethod;
  amountCents: number;
};

export function calculateComandaTotals(
  items: Pick<ComandaItem, "chargedPriceCents">[],
  commissionPercent: number
): { totalCents: number; commissionCents: number } {
  let totalCents = 0;
  let commissionCents = 0;
  for (const item of items) {
    totalCents += item.chargedPriceCents;
    commissionCents += Math.round(
      (item.chargedPriceCents * commissionPercent) / 100
    );
  }
  return { totalCents, commissionCents };
}

export function calculateItemCommissionCents(
  item: {
    chargedPriceCents: number;
    professionalId: string | null;
    isTip?: boolean;
    productId?: string | null;
    commissionPercentSnapshot?: number | null;
  },
  commissionByProfessional: Map<string, number>
): number {
  if (item.isTip) {
    return item.chargedPriceCents;
  }
  // Produto sem barbeiro: 100% da barbearia.
  if (item.productId && !item.professionalId) {
    return 0;
  }
  if (item.productId || item.commissionPercentSnapshot != null) {
    const pct = item.commissionPercentSnapshot ?? 0;
    return Math.round((item.chargedPriceCents * pct) / 100);
  }
  const pct = item.professionalId
    ? (commissionByProfessional.get(item.professionalId) ?? 50)
    : 50;
  return Math.round((item.chargedPriceCents * pct) / 100);
}

export function calculateComandaTotalsByProfessional(
  items: {
    chargedPriceCents: number;
    professionalId: string | null;
    isTip?: boolean;
    productId?: string | null;
    commissionPercentSnapshot?: number | null;
  }[],
  commissionByProfessional: Map<string, number>
): { totalCents: number; commissionCents: number } {
  let totalCents = 0;
  let commissionCents = 0;
  for (const item of items) {
    totalCents += item.chargedPriceCents;
    commissionCents += calculateItemCommissionCents(
      item,
      commissionByProfessional
    );
  }
  return { totalCents, commissionCents };
}
