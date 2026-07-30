import { notFound, redirect } from "next/navigation";
import { requireServerClient } from "@/lib/supabase/server";
import { getAdminSession } from "@/lib/require-admin";
import { LOGIN_PATH } from "@/lib/login-path";
import { PageHeader } from "@/components/admin/page-header";
import { AdminFormPage } from "@/components/admin/admin-form-layout";
import { ServiceForm } from "@/components/admin/service-form";
import { ADMIN_SURFACE } from "@/lib/admin-surface";
import { cn } from "@/lib/utils";
import { updateService } from "../actions";

export const metadata = { title: "Editar serviço" };

export default async function EditServicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getAdminSession();
  if (!session) redirect(LOGIN_PATH);
  if (!session.isOwner) redirect("/admin");

  const { id } = await params;
  const supabase = await requireServerClient();

  const [
    { data: service },
    { data: professionals },
    { data: businessHours },
    { data: weekdayPrices },
  ] = await Promise.all([
    supabase
      .from("services")
      .select(
        "id, name, description, price_cents, price_from, duration_minutes, photo_url, photo_position, professional_services(professional_id)"
      )
      .eq("id", id)
      .eq("shop_id", session.shopId)
      .single(),
    supabase
      .from("professionals")
      .select("id, nickname")
      .eq("shop_id", session.shopId)
      .eq("active", true)
      .order("nickname"),
    supabase
      .from("business_hours")
      .select("weekday, active")
      .eq("shop_id", session.shopId)
      .order("weekday"),
    supabase
      .from("service_weekday_prices")
      .select("weekday, price_cents")
      .eq("service_id", id)
      .order("weekday"),
  ]);

  if (!service) notFound();

  const updateWithId = updateService.bind(null, service.id);

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
          title="Editar serviço"
          description={service.name}
          backHref="/admin/servicos"
          backLabel="Serviços"
        />

        <ServiceForm
          professionals={professionals ?? []}
          businessHours={businessHours ?? []}
          initialValues={{
            name: service.name,
            description: service.description,
            durationMinutes: service.duration_minutes,
            photoUrl: service.photo_url,
            photoPosition: service.photo_position,
            professionalIds: (service.professional_services ?? []).map(
              (ps) => ps.professional_id
            ),
            weekdayPrices: (weekdayPrices ?? []).map((row) => ({
              weekday: row.weekday,
              priceCents: row.price_cents,
            })),
            priceFrom: service.price_from ?? false,
          }}
          onSubmit={updateWithId}
          submitLabel="Salvar alterações"
          isEdit
        />
      </AdminFormPage>
    </div>
  );
}
