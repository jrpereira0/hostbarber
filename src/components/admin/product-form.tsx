"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { CircleDollarSign, Package } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AdminFormActions,
  AdminFormFields,
} from "@/components/admin/admin-form-layout";
import { FormSectionTitle } from "@/components/admin/form-section";
import { PhotoField } from "@/components/admin/photo-field";
import { StockAdjustPanel } from "@/components/admin/stock-adjust-panel";
import { formatPriceBRL } from "@/lib/format";
import {
  DEFAULT_PHOTO_POSITION,
  normalizePhotoPosition,
} from "@/lib/photo-position";
import type { ActionResult } from "@/lib/require-owner";
import { ADMIN_SURFACE } from "@/lib/admin-surface";
import { cn } from "@/lib/utils";

export type ProductCategoryOption = {
  id: string;
  name: string;
};

export type ProductFormValues = {
  name: string;
  description: string;
  categoryId: string;
  priceCents: number;
  commissionPercent: number;
  stockQuantity: number;
  photoUrl: string | null;
  photoPosition?: string | null;
};

type ProductFormProps = {
  categories: ProductCategoryOption[];
  initialValues?: ProductFormValues;
  /** Em edição o estoque sobe/desce pelo painel de ajuste, não pelo formulário. */
  mode?: "create" | "edit";
  productId?: string;
  onSubmit: (formData: FormData) => Promise<ActionResult>;
  submitLabel: string;
  /** Se definido, não redireciona para a lista após salvar. */
  onSaved?: () => void;
};

function formatCentsInput(cents: number): string {
  if (cents <= 0) return "";
  return formatPriceBRL(cents);
}

function DarkLabel({
  htmlFor,
  children,
}: {
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <Label htmlFor={htmlFor} className="text-[#f5f5f5]">
      {children}
    </Label>
  );
}

function FormPanel({ children }: { children: React.ReactNode }) {
  return (
    <div
      className={cn(
        ADMIN_SURFACE.panel,
        "flex flex-col gap-5 p-4 sm:gap-6 sm:p-6"
      )}
    >
      {children}
    </div>
  );
}

