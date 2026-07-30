import Link from "next/link";
import { Contact, Plus } from "lucide-react";
import { requireServerClient } from "@/lib/supabase/server";
import { assertCustomerManagerPage } from "@/lib/require-owner";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/admin/page-header";
import { EmptyState } from "@/components/admin/empty-state";
import { CustomersList } from "@/components/admin/customers-list";
import { compareAlphabetically, capitalizePersonName } from "@/lib/text";
import { ADMIN_SURFACE } from "@/lib/admin-surface";
import { cn } from "@/lib/utils";

export const metadata = { title: "Clientes" };

type AppointmentRow = {
  date: string;
  status: string;
};

function mapCustomer(c: {
  id: string;
  first_name: string;
  last_name: string;
  whatsapp: string;
  created_at: string;
  appointments: AppointmentRow[] | null;
}) {
  const appts = Array.isArray(c.appointments)
    ? c.appointments.filter(
        (a): a is AppointmentRow => "date" in a && "status" in a
      )
    : [];

  const doneAppts = appts.filter((a) => a.status === "done");
  const appointmentCount = doneAppts.length;
  const canDelete = !appts.some(
    (a) =>
      a.status === "done" ||
      a.status === "scheduled" ||
      a.status === "confirmed"
  );

  const lastVisitDate =
    [...doneAppts].sort((a, b) => b.date.localeCompare(a.date))[0]?.date ??
    null;

  return {
    id: c.id,
    firstName: capitalizePersonName(c.first_name),
    lastName: capitalizePersonName(c.last_name),
    whatsapp: c.whatsapp,
    appointmentCount,
    canDelete,
    lastVisitDate,
    memberSince: c.created_at.slice(0, 10),
  };
}

export default async function CustomersPage() {
  const session = await assertCustomerManagerPage();

  const supabase = await requireServerClient();

  const { data: customers } = await supabase
    .from("customers")
    .select(
      `
      id,
      first_name,
      last_name,
      whatsapp,
      created_at,
      appointments (date, status)
    `
    )
    .eq("shop_id", session.shopId)
    .order("first_name")
    .order("last_name");

  const list = (customers ?? [])
    .map(mapCustomer)
    .sort((a, b) =>
      compareAlphabetically(
        `${a.firstName} ${a.lastName}`,
        `${b.firstName} ${b.lastName}`
      )
    );
  const withVisits = list.filter((c) => c.appointmentCount > 0).length;

  return (
    <div
      className={cn(
        "admin-page -m-4 flex min-h-full flex-col p-4 md:-m-8 md:p-8",
        ADMIN_SURFACE.page
      )}
    >
      <div
        data-tour="tour-clients-page"
        className="mx-auto flex w-full max-w-6xl flex-col gap-4"
      >
        <PageHeader
          tone="dark"
          title="Clientes"
          description={
            list.length === 0
              ? "Cadastre clientes ou eles entram sozinhos ao agendar."
              : `${list.length} cadastrado${list.length === 1 ? "" : "s"} · ${withVisits} com visita${withVisits === 1 ? "" : "s"}`
          }
        />

        {list.length === 0 ? (
          <EmptyState
            icon={Contact}
            className="border-white/10 text-[#f5f5f5]"
            title="Nenhum cliente ainda"
            description="Cadastre manualmente ou aguarde o primeiro agendamento pela página."
            action={
              <Button asChild className={ADMIN_SURFACE.btnPrimary}>
                <Link href="/admin/clientes/novo">
                  <Plus />
                  Cadastrar o primeiro
                </Link>
              </Button>
            }
          />
        ) : (
          <CustomersList
            items={list}
            canDeleteCustomers={session.isOwner}
          />
        )}
      </div>
    </div>
  );
}
