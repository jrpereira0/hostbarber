import Link from "next/link";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import { PlatformShopsList } from "@/components/platform/platform-shops-list";
import { Button } from "@/components/ui/button";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  mapPlatformShop,
  type PlatformShop,
  type PlatformShopRow,
} from "@/lib/shops/types";
import { ADMIN_SURFACE } from "@/lib/admin-surface";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

async function withOwnerLastSignIn(
  shops: PlatformShop[]
): Promise<PlatformShop[]> {
  const admin = createAdminClient();
  if (!admin) return shops;

  return Promise.all(
    shops.map(async (shop) => {
      if (!shop.ownerUserId) return shop;
      try {
        const { data } = await admin.auth.admin.getUserById(shop.ownerUserId);
        return {
          ...shop,
          ownerLastSignInAt: data.user?.last_sign_in_at ?? null,
        };
      } catch {
        return shop;
      }
    })
  );
}

export default async function PlataformaHomePage() {
  const admin = createAdminClient();
  const { data } = admin
    ? await admin
        .from("shops")
        .select("*")
        .order("name", { ascending: true })
    : { data: null };

  const mapped = ((data ?? []) as PlatformShopRow[]).map(mapPlatformShop);
  const items = await withOwnerLastSignIn(mapped);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        tone="dark"
        title="Clientes"
        description="Controle as lojas da plataforma: busca, status e acesso."
        action={
          <Button asChild className={cn(ADMIN_SURFACE.btnPrimary)}>
            <Link href="/plataforma/clientes/nova">
              <Plus className="size-4" />
              Novo cliente
            </Link>
          </Button>
        }
      />
      <PlatformShopsList items={items} />
    </div>
  );
}