export function ProductForm({
  categories,
  initialValues,
  mode = initialValues ? "edit" : "create",
  productId,
  onSubmit,
  submitLabel,
  onSaved,
}: ProductFormProps) {
  const router = useRouter();
  const [preview, setPreview] = useState<string | null>(
    initialValues?.photoUrl ?? null
  );
  const [photoPosition, setPhotoPosition] = useState(
    normalizePhotoPosition(
      initialValues?.photoPosition ?? DEFAULT_PHOTO_POSITION
    )
  );
  const [categoryId, setCategoryId] = useState(
    initialValues?.categoryId ?? categories[0]?.id ?? ""
  );
  const [priceInput, setPriceInput] = useState(
    initialValues ? formatCentsInput(initialValues.priceCents) : ""
  );
  const [commissionInput, setCommissionInput] = useState(
    initialValues ? String(initialValues.commissionPercent) : "0"
  );
  const [stockInput, setStockInput] = useState(
    initialValues ? String(initialValues.stockQuantity) : "0"
  );
  const [busy, setBusy] = useState(false);

  const activeCategories = useMemo(
    () => categories.filter((category) => category.id),
    [categories]
  );

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!categoryId) {
      toast.error("Escolha uma categoria.");
      return;
    }

    setBusy(true);
    const formData = new FormData(event.currentTarget);
    formData.set("categoryId", categoryId);
    formData.set("priceCents", priceInput.replace(/\D/g, ""));
    formData.set("commissionPercent", commissionInput.replace(/\D/g, ""));
    formData.set("stockQuantity", stockInput.replace(/\D/g, ""));

    const result = await onSubmit(formData);
    if (result.ok) {
      toast.success(
        initialValues ? "Produto atualizado." : "Produto cadastrado."
      );
      if (onSaved) {
        onSaved();
        router.refresh();
      } else {
        router.push("/admin/produtos");
        router.refresh();
      }
    } else {
      toast.error(result.error);
    }
    setBusy(false);
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex w-full flex-col gap-4"
      autoComplete="off"
    >
      <FormPanel>
        <FormSectionTitle
          tone="dark"
          icon={Package}
          title="Informações do produto"
          description="Nome, categoria e foto usados na comanda."
        />

        <PhotoField
          preview={preview}
          position={photoPosition}
          onPreviewChange={setPreview}
          onPositionChange={setPhotoPosition}
          tone="dark"
          hint="Opcional. Você recorta e depois pode arrastar para posicionar."
        />

        <AdminFormFields columns={2}>
          <div className="space-y-2 sm:col-span-2">
            <DarkLabel htmlFor="name">Nome do produto</DarkLabel>
            <Input
              id="name"
              name="name"
              placeholder="Ex: Pomada modeladora"
              defaultValue={initialValues?.name ?? ""}
              required
              disabled={busy}
              className={ADMIN_SURFACE.input}
              autoComplete="off"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <DarkLabel>Categoria</DarkLabel>
              <Link
                href="/admin/produtos/categorias"
                className={cn(
                  "text-xs underline-offset-4 hover:underline",
                  ADMIN_SURFACE.accent
                )}
              >
                Gerenciar
              </Link>
            </div>
            <Select
              value={categoryId}
              onValueChange={setCategoryId}
              disabled={busy || activeCategories.length === 0}
            >
              <SelectTrigger className={ADMIN_SURFACE.selectTrigger}>
                <SelectValue placeholder="Escolha a categoria" />
              </SelectTrigger>
              <SelectContent className={ADMIN_SURFACE.popover}>
                {activeCategories.map((category) => (
                  <SelectItem key={category.id} value={category.id}>
                    {category.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2 sm:col-span-2">
            <DarkLabel htmlFor="description">Descrição (opcional)</DarkLabel>
            <Textarea
              id="description"
              name="description"
              defaultValue={initialValues?.description ?? ""}
              rows={3}
              placeholder="Detalhes para a equipe identificar o item."
              disabled={busy}
              className={cn("min-h-[5.5rem] resize-y", ADMIN_SURFACE.input)}
            />
          </div>
        </AdminFormFields>
      </FormPanel>

      <FormPanel>
        <FormSectionTitle
          tone="dark"
          icon={CircleDollarSign}
          title={mode === "edit" ? "Valores" : "Valores e estoque"}
          description={
            mode === "edit"
              ? "Comissão por produto. O estoque é ajustado no painel abaixo."
              : "Comissão por produto. O estoque baixa no fechamento da comanda."
          }
        />

        <AdminFormFields columns={mode === "edit" ? 2 : 3}>
          <div className="space-y-2">
            <DarkLabel htmlFor="priceCents">Preço de venda</DarkLabel>
            <Input
              id="priceCents"
              inputMode="numeric"
              value={priceInput}
              onChange={(event) => {
                const digits = event.target.value.replace(/\D/g, "");
                setPriceInput(
                  digits ? formatPriceBRL(Number.parseInt(digits, 10)) : ""
                );
              }}
              placeholder="R$ 0,00"
              disabled={busy}
              className={ADMIN_SURFACE.input}
              autoComplete="off"
            />
          </div>

          <div className="space-y-2">
            <DarkLabel htmlFor="commissionPercent">Comissão (%)</DarkLabel>
            <Input
              id="commissionPercent"
              inputMode="numeric"
              value={commissionInput}
              onChange={(event) =>
                setCommissionInput(event.target.value.replace(/\D/g, ""))
              }
              placeholder="0"
              disabled={busy}
              className={ADMIN_SURFACE.input}
              autoComplete="off"
            />
          </div>

          {mode === "create" ? (
            <div className="space-y-2">
              <DarkLabel htmlFor="stockQuantity">Estoque inicial</DarkLabel>
              <Input
                id="stockQuantity"
                inputMode="numeric"
                value={stockInput}
                onChange={(event) =>
                  setStockInput(event.target.value.replace(/\D/g, ""))
                }
                placeholder="0"
                disabled={busy}
                className={ADMIN_SURFACE.input}
                autoComplete="off"
              />
            </div>
          ) : null}
        </AdminFormFields>
      </FormPanel>

      {mode === "edit" && productId ? (
        <StockAdjustPanel
          productId={productId}
          stockQuantity={initialValues?.stockQuantity ?? 0}
        />
      ) : null}

      <AdminFormActions
        tone="dark"
        onCancel={() => router.push("/admin/produtos")}
        submitLabel={submitLabel}
        saving={busy}
        disabled={activeCategories.length === 0}
      />
    </form>
  );
}
