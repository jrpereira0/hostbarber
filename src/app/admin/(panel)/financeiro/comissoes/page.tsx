import { redirect } from "next/navigation";
import { Percent } from "lucide-react";
import { getAdminSession } from "@/lib/require-admin";
import { requireAdminClient } from "@/lib/supabase/admin";
import { isActionResult } from "@/lib/is-action-result";
import { LOGIN_PATH } from "@/lib/login-path";
import { todayInTimezone } from "@/lib/availability";
import { getCommissionReport } from "@/lib/finance-reports";
import {
  listProfessionalCommissionPayouts,
  type CommissionPayout,
} from "@/lib/commission-payout-service";
import { shiftDate } from "@/lib/date-range";
import { CommissionsView } from "@/components/admin/commissions-view";
import { EmptyState } from "@/components/admin/empty-state";

export const metadata = { title: "Comissões" };

type PageProps = {
  searchParams: Promise<{ from?: string; to?: string; professionalId?: string }>;
};

export default async function ComissoesPage({ searchParams }: PageProps) {
  const session = await getAdminSession();
  if (!session) redirect(LOGIN_PATH);
  if (session.isReception) redirect("/admin");

  const { from: fromParam, to: toParam, professionalId } = await searchParams;
  const today = todayInTimezone();
  const defaultFrom = shiftDate(today, -10);
  let from =
    fromParam && /^\d{4}-\d{2}-\d{2}$/.test(fromParam) ? fromParam : defaultFrom;
  let to =
    toParam && /^\d{4}-\d{2}-\d{2}$/.test(toParam) ? toParam : today;

  if (from > to) {
    [from, to] = [to, from];
  }

  if (!session.isOwner && !session.professionalId) {
    return (
      <EmptyState
        icon={Percent}
        title="Perfil sem vínculo"
        description="Seu login ainda não está ligado a um barbeiro. Peça ao dono da barbearia para conferir o cadastro."
      />
    );
  }

  const admin = requireAdminClient();
  if (isActionResult(admin)) {
    return (
      <EmptyState
        icon={Percent}
        title="Sistema indisponível"
        description="Não foi possível carregar as comissões. Tente de novo em instantes."
      />
    );
  }

  let professionalsQuery = admin
    .from("professionals")
    .select("id, nickname, commission_percent")
    .eq("shop_id", session.shopId)
    .eq("active", true)
    .order("nickname");

  if (!session.isOwner && session.professionalId) {
    professionalsQuery = professionalsQuery.eq("id", session.professionalId);
  }

  const { data: professionalsData } = await professionalsQuery;

  const professionals = (professionalsData ?? []).map((row) => ({
    id: row.id,
    nickname: row.nickname,
    commissionPercent: row.commission_percent ?? 50,
  }));

  // Dono sempre carrega o relatório completo — a seleção do barbeiro é só no cliente.
  const reportScopeId = session.isOwner
    ? undefined
    : (session.professionalId ?? undefined);

  const report = await getCommissionReport(admin, session.shopId, from, to, reportScopeId);

  const initialProfessionalId = session.isOwner
    ? professionalId && professionals.some((p) => p.id === professionalId)
      ? professionalId
      : null
    : (session.professionalId ?? null);

  const payoutTargets = session.isOwner
    ? professionals.map((p) => p.id)
    : session.professionalId
      ? [session.professionalId]
      : [];

  const payoutEntries = await Promise.all(
    payoutTargets.map(async (id) => {
      const rows = await listProfessionalCommissionPayouts(admin, session.shopId, id);
      return [id, rows] as const;
    })
  );

  const payoutsByProfessionalId: Record<string, CommissionPayout[]> =
    Object.fromEntries(payoutEntries);

  return (
    <CommissionsView
      from={from}
      to={to}
      today={today}
      professionalId={initialProfessionalId}
      report={report}
      professionals={professionals}
      payoutsByProfessionalId={payoutsByProfessionalId}
      isOwner={session.isOwner}
    />
  );
}
