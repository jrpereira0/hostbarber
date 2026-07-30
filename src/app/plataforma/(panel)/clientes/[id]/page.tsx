import { notFound } from "next/navigation";
import { PageHeader } from "@/components/admin/page-header";
import { PlatformShopForm } from "@/components/platform/platform-shop-form";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  mapPlatformShop,
  type PlatformShopRow,
} from "@/lib/shops/types";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditarClientePage({ params }: PageProps) {
  const { id } = await params;
  const admin = createAdminClient();
  if (!admin) notFound();

  const { data, error } = await admin
    .from("shops")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error || !data) notFound();

  const shop = mapPlatformShop(data as PlatformShopRow);

  return (
    <div className="flex w-full flex-col gap-6">
      <PageHeader
        tone="dark"
        title="Editar cliente"
        description={shop.name}
        backHref="/plataforma"
      />
      <PlatformShopForm mode="edit" shop={shop} />
    </div>
  );
}
