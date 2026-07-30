import { redirect } from "next/navigation";
import { requireServerClient } from "@/lib/supabase/server";
import { getAdminSession } from "@/lib/require-admin";
import { LOGIN_PATH } from "@/lib/login-path";
import { PageHeader } from "@/components/admin/page-header";
import { AdminFormPage } from "@/components/admin/admin-form-layout";
import { ServiceForm } from "@/components/admin/service-form";
import { ADMIN_SURFACE } from "@/lib/admin-surface";
import { cn } from "@/lib/utils";
import { createService } from "../actions";

export const metadata = { title: "Novo serviço" };

export default async function NewServicePage() {
  const session = await getAdminSession();
  if (!session) redirect(LOGIN_PATH);
  if (!session.isOwner) redirect("/admin");

  const supabase = await requireServerClient();
  const [{ data: professionals }, { data: businessHours }] = await Promise.all([
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
  ]);

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
          title="Novo serviço"
          description="Cadastre o serviço com preço por dia e duração."
          backHref="/admin/servicos"
          backLabel="Serviços"
        />

        <ServiceForm
          professionals={professionals ?? []}
          businessHours={businessHours ?? []}
          onSubmit={createService}
          submitLabel="Cadastrar serviço"
        />
      </AdminFormPage>
    </div>
  );
}
