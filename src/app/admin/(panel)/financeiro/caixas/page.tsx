import { Wallet } from "lucide-react";
import { assertOwnerPage } from "@/lib/require-owner";
import { requireAdminClient } from "@/lib/supabase/admin";
import { isActionResult } from "@/lib/is-action-result";
import { todayInTimezone } from "@/lib/availability";
import { listCashRegisterSessions, getOpenCashRegisterSession } from "@/lib/cash-register-service";
import { loadCashRegisterResponsibleOptions } from "@/lib/cash-register-options";
import { getAdminSession } from "@/lib/require-admin";
import { shiftDate } from "@/lib/date-range";
import { CashRegisterHistoryView } from "@/components/admin/cash-register-history-view";
import { EmptyState } from "@/components/admin/empty-state";

export const metadata = { title: "Caixas" };

type PageProps = {
  searchParams: Promise<{ from?: string; to?: string }>;
};

export default async function CaixasPage({ searchParams }: PageProps) {
  await assertOwnerPage();

  const { from: fromParam, to: toParam } = await searchParams;
  const today = todayInTimezone();
  const defaultFrom = shiftDate(today, -7);
  let from =
    fromParam && /^\d{4}-\d{2}-\d{2}$/.test(fromParam) ? fromParam : defaultFrom;
  let to =
    toParam && /^\d{4}-\d{2}-\d{2}$/.test(toParam) ? toParam : today;

  if (from > to) [from, to] = [to, from];

  const admin = requireAdminClient();
  if (isActionResult(admin)) {
    return (
      <EmptyState
        icon={Wallet}
        title="Sistema indisponível"
        description="Não foi possível carregar o histórico. Tente de novo em instantes."
      />
    );
  }

  const adminSession = await getAdminSession();
  if (!adminSession) {
    return (
      <EmptyState
        icon={Wallet}
        title="Sessão expirada"
        description="Faça login de novo para ver o histórico de caixa."
      />
    );
  }

  const [sessions, openCashRegister, responsibleOptions] = await Promise.all([
    listCashRegisterSessions(admin, adminSession.shopId, from, to),
    getOpenCashRegisterSession(admin, adminSession.shopId),
    loadCashRegisterResponsibleOptions(admin, adminSession.shopId, adminSession.userId),
  ]);

  return (
    <div data-tour="tour-caixas-page">
      <CashRegisterHistoryView
        from={from}
        to={to}
        today={today}
        sessions={sessions}
        openCashRegister={openCashRegister}
        responsibleOptions={responsibleOptions}
      />
    </div>
  );
}
