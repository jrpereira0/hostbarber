import Link from "next/link";
import { redirect } from "next/navigation";
import { requireServerClient } from "@/lib/supabase/server";
import { getAdminSession } from "@/lib/require-admin";
import { LOGIN_PATH } from "@/lib/login-path";
import { PageHeader } from "@/components/admin/page-header";
import { AdminFormPage } from "@/components/admin/admin-form-layout";
import { ProductForm } from "@/components/admin/product-form";
import { Button } from "@/components/ui/button";
import { ADMIN_SURFACE } from "@/lib/admin-surface";
import { cn } from "@/lib/utils";
import { createProduct } from "../actions";

export const metadata = { title: "Novo produto" };

export default async function NewProductPage() {
  const session = await getAdminSession();
  if (!session) redirect(LOGIN_PATH);
  if (!session.isOwner) redirect("/admin");

  const supabase = await requireServerClient();
  const { data: categories } = await supabase
    .from("product_categories")
    .select("id, name")
    .eq("shop_id", session.shopId)
    .eq("active", true)
    .order("sort_order")
    .order("name");

  if (!categories?.length) {
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
            title="Novo produto"
            description="Cadastre uma categoria antes de criar produtos."
            backHref="/admin/produtos"
            backLabel="Produtos"
          />
          <Button asChild className={ADMIN_SURFACE.btnPrimary}>
            <Link href="/admin/produtos/categorias">Ir para categorias</Link>
          </Button>
        </AdminFormPage>
      </div>
    );
  }

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
          title="Novo produto"
          description="Cadastre o item com preço, comissão e estoque."
          backHref="/admin/produtos"
          backLabel="Produtos"
        />

        <ProductForm
          categories={categories}
          onSubmit={createProduct}
          submitLabel="Cadastrar produto"
        />
      </AdminFormPage>
    </div>
  );
}
