import { PageHeader } from "@/components/admin/page-header";
import { PlatformShopForm } from "@/components/platform/platform-shop-form";

export const dynamic = "force-dynamic";

export default function NovoClientePage() {
  return (
    <div className="flex w-full flex-col gap-6">
      <PageHeader
        tone="dark"
        title="Novo cliente"
        description="Preencha as abas com os dados da loja e as credenciais do dono."
        backHref="/plataforma"
      />
      <PlatformShopForm mode="create" />
    </div>
  );
}
