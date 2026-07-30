import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus, Scissors } from "lucide-react";
import { requireServerClient } from "@/lib/supabase/server";
import { getAdminSession } from "@/lib/require-admin";
import { LOGIN_PATH } from "@/lib/login-path";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/admin/page-header";
import { EmptyState } from "@/components/admin/empty-state";
import { ServicesList } from "@/components/admin/services-list";
import { ADMIN_SURFACE } from "@/lib/admin-surface";
import { cn } from "@/lib/utils";

export const metadata = { title: "Serviços" };

export default async function ServicesPage() {
  const session = await getAdminSession();
  if (!session) redirect(LOGIN_PATH);
  if (!session.isOwner) redirect("/admin");

  const supabase = await requireServerClient();

  const { data: services } = await supabase
    .from("services")
    .select(
      "id, name, description, price_cents, price_from, duration_minutes, photo_url, photo_position, active, professional_services(professional_id, professionals(nickname))"
    )
    .eq("shop_id", session.shopId)
    .order("name");

  const serviceIds = (services ?? []).map((s) => s.id);
  const { data: weekdayPriceRows } =
    serviceIds.length === 0
      ? { data: [] as { service_id: string; weekday: number; price_cents: number }[] }
      : await supabase
          .from("service_weekday_prices")
          .select("service_id, weekday, price_cents")
          .in("service_id", serviceIds);

  const weekdayPricesByService = new Map<
    string,
    { weekday: number; priceCents: number }[]
  >();
  for (const row of weekdayPriceRows ?? []) {
    const list = weekdayPricesByService.get(row.service_id) ?? [];
    list.push({ weekday: row.weekday, priceCents: row.price_cents });
    weekdayPricesByService.set(row.service_id, list);
  }

  const list = services ?? [];
  const activeCount = list.filter((s) => s.active).length;

  return (
    <div
      className={cn(
        "admin-page -m-4 flex min-h-full flex-col p-4 md:-m-8 md:p-8",
        ADMIN_SURFACE.page
      )}
    >
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
        <PageHeader
          tone="dark"
          title="Serviços"
          description={
            list.length === 0
              ? "Monte o catálogo de serviços da barbearia."
              : `${list.length} cadastrado${list.length > 1 ? "s" : ""} · ${activeCount} ativo${activeCount === 1 ? "" : "s"}`
          }
        />

        {list.length === 0 ? (
          <EmptyState
            icon={Scissors}
            className="border-white/10 text-[#f5f5f5]"
            title="Nenhum serviço ainda"
            description="Cadastre os serviços com preço e duração. A duração é o que define os horários livres na agenda."
            action={
              <Button asChild className={ADMIN_SURFACE.btnPrimary}>
                <Link href="/admin/servicos/novo">
                  <Plus />
                  Cadastrar o primeiro
                </Link>
              </Button>
            }
          />
        ) : (
          <ServicesList
            items={list.map((s) => ({
              id: s.id,
              name: s.name,
              description: s.description,
              priceCents: s.price_cents,
              priceFrom: s.price_from ?? false,
              weekdayPrices: weekdayPricesByService.get(s.id) ?? [],
              durationMinutes: s.duration_minutes,
              photoUrl: s.photo_url,
              photoPosition: s.photo_position,
              active: s.active,
              professionalNames: (s.professional_services ?? [])
                .map((ps) => {
                  const pro = ps.professionals as
                    | { nickname: string }
                    | { nickname: string }[]
                    | null;
                  return Array.isArray(pro) ? pro[0]?.nickname : pro?.nickname;
                })
                .filter((n): n is string => Boolean(n)),
            }))}
          />
        )}
      </div>
    </div>
  );
}
