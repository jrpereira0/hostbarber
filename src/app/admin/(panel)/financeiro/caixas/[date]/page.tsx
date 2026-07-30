import { notFound } from "next/navigation";
import { Wallet } from "lucide-react";
import { assertOwnerPage } from "@/lib/require-owner";
import { requireAdminClient } from "@/lib/supabase/admin";
import { isActionResult } from "@/lib/is-action-result";
import { todayInTimezone } from "@/lib/availability";
import {
  getCashRegisterSession,
  getOpenCashRegisterSession,
} from "@/lib/cash-register-service";
import { getCashRegisterSummary } from "@/lib/finance-reports";
import { loadCashRegisterResponsibleOptions } from "@/lib/cash-register-options";
import { getAdminSession } from "@/lib/require-admin";
import { formatDateBR } from "@/lib/format";
import {
  buildAdminServicesCatalogForDate,
  loadServicePricingContext,
} from "@/lib/service-prices-for-date";
import { CashRegisterDetailView } from "@/components/admin/cash-register-detail-view";
import { EmptyState } from "@/components/admin/empty-state";
import type { ProductOption } from "@/lib/product-types";
import type { ServiceOption } from "@/components/admin/new-appointment-dialog";

type PageProps = {
  params: Promise<{ date: string }>;
  searchParams: Promise<{ from?: string; to?: string }>;
};

export async function generateMetadata({ params }: PageProps) {
  const { date } = await params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { title: "Caixa" };
  }
  return { title: `Caixa · ${formatDateBR(date)}` };
}

export default async function CaixaDetalhePage({
  params,
  searchParams,
}: PageProps) {
  await assertOwnerPage();

  const { date } = await params;
  const { from: fromParam, to: toParam } = await searchParams;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) notFound();

  const today = todayInTimezone();
  const admin = requireAdminClient();
  if (isActionResult(admin)) {
    return (
      <EmptyState
        icon={Wallet}
        title="Sistema indisponível"
        description="Não foi possível carregar o caixa. Tente de novo em instantes."
      />
    );
  }

  const adminSession = await getAdminSession();
  if (!adminSession) {
    return (
      <EmptyState
        icon={Wallet}
        title="Sessão expirada"
        description="Faça login de novo para ver o caixa."
      />
    );
  }

  const [
    cashSession,
    openCashRegister,
    responsibleOptions,
    servicesResult,
    productsResult,
    professionalsResult,
    pricingContext,
  ] = await Promise.all([
    getCashRegisterSession(admin, adminSession.shopId, date),
    getOpenCashRegisterSession(admin, adminSession.shopId),
    loadCashRegisterResponsibleOptions(admin, adminSession.shopId, adminSession.userId),
    admin
      .from("services")
      .select("id, name, duration_minutes, price_cents, photo_url, photo_position")
      .eq("shop_id", adminSession.shopId)
      .eq("active", true)
      .order("name"),
    admin
      .from("products")
      .select(
        "id, name, price_cents, commission_percent, stock_quantity, photo_url, photo_position, product_categories ( id, name )"
      )
      .eq("shop_id", adminSession.shopId)
      .eq("active", true)
      .order("name"),
    admin
      .from("professionals")
      .select(
        "id, nickname, photo_url, photo_position, commission_percent, professional_services ( service_id )"
      )
      .eq("shop_id", adminSession.shopId)
      .eq("active", true)
      .order("nickname"),
    loadServicePricingContext(admin, date, undefined, adminSession.shopId),
  ]);

  const cash = await getCashRegisterSummary(admin, adminSession.shopId, date, {
    cashRegisterSessionId: cashSession?.id,
  });

  const listFrom =
    fromParam && /^\d{4}-\d{2}-\d{2}$/.test(fromParam) ? fromParam : date;
  const listTo =
    toParam && /^\d{4}-\d{2}-\d{2}$/.test(toParam) ? toParam : date;
  const backHref = `/admin/financeiro/caixas?from=${listFrom}&to=${listTo}`;

  const servicesCatalog: ServiceOption[] = buildAdminServicesCatalogForDate(
    servicesResult.data ?? [],
    pricingContext
  );

  const productsCatalog: ProductOption[] = (productsResult.data ?? []).map(
    (product) => {
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
    }
  );

  const professionals = (professionalsResult.data ?? []).map((pro) => ({
    id: pro.id,
    nickname: pro.nickname,
    photoUrl: pro.photo_url ?? null,
    photoPosition: pro.photo_position,
    commissionPercent: pro.commission_percent ?? 50,
    serviceIds: (pro.professional_services ?? []).map(
      (row: { service_id: string }) => row.service_id
    ),
  }));

  return (
    <CashRegisterDetailView
      date={date}
      today={today}
      backHref={backHref}
      cash={cash}
      cashSession={cashSession}
      openCashRegister={openCashRegister}
      responsibleOptions={responsibleOptions}
      servicesCatalog={servicesCatalog}
      productsCatalog={productsCatalog}
      professionals={professionals}
      isOwner
      initialCashRegisterOpen={cashSession?.status === "open"}
      initialOpenCashRegisterDate={openCashRegister?.serviceDate ?? null}
    />
  );
}
