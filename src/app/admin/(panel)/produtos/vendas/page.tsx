import { redirect } from "next/navigation";
import { Package } from "lucide-react";
import { getAdminSession } from "@/lib/require-admin";
import { requireAdminClient } from "@/lib/supabase/admin";
import { isActionResult } from "@/lib/is-action-result";
import { LOGIN_PATH } from "@/lib/login-path";
import { todayInTimezone } from "@/lib/availability";
import { getProductSalesReport } from "@/lib/product-sales-report";
import { shiftDate } from "@/lib/date-range";
import { ProductSalesView } from "@/components/admin/product-sales-view";
import { EmptyState } from "@/components/admin/empty-state";
import { ADMIN_SURFACE } from "@/lib/admin-surface";
import { cn } from "@/lib/utils";

export const metadata = { title: "Vendas de produtos" };

type PageProps = {
  searchParams: Promise<{ from?: string; to?: string }>;
};

function isIsoDate(value: string | undefined): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

export default async function ProductSalesPage({ searchParams }: PageProps) {
  const session = await getAdminSession();
  if (!session) redirect(LOGIN_PATH);
  if (!session.isOwner) redirect("/admin");

  const { from: fromParam, to: toParam } = await searchParams;
  const today = todayInTimezone();
  let from = isIsoDate(fromParam) ? fromParam : shiftDate(today, -6);
  let to = isIsoDate(toParam) ? toParam : today;
  if (from > to) [from, to] = [to, from];

  const admin = requireAdminClient();
  if (isActionResult(admin)) {
    return (
      <div
        className={cn(
          "admin-page -m-4 flex min-h-full flex-col p-4 md:-m-8 md:p-8",
          ADMIN_SURFACE.page
        )}
      >
        <EmptyState
          icon={Package}
          className="border-white/10 text-[#f5f5f5]"
          title="Sistema indisponível"
          description="Não foi possível carregar as vendas. Tente de novo em instantes."
        />
      </div>
    );
  }

  const report = await getProductSalesReport(admin, session.shopId, from, to);

  return (
    <ProductSalesView
      from={from}
      to={to}
      today={today}
      report={report}
      title="Vendas de produtos"
      description="Quantidade, faturamento e quem vendeu no período."
      backHref="/admin/produtos"
      backLabel="Produtos"
      basePath="/admin/produtos/vendas"
    />
  );
}
