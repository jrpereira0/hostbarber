import { redirect } from "next/navigation";
import { Wallet } from "lucide-react";
import { getAdminSession } from "@/lib/require-admin";
import { requireAdminClient } from "@/lib/supabase/admin";
import { isActionResult } from "@/lib/is-action-result";
import { LOGIN_PATH } from "@/lib/login-path";
import { todayInTimezone } from "@/lib/availability";
import { getFinanceMetricsReport } from "@/lib/finance-reports";
import { parseFinanceMetric } from "@/lib/finance-metrics";
import { shiftDate } from "@/lib/date-range";
import { FinanceView } from "@/components/admin/finance-view";
import { EmptyState } from "@/components/admin/empty-state";

export const metadata = { title: "Financeiro" };

type PageProps = {
  searchParams: Promise<{
    from?: string;
    to?: string;
    date?: string;
    metric?: string;
  }>;
};

function isIsoDate(value: string | undefined): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function normalizeRange(
  fromParam: string | undefined,
  toParam: string | undefined,
  legacyDate: string | undefined,
  today: string
): { from: string; to: string } {
  const defaultFrom = shiftDate(today, -6);
  let from = isIsoDate(fromParam)
    ? fromParam
    : isIsoDate(legacyDate)
      ? legacyDate
      : defaultFrom;
  let to = isIsoDate(toParam)
    ? toParam
    : isIsoDate(legacyDate)
      ? legacyDate
      : today;

  if (from > to) [from, to] = [to, from];
  return { from, to };
}

export default async function FinanceiroPage({ searchParams }: PageProps) {
  const session = await getAdminSession();
  if (!session) redirect(LOGIN_PATH);
  if (!session.isOwner) redirect("/admin");

  const {
    from: fromParam,
    to: toParam,
    date: legacyDate,
    metric: metricParam,
  } = await searchParams;
  const today = todayInTimezone();
  const { from, to } = normalizeRange(fromParam, toParam, legacyDate, today);
  const metric = parseFinanceMetric(metricParam);
  const last7From = shiftDate(today, -6);
  const coversLast7 = from <= last7From && to >= today;

  const admin = requireAdminClient();
  if (isActionResult(admin)) {
    return (
      <div className="admin-page -m-4 flex min-h-full flex-col bg-[#0e0f11] p-4 text-[#f5f5f5] md:-m-8 md:p-8">
        <EmptyState
          icon={Wallet}
          className="border-white/10 text-[#f5f5f5]"
          title="Sistema indisponível"
          description="Não foi possível carregar o financeiro. Tente de novo em instantes."
        />
      </div>
    );
  }

  const [report, last7Report] = await Promise.all([
    getFinanceMetricsReport(admin, session.shopId, from, to),
    coversLast7
      ? Promise.resolve(null)
      : getFinanceMetricsReport(admin, session.shopId, last7From, today),
  ]);

  const last7Days = coversLast7
    ? report.byDay.filter(
        (day) => day.date >= last7From && day.date <= today
      )
    : (last7Report?.byDay ?? []);

  return (
    <div data-tour="tour-finance-page">
      <FinanceView
        from={from}
        to={to}
        today={today}
        metric={metric}
        report={report}
        last7Days={last7Days}
      />
    </div>
  );
}
