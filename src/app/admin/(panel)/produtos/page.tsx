import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus, Package } from "lucide-react";
import { requireServerClient } from "@/lib/supabase/server";
import { getAdminSession } from "@/lib/require-admin";
import { LOGIN_PATH } from "@/lib/login-path";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/admin/page-header";
import { EmptyState } from "@/components/admin/empty-state";
import { ProductsList } from "@/components/admin/products-list";
import { ADMIN_SURFACE } from "@/lib/admin-surface";
import { cn } from "@/lib/utils";

export const metadata = { title: "Produtos" };

export default async function ProductsPage() {
  const session = await getAdminSession();
  if (!session) redirect(LOGIN_PATH);
  if (!session.isOwner) redirect("/admin");

  const supabase = await requireServerClient();

  const { data: products } = await supabase
    .from("products")
    .select(
      "id, name, description, price_cents, commission_percent, stock_quantity, photo_url, photo_position, active, product_categories ( name )"
    )
    .eq("shop_id", session.shopId)
    .order("name");

  const list = products ?? [];
  const activeCount = list.filter((product) => product.active).length;

  return (
    <div
      className={cn(
        "admin-page -m-4 flex min-h-full flex-col p-4 md:-m-8 md:p-8",
        ADMIN_SURFACE.page
      )}
    >
      <div
        data-tour="tour-products-page"
        className="mx-auto flex w-full max-w-6xl flex-col gap-4"
      >
        <PageHeader
          tone="dark"
          title="Produtos"
          description={
            list.length === 0
              ? "Cadastre produtos e itens da geladeira para vender na comanda."
              : `${list.length} cadastrado${list.length > 1 ? "s" : ""} · ${activeCount} ativo${activeCount === 1 ? "" : "s"}`
          }
          action={
            list.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                <Button asChild variant="outline" size="sm" className={ADMIN_SURFACE.btnGhost}>
                  <Link href="/admin/financeiro?metric=produtos">Vendas</Link>
                </Button>
                <Button asChild variant="outline" size="sm" className={ADMIN_SURFACE.btnGhost}>
                  <Link href="/admin/produtos/categorias">Categorias</Link>
                </Button>
                <Button asChild size="sm" className={ADMIN_SURFACE.btnPrimary}>
                  <Link href="/admin/produtos/novo">
                    <Plus />
                    Novo
                  </Link>
                </Button>
              </div>
            ) : undefined
          }
        />

        {list.length === 0 ? (
          <EmptyState
            icon={Package}
            className="border-white/10 text-[#f5f5f5]"
            title="Nenhum produto ainda"
            description="Cadastre pomadas, bebidas e outros itens com preço, comissão e estoque."
            action={
              <Button asChild className={ADMIN_SURFACE.btnPrimary}>
                <Link href="/admin/produtos/novo">
                  <Plus />
                  Cadastrar o primeiro
                </Link>
              </Button>
            }
          />
        ) : (
          <ProductsList
            items={list.map((product) => {
              const category = product.product_categories as
                | { name: string }
                | { name: string }[]
                | null;
              const categoryName = Array.isArray(category)
                ? (category[0]?.name ?? "—")
                : (category?.name ?? "—");

              return {
                id: product.id,
                name: product.name,
                description: product.description,
                priceCents: product.price_cents,
                commissionPercent: product.commission_percent,
                stockQuantity: product.stock_quantity,
                photoUrl: product.photo_url,
                photoPosition: product.photo_position,
                active: product.active,
                categoryName,
              };
            })}
          />
        )}
      </div>
    </div>
  );
}
