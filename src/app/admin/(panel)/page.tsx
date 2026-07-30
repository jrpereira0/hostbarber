import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { requireServerClient } from "@/lib/supabase/server";
import { requireAdminClient } from "@/lib/supabase/admin";
import { isActionResult } from "@/lib/is-action-result";
import { LOGIN_PATH } from "@/lib/login-path";
import { todayInTimezone } from "@/lib/availability";
import { getAgendaDayContext } from "@/lib/get-agenda-day";
import {
  buildAdminServicesCatalogForDate,
  loadServicePricingContext,
  resolvePriceCentsOrFallback,
} from "@/lib/service-prices-for-date";
import { getCashRegisterSummary } from "@/lib/finance-reports";
import {
  getCashRegisterSession,
  getOpenCashRegisterSession,
} from "@/lib/cash-register-service";
import { loadCashRegisterResponsibleOptions } from "@/lib/cash-register-options";
import { formatTime } from "@/lib/format";
import { capitalizePersonName } from "@/lib/text";
import { normalizeWhatsapp, whatsappLookupKeys } from "@/lib/whatsapp";
import { getAdminSession, canViewAllAgendas } from "@/lib/require-admin";
import { loadServiceBookingCounts } from "@/lib/service-booking-stats";
import { AgendaView } from "@/components/admin/agenda-view";
import type { AppointmentItem } from "@/components/admin/appointment-item";
import { parseBookingSource } from "@/lib/booking-source";
import type { ProductOption } from "@/lib/product-types";
import type { CashRegisterResponsibleOption } from "@/components/admin/open-cash-register-dialog";
import type { CashRegisterSession } from "@/lib/cash-register-service";
import type { CashRegisterSummary } from "@/lib/finance-reports";
import { DEFAULT_CONFIRMATION_WHATSAPP_MESSAGE } from "@/lib/confirmation-message";
import {
  getOnboardingStatus,
  ONBOARDING_PATH,
} from "@/lib/onboarding";
import { OnboardingBanner } from "@/components/admin/onboarding-banner";

type PageProps = {
  searchParams: Promise<{ date?: string }>;
};

const STEP_LABELS = {
  shop: "perfil da loja",
  team: "equipe",
  services: "serviços",
  products: "produtos",
  cash: "caixa",
} as const;

