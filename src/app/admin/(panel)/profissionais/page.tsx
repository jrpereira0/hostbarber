import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus, Users } from "lucide-react";
import { requireServerClient } from "@/lib/supabase/server";
import { getAdminSession } from "@/lib/require-admin";
import { LOGIN_PATH } from "@/lib/login-path";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/admin/page-header";
import { EmptyState } from "@/components/admin/empty-state";
import { ProfessionalsList } from "@/components/admin/professionals-list";
import { ADMIN_SURFACE } from "@/lib/admin-surface";
import { cn } from "@/lib/utils";

export const metadata = { title: "Profissionais" };

export default async function ProfessionalsPage() {
  const session = await getAdminSession();
  if (!session) redirect(LOGIN_PATH);
  if (!session.isOwner) redirect("/admin");

  const supabase = await requireServerClient();

  const { data: professionals } = await supabase
    .from("professionals")
    .select(
      "id, first_name, last_name, nickname, whatsapp, email, instagram, photo_url, photo_position, active, professional_services(service_id, services(name))"
    )
    .eq("shop_id", session.shopId)
    .order("nickname");

  const list = professionals ?? [];
  const activeCount = list.filter((p) => p.active).length;

  return (
    <div
      className={cn(
        "admin-page -m-4 flex min-h-full flex-col p-4 md:-m-8 md:p-8",
        ADMIN_SURFACE.page
      )}
    >
      <div
        data-tour="tour-professionals-page"
        className="mx-auto flex w-full max-w-6xl flex-col gap-4"
      >
        <PageHeader
          tone="dark"
          title="Profissionais"
          description={
            list.length === 0
              ? "Monte a equipe da sua barbearia."
              : `${list.length} cadastrado${list.length > 1 ? "s" : ""} · ${activeCount} ativo${activeCount === 1 ? "" : "s"}`
          }
        />

        {list.length === 0 ? (
          <EmptyState
            icon={Users}
            className="border-white/10 text-[#f5f5f5]"
            title="Nenhum profissional ainda"
            description="Cadastre o primeiro barbeiro da equipe. Ele já recebe acesso ao sistema pra acompanhar a própria agenda."
            action={
              <Button asChild className={ADMIN_SURFACE.btnPrimary}>
                <Link href="/admin/profissionais/novo">
                  <Plus />
                  Cadastrar o primeiro
                </Link>
              </Button>
            }
          />
        ) : (
          <ProfessionalsList
            items={list.map((p) => ({
              id: p.id,
              firstName: p.first_name,
              lastName: p.last_name,
              nickname: p.nickname,
              whatsapp: p.whatsapp,
              instagram: p.instagram,
              photoUrl: p.photo_url,
              photoPosition: p.photo_position,
              active: p.active,
              serviceNames: (p.professional_services ?? [])
                .map((ps) => {
                  const svc = ps.services as
                    | { name: string }
                    | { name: string }[]
                    | null;
                  return Array.isArray(svc) ? svc[0]?.name : svc?.name;
                })
                .filter((n): n is string => Boolean(n)),
            }))}
          />
        )}
      </div>
    </div>
  );
}
