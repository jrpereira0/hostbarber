import { notFound } from "next/navigation";
import { requireServerClient } from "@/lib/supabase/server";
import { assertCustomerManagerPage } from "@/lib/require-owner";
import { PageHeader } from "@/components/admin/page-header";
import { AdminFormPage } from "@/components/admin/admin-form-layout";
import { type CustomerAppointment } from "@/components/admin/customer-form";
import { CustomerDetailTabs } from "@/components/admin/customer-detail-tabs";
import type {
  CustomerComandaHistoryItem,
  CustomerCreditHistoryItem,
} from "@/components/admin/customer-finance-panel";
import { formatTime } from "@/lib/format";
import type { PaymentMethod } from "@/lib/comanda-types";
import { ADMIN_SURFACE } from "@/lib/admin-surface";
import { capitalizePersonName } from "@/lib/text";
import { cn } from "@/lib/utils";
import { updateCustomer } from "../actions";

export const metadata = { title: "Cliente" };

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await assertCustomerManagerPage();

  const { id } = await params;
  const supabase = await requireServerClient();

  const { data: customer } = await supabase
    .from("customers")
    .select(
      `
      id,
      first_name,
      last_name,
      whatsapp,
      credit_balance_cents,
      appointments (
        id,
        date,
        start_time,
        status,
        professionals (nickname),
        appointment_services (
          services (name)
        )
      )
    `
    )
    .eq("id", id)
    .eq("shop_id", session.shopId)
    .single();

  if (!customer) notFound();

  const [{ data: comandas }, { data: creditTransactions }] = await Promise.all([
    supabase
      .from("comandas")
      .select(
        `
        id,
        appointment_id,
        service_date,
        closed_at,
        total_cents,
        professionals (nickname),
        comanda_payments (payment_method, amount_cents)
      `
      )
      .eq("shop_id", session.shopId)
      .eq("customer_whatsapp", customer.whatsapp)
      .eq("status", "closed")
      .order("service_date", { ascending: false })
      .order("closed_at", { ascending: false })
      .limit(50),
    supabase
      .from("customer_credit_transactions")
      .select(
        "id, amount_cents, type, payment_method, description, comanda_id, created_at"
      )
      .eq("customer_id", customer.id)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  type CustomerAppointmentRow = NonNullable<typeof customer.appointments>[number];

  const appointments = (customer.appointments ?? [])
    .map((a: CustomerAppointmentRow) => {
      const pro = a.professionals as
        | { nickname: string }
        | { nickname: string }[]
        | null;
      const professionalName = Array.isArray(pro)
        ? (pro[0]?.nickname ?? "—")
        : (pro?.nickname ?? "—");

      const serviceNames = (a.appointment_services ?? [])
        .map((link: NonNullable<typeof a.appointment_services>[number]) => {
          const svc = link.services as
            | { name: string }
            | { name: string }[]
            | null;
          return Array.isArray(svc) ? svc[0]?.name : svc?.name;
        })
        .filter((name: string | undefined): name is string => Boolean(name));

      return {
        id: a.id,
        date: a.date,
        startTime: formatTime(a.start_time),
        status: a.status as CustomerAppointment["status"],
        professionalName,
        serviceNames,
      };
    })
    .sort(
      (
        a: { date: string; startTime: string },
        b: { date: string; startTime: string }
      ) => {
        const dateCompare = b.date.localeCompare(a.date);
        if (dateCompare !== 0) return dateCompare;
        return b.startTime.localeCompare(a.startTime);
      }
    );

  const comandaHistory: CustomerComandaHistoryItem[] = (comandas ?? []).map(
    (row) => {
      const pro = row.professionals as
        | { nickname: string }
        | { nickname: string }[]
        | null;

      return {
        id: row.id,
        appointmentId: row.appointment_id,
        serviceDate: row.service_date,
        closedAt: row.closed_at,
        professionalNickname: Array.isArray(pro)
          ? (pro[0]?.nickname ?? "—")
          : (pro?.nickname ?? "—"),
        totalCents: row.total_cents,
        payments: (row.comanda_payments ?? []).map((payment) => ({
          method: payment.payment_method as PaymentMethod,
          amountCents: payment.amount_cents,
        })),
      };
    }
  );

  const creditHistory: CustomerCreditHistoryItem[] = (
    creditTransactions ?? []
  ).map((row) => ({
    id: row.id,
    amountCents: row.amount_cents,
    type: row.type as "add" | "use",
    paymentMethod: row.payment_method as PaymentMethod | null,
    description: row.description,
    comandaId: row.comanda_id,
    createdAt: row.created_at,
  }));

  const firstName = capitalizePersonName(customer.first_name);
  const lastName = capitalizePersonName(customer.last_name);
  const updateWithId = updateCustomer.bind(null, customer.id);

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
          title={`${firstName} ${lastName}`}
          description="Dados, visitas e financeiro do cliente"
          backHref="/admin/clientes"
          backLabel="Clientes"
        />

        <CustomerDetailTabs
          firstName={firstName}
          lastName={lastName}
          whatsapp={customer.whatsapp}
          customerId={customer.id}
          creditBalanceCents={customer.credit_balance_cents ?? 0}
          appointments={appointments}
          comandas={comandaHistory}
          creditTransactions={creditHistory}
          onSubmit={updateWithId}
          canManageCredit={session.isOwner}
        />
      </AdminFormPage>
    </div>
  );
}
