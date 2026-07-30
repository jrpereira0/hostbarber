import { notFound, redirect } from "next/navigation";
import { requireServerClient } from "@/lib/supabase/server";
import { getAdminSession } from "@/lib/require-admin";
import { LOGIN_PATH } from "@/lib/login-path";
import { PageHeader } from "@/components/admin/page-header";
import { AdminFormPage } from "@/components/admin/admin-form-layout";
import { ProductForm } from "@/components/admin/product-form";
import { ADMIN_SURFACE } from "@/lib/admin-surface";
import { cn } from "@/lib/utils";
import { updateProduct } from "../actions";

export const metadata = { title: "Editar produto" };

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditProductPage({ params }: PageProps) {
  const session = await getAdminSession();
  if (!session) redirect(LOGIN_PATH);
  if (!session.isOwner) redirect("/admin");

  const { id } = await params;
  const supabase = await requireServerClient();

  const [{ data: product }, { data: categories }] = await Promise.all([
    supabase
      .from("products")
      .select(
        "id, name, description, category_id, price_cents, commission_percent, stock_quantity, photo_url, photo_position"
      )
      .eq("id", id)
      .eq("shop_id", session.shopId)
      .maybeSingle(),
    supabase
      .from("product_categories")
      .select("id, name")
      .eq("shop_id", session.shopId)
      .eq("active", true)
      .order("sort_order")
      .order("name"),
  ]);

  if (!product || !categories?.length) {
    notFound();
  }

  const updateWithId = updateProduct.bind(null, product.id);

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
          title={product.name}
          description="Atualize preço, comissão e estoque."
          backHref="/admin/produtos"
          backLabel="Produtos"
        />

        <ProductForm
          categories={categories}
          mode="edit"
          productId={product.id}
          initialValues={{
            name: product.name,
            description: product.description,
            categoryId: product.category_id,
            priceCents: product.price_cents,
            commissionPercent: product.commission_percent,
            stockQuantity: product.stock_quantity,
            photoUrl: product.photo_url,
            photoPosition: product.photo_position,
          }}
          onSubmit={updateWithId}
          submitLabel="Salvar alterações"
        />
      </AdminFormPage>
    </div>
  );
}
