import { notFound, redirect } from "next/navigation";
import { requireServerClient } from "@/lib/supabase/server";
import { requireAdminClient } from "@/lib/supabase/admin";
import { isActionResult } from "@/lib/is-action-result";
import { getAdminSession } from "@/lib/require-admin";
import { LOGIN_PATH } from "@/lib/login-path";
import { PageHeader } from "@/components/admin/page-header";
import { AdminFormPage } from "@/components/admin/admin-form-layout";
import { ProfessionalForm } from "@/components/admin/professional-form";
import type { DayRanges } from "@/lib/week-schedule";
import { formatTime } from "@/lib/format";
import { mapProfessionalPermissionsRow } from "@/lib/professional-permissions";
import { todayInTimezone } from "@/lib/availability";
import { shiftDate } from "@/lib/date-range";
import { getCommissionReport } from "@/lib/finance-reports";
import { listProfessionalCommissionPayouts } from "@/lib/commission-payout-service";
import { ADMIN_SURFACE } from "@/lib/admin-surface";
import { cn } from "@/lib/utils";
import { updateProfessional } from "../actions";

export const metadata = { title: "Editar profissional" };

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string; to?: string }>;
};

export default async function EditProfessionalPage({
  params,
  searchParams,
}: PageProps) {
  const session = await getAdminSession();
  if (!session) redirect(LOGIN_PATH);
  if (!session.isOwner) redirect("/admin");

  const { id } = await params;
  const { from: fromParam, to: toParam } = await searchParams;
  const today = todayInTimezone();
  let from =
    fromParam && /^\d{4}-\d{2}-\d{2}$/.test(fromParam)
      ? fromParam
      : shiftDate(today, -10);
  let to =
    toParam && /^\d{4}-\d{2}-\d{2}$/.test(toParam) ? toParam : today;
  if (from > to) [from, to] = [to, from];

  const supabase = await requireServerClient();

  const [{ data: professional }, { data: services }, { data: businessHours }] =
    await Promise.all([
      supabase
        .from("professionals")
        .select(
          "id, first_name, last_name, nickname, whatsapp, email, instagram, photo_url, photo_position, commission_percent, can_book_clients, can_create_squeeze_in, can_open_comanda, can_edit_comanda, can_close_comanda, can_edit_appointments, can_cancel_appointments, can_manage_schedule_blocks, professional_services(service_id), working_hours(weekday, start_time, end_time)"
        )
        .eq("id", id)
        .eq("shop_id", session.shopId)
        .single(),
      supabase
        .from("services")
        .select("id, name")
        .eq("shop_id", session.shopId)
        .eq("active", true)
        .order("name"),
      supabase
        .from("business_hours")
        .select("*")
        .eq("shop_id", session.shopId)
        .order("weekday"),
    ]);

  if (!professional) notFound();

  const updateWithId = updateProfessional.bind(null, professional.id);

  const schedule = Object.values(
    (professional.working_hours ?? []).reduce(
      (acc, wh) => {
        acc[wh.weekday] ??= { weekday: wh.weekday, ranges: [] };
        acc[wh.weekday].ranges.push({
          startTime: formatTime(wh.start_time),
          endTime: formatTime(wh.end_time),
        });
        return acc;
      },
      {} as Record<number, DayRanges>
    )
  ).map((day) => ({
    ...day,
    ranges: day.ranges.sort((a, b) => a.startTime.localeCompare(b.startTime)),
  }));

  const admin = requireAdminClient();
  let openCommissionCents = 0;
  let payouts: Awaited<ReturnType<typeof listProfessionalCommissionPayouts>> =
    [];

  if (!isActionResult(admin)) {
    const [report, payoutRows] = await Promise.all([
      getCommissionReport(admin, session.shopId, from, to, professional.id),
      listProfessionalCommissionPayouts(admin, session.shopId, professional.id),
    ]);
    openCommissionCents =
      report.professionals[0]?.summary.commissionCents ?? 0;
    payouts = payoutRows;
  }

  return (
    <div
      className={cn(
        "admin-page -m-4 flex min-h-full flex-col p-4 md:-m-8 md:p-8",
        ADMIN_SURFACE.page
      )}
    >
      <AdminFormPage tone="dark">
        <PageHeader
          tone="dark"
          title="Editar profissional"
          description={`${professional.nickname} — ${professional.first_name} ${professional.last_name}`}
          backHref="/admin/profissionais"
          backLabel="Profissionais"
        />

        <ProfessionalForm
          services={services ?? []}
          businessDays={(businessHours ?? []).map((b) => ({
            weekday: b.weekday,
            active: b.active,
            openTime: formatTime(b.open_time),
            closeTime: formatTime(b.close_time),
          }))}
          initialValues={{
            firstName: professional.first_name,
            lastName: professional.last_name,
            nickname: professional.nickname,
            whatsapp: professional.whatsapp,
            email: professional.email,
            instagram: professional.instagram ?? "",
            photoUrl: professional.photo_url,
            photoPosition: professional.photo_position,
            commissionPercent: professional.commission_percent ?? 50,
            serviceIds: (professional.professional_services ?? []).map(
              (ps) => ps.service_id
            ),
            schedule,
            permissions: mapProfessionalPermissionsRow(professional),
          }}
          onSubmit={updateWithId}
          submitLabel="Salvar alterações"
          isEdit
          commissions={{
            professionalId: professional.id,
            today,
            from,
            to,
            openCommissionCents,
            payouts,
          }}
        />
      </AdminFormPage>
    </div>
  );
}
