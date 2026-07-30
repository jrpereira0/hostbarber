import { redirect } from "next/navigation";
import { requireServerClient } from "@/lib/supabase/server";
import { getAdminSession } from "@/lib/require-admin";
import { LOGIN_PATH } from "@/lib/login-path";
import { PageHeader } from "@/components/admin/page-header";
import { AdminFormPage } from "@/components/admin/admin-form-layout";
import { ProfessionalForm } from "@/components/admin/professional-form";
import { formatTime } from "@/lib/format";
import { ADMIN_SURFACE } from "@/lib/admin-surface";
import { cn } from "@/lib/utils";
import { createProfessional } from "../actions";

export const metadata = { title: "Novo profissional" };

export default async function NewProfessionalPage() {
  const session = await getAdminSession();
  if (!session) redirect(LOGIN_PATH);
  if (!session.isOwner) redirect("/admin");

  const supabase = await requireServerClient();
  const [{ data: services }, { data: businessHours }] = await Promise.all([
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
          title="Novo profissional"
          description="Cadastre o barbeiro e crie o acesso dele ao sistema."
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
          onSubmit={createProfessional}
          submitLabel="Cadastrar profissional"
        />
      </AdminFormPage>
    </div>
  );
}