export default async function AdminDashboardPage({ searchParams }: PageProps) {
  const session = await getAdminSession();
  if (!session) redirect(LOGIN_PATH);

  const { date: dateParam } = await searchParams;
  const today = todayInTimezone();
  const date =
    dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : today;

  const supabase = await requireServerClient();

  let onboardingBanner: ReactNode = null;
  if (session.isOwner) {
    const onboarding = await getOnboardingStatus(supabase, session.shopId);
    if (onboarding.needsGuidedSetup) {
      redirect(ONBOARDING_PATH);
    }
    if (!onboarding.completed) {
      onboardingBanner = (
        <OnboardingBanner
          nextLabel={STEP_LABELS[onboarding.nextStepId]}
          requiredDone={onboarding.requiredDone}
          requiredTotal={onboarding.requiredTotal}
        />
      );
    }
  }

  const { data: allProfessionals } = await supabase
    .from("professionals")
    .select("id")
    .eq("shop_id", session.shopId)
    .eq("active", true)
    .order("nickname");

  const viewAllAgendas = canViewAllAgendas(session);

  const professionalIds = viewAllAgendas
    ? (allProfessionals ?? []).map((p) => p.id)
    : session.professionalId
      ? [session.professionalId]
      : [];

  let appointmentsQuery = supabase
    .from("appointments")
    .select(
      `
      id,
      professional_id,
      customer_id,
      customer_first_name,
      customer_last_name,
      customer_whatsapp,
      date,
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
    .eq("shop_id", session.shopId)
    .eq("date", date)
    .neq("status", "cancelled")
    .order("start_time");

  if (!viewAllAgendas && session.professionalId) {
    appointmentsQuery = appointmentsQuery.eq(
      "professional_id",
      session.professionalId
    );
  }

  const [dayContext, { data: services }, { data: products }, { data: rawAppointments }, pricingContext, bookingCounts, { data: shopSettings }] =
    await Promise.all([
      getAgendaDayContext(date, professionalIds, session.shopId),
      supabase
        .from("services")
        .select("id, name, duration_minutes, price_cents, photo_url, photo_position")
        .eq("shop_id", session.shopId)
        .eq("active", true)
        .order("name"),
      supabase
        .from("products")
        .select(
          "id, name, price_cents, commission_percent, stock_quantity, photo_url, photo_position, product_categories ( id, name )"
        )
        .eq("shop_id", session.shopId)
        .eq("active", true)
        .order("name"),
      appointmentsQuery,
      loadServicePricingContext(supabase, date, undefined, session.shopId),
      loadServiceBookingCounts(session.shopId),
      supabase
        .from("shops")
        .select(
          "name, confirmation_whatsapp_message, confirmation_whatsapp_enabled"
        )
        .eq("id", session.shopId)
        .maybeSingle(),
    ]);

  let cashRegister:
    | {
        cash: CashRegisterSummary;
        cashSession: CashRegisterSession | null;
        openCashRegister: CashRegisterSession | null;
        responsibleOptions: CashRegisterResponsibleOption[];
      }
    | undefined;

  if (session.isOwner) {
    const admin = requireAdminClient();
    if (!isActionResult(admin)) {
      const [cashSession, openCashRegister, responsibleOptions] =
        await Promise.all([
          getCashRegisterSession(admin, session.shopId, date),
          getOpenCashRegisterSession(admin, session.shopId),
          loadCashRegisterResponsibleOptions(admin, session.shopId, session.userId),
        ]);
      const cash = await getCashRegisterSummary(admin, session.shopId, date, {
        cashRegisterSessionId: cashSession?.id,
      });
      cashRegister = {
        cash,
        cashSession,
        openCashRegister,
        responsibleOptions,
      };
    }
  }

  const creditByWhatsapp = new Map<string, number>();
  const whatsappsWithoutCustomerId = [
    ...new Set(
      (rawAppointments ?? [])
        .filter((row) => !row.customer_id && row.customer_whatsapp)
        .map((row) => normalizeWhatsapp(row.customer_whatsapp))
        .filter((whatsapp): whatsapp is string => Boolean(whatsapp))
    ),
  ];

  if (whatsappsWithoutCustomerId.length > 0) {
    const lookupKeys = [
      ...new Set(
        whatsappsWithoutCustomerId.flatMap((whatsapp) =>
          whatsappLookupKeys(whatsapp)
        )
      ),
    ];
    const { data: creditRows } = await supabase
      .from("customers")
      .select("whatsapp, credit_balance_cents")
      .eq("shop_id", session.shopId)
      .in("whatsapp", lookupKeys);

    for (const row of creditRows ?? []) {
      const key = normalizeWhatsapp(row.whatsapp);
      if (!key) continue;
      creditByWhatsapp.set(key, row.credit_balance_cents ?? 0);
    }
  }

  const appointments: AppointmentItem[] = (rawAppointments ?? []).map((a) => {
    const rawCustomer = a.customers as
      | { credit_balance_cents?: number | null }
      | null;
    const customerWhatsapp = normalizeWhatsapp(a.customer_whatsapp);
    const customerCreditBalanceCents =
      typeof rawCustomer?.credit_balance_cents === "number"
        ? rawCustomer.credit_balance_cents
        : customerWhatsapp
          ? (creditByWhatsapp.get(customerWhatsapp) ?? 0)
          : 0;

    const rawPro = a.professionals as
      | { nickname: string }
      | { nickname: string }[]
      | null;
    const professionalNickname = Array.isArray(rawPro)
      ? (rawPro[0]?.nickname ?? "—")
      : (rawPro?.nickname ?? "—");

    return {
    id: a.id,
    date: a.date,
    professionalId: a.professional_id,
    professionalNickname,
    customerId: a.customer_id ?? null,
    customerCreditBalanceCents,
    customerFirstName: capitalizePersonName(a.customer_first_name),
    customerLastName: capitalizePersonName(a.customer_last_name),
    customerWhatsapp: a.customer_whatsapp,
    startTime: formatTime(a.start_time),
    endTime: formatTime(a.end_time),
    status: a.status as AppointmentItem["status"],
    isSqueezeIn: a.is_squeeze_in ?? false,
    isComandaExtra: a.is_comanda_extra ?? false,
    bookingSource: parseBookingSource(a.booking_source),
    services: (a.appointment_services ?? []).flatMap((row) => {
      const quantity = Math.max(
        1,
        (row as { quantity?: number | null }).quantity ?? 1
      );
      const raw = row.services as
        | { id: string; name: string; duration_minutes: number; price_cents: number }
        | { id: string; name: string; duration_minutes: number; price_cents: number }[]
        | null;
      const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
      return Array.from({ length: quantity }, () =>
        list.map((s) => ({
          id: s.id,
          name: s.name,
          durationMinutes: s.duration_minutes,
          priceCents: resolvePriceCentsOrFallback(
            {
              id: s.id,
              name: s.name,
              price_cents: s.price_cents,
            },
            pricingContext
          ),
        }))
      ).flat();
    }),
  };
  });

  const productsCatalog: ProductOption[] = (products ?? []).map((product) => {
    const category = product.product_categories as
      | { id: string; name: string }
      | { id: string; name: string }[]
      | null;
    const categoryRow = Array.isArray(category) ? category[0] : category;
    return {
      id: product.id,
      name: product.name,
      priceCents: product.price_cents,
      commissionPercent: product.commission_percent,
      stockQuantity: product.stock_quantity,
      categoryId: categoryRow?.id ?? "",
      categoryName: categoryRow?.name ?? "—",
      photoUrl: product.photo_url,
      photoPosition: product.photo_position,
    };
  });

  return (
    <div className="flex flex-col gap-4">
      {onboardingBanner}
      <AgendaView
        date={date}
        today={today}
        isOwner={session.isOwner}
        canViewAllAgendas={viewAllAgendas}
        professionalId={session.professionalId}
        permissions={session.permissions}
        dayContext={dayContext}
        appointments={appointments}
        services={buildAdminServicesCatalogForDate(
          services ?? [],
          pricingContext,
          bookingCounts
        )}
        productsCatalog={productsCatalog}
        cashRegister={cashRegister}
        shopName={shopSettings?.name ?? ""}
        confirmationWhatsappMessage={
          shopSettings?.confirmation_whatsapp_message?.trim()
            ? shopSettings.confirmation_whatsapp_message
            : DEFAULT_CONFIRMATION_WHATSAPP_MESSAGE
        }
        confirmationWhatsappEnabled={
          shopSettings?.confirmation_whatsapp_enabled ?? true
        }
      />
    </div>
  );
}
