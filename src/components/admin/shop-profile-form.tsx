"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { toast } from "sonner";
import { AtSign, Camera, Loader2, MapPin, Phone, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FormSectionTitle } from "@/components/admin/form-section";
import { compressImage } from "@/lib/compress-image";
import { DEFAULT_SHOP_LOGO_PATH } from "@/lib/brand";
import { formatCep, formatWhatsapp } from "@/lib/format";
import { fetchAddressByCep } from "@/lib/viacep";
import { saveShopProfile } from "@/app/admin/(panel)/configuracoes/actions";
import { ADMIN_SURFACE } from "@/lib/admin-surface";
import { cn } from "@/lib/utils";

export type ShopProfileValues = {
  shopName: string;
  bio: string;
  cep: string;
  street: string;
  addressNumber: string;
  addressComplement: string;
  neighborhood: string;
  city: string;
  state: string;
  whatsapp: string;
  instagram: string;
  logoUrl: string | null;
};

type ShopProfileFormProps = {
  initialValues: ShopProfileValues;
  /** Chamado após salvar com sucesso (ex.: onboarding avança a etapa). */
  onSaved?: () => void;
  submitLabel?: string;
};

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

function FieldHint({ children }: { children: React.ReactNode }) {
  return <p className={cn("text-xs", ADMIN_SURFACE.muted)}>{children}</p>;
}

export function ShopProfileForm({
  initialValues,
  onSaved,
  submitLabel = "Salvar alterações",
}: ShopProfileFormProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(
    initialValues.logoUrl ?? DEFAULT_SHOP_LOGO_PATH
  );
  const [whatsapp, setWhatsapp] = useState(
    initialValues.whatsapp ? formatWhatsapp(initialValues.whatsapp) : ""
  );
  const [cep, setCep] = useState(initialValues.cep);
  const [street, setStreet] = useState(initialValues.street);
  const [neighborhood, setNeighborhood] = useState(initialValues.neighborhood);
  const [city, setCity] = useState(initialValues.city);
  const [state, setState] = useState(initialValues.state);
  const [loadingCep, setLoadingCep] = useState(false);
  const [saving, setSaving] = useState(false);

  function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) setPreview(URL.createObjectURL(file));
  }

  async function lookupCep(rawCep?: string) {
    const digits = (rawCep ?? cep).replace(/\D/g, "");
    if (digits.length !== 8) {
      toast.error("Informe um CEP com 8 dígitos.");
      return;
    }

    setLoadingCep(true);
    const result = await fetchAddressByCep(digits);
    setLoadingCep(false);

    if ("error" in result) {
      toast.error(result.error);
      return;
    }

    setCep(formatCep(result.cep));
    setStreet(result.street);
    setNeighborhood(result.neighborhood);
    setCity(result.city);
    setState(result.state);
  }

  function handleCepChange(value: string) {
    const formatted = formatCep(value);
    setCep(formatted);
    const digits = formatted.replace(/\D/g, "");
    if (digits.length === 8) {
      void lookupCep(digits);
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);

    const formData = new FormData(e.currentTarget);
    const logo = formData.get("logo");
    if (logo instanceof File && logo.size > 0) {
      formData.set("logo", await compressImage(logo));
    }
    formData.set("whatsapp", whatsapp.replace(/\D/g, ""));
    formData.set("cep", cep.replace(/\D/g, ""));
    formData.set("street", street);
    formData.set("neighborhood", neighborhood);
    formData.set("city", city);
    formData.set("state", state);

    const result = await saveShopProfile(formData);

    if (result.ok) {
      toast.success("Configurações salvas.");
      onSaved?.();
      router.refresh();
    } else {
      toast.error(result.error);
    }
    setSaving(false);
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-4"
      autoComplete="off"
    >
      <div
        className={cn(
          ADMIN_SURFACE.panel,
          "flex flex-col gap-5 p-4 sm:gap-6 sm:p-6"
        )}
      >
        <FormSectionTitle
          tone="dark"
          icon={Store}
          title="Perfil da barbearia"
          description="Nome, logo e contato que o cliente vê na página de agendamento."
        />

        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="relative flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-[#0e0f11] transition-opacity hover:opacity-90 sm:size-20"
          >
            {preview ? (
              <Image
                src={preview}
                alt="Logo da barbearia"
                fill
                className="object-contain p-1"
                sizes="80px"
                unoptimized={preview.startsWith("/")}
              />
            ) : (
              <Camera className={cn("size-6", ADMIN_SURFACE.muted)} />
            )}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            name="logo"
            accept="image/*"
            className="hidden"
            onChange={handleLogoChange}
          />

          <div className="grid min-w-0 flex-1 gap-3 sm:gap-4">
            <div className="space-y-2">
              <DarkLabel htmlFor="shopName">Nome da barbearia</DarkLabel>
              <Input
                id="shopName"
                name="shopName"
                defaultValue={initialValues.shopName}
                placeholder="Ex: Barbearia do Centro"
                required
                disabled={saving}
                className={ADMIN_SURFACE.input}
              />
            </div>
            <div className="space-y-2">
              <DarkLabel htmlFor="bio">Bio</DarkLabel>
              <Textarea
                id="bio"
                name="bio"
                defaultValue={initialValues.bio}
                placeholder="Conte em poucas linhas o estilo da barbearia, os diferenciais e o que o cliente pode esperar."
                rows={3}
                maxLength={500}
                disabled={saving}
                className={cn("min-h-[5.5rem] resize-y", ADMIN_SURFACE.input)}
              />
              <FieldHint>
                Aparece logo abaixo do nome na página de agendamento.
              </FieldHint>
            </div>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 sm:gap-4">
          <div className="space-y-2">
            <DarkLabel htmlFor="shopWhatsapp">WhatsApp da barbearia</DarkLabel>
            <div className="relative">
              <Phone
                className={cn(
                  "pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2",
                  ADMIN_SURFACE.muted
                )}
              />
              <Input
                id="shopWhatsapp"
                inputMode="numeric"
                className={cn("pl-9", ADMIN_SURFACE.input)}
                placeholder="(11) 99999-9999"
                value={whatsapp}
                onChange={(e) => setWhatsapp(formatWhatsapp(e.target.value))}
                disabled={saving}
              />
            </div>
          </div>
          <div className="space-y-2">
            <DarkLabel htmlFor="instagram">Instagram</DarkLabel>
            <div className="relative">
              <AtSign
                className={cn(
                  "pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2",
                  ADMIN_SURFACE.muted
                )}
              />
              <Input
                id="instagram"
                name="instagram"
                className={cn("pl-9", ADMIN_SURFACE.input)}
                defaultValue={initialValues.instagram}
                placeholder="sua_barbearia"
                disabled={saving}
                autoComplete="off"
              />
            </div>
          </div>
        </div>
      </div>

      <div
        className={cn(
          ADMIN_SURFACE.panel,
          "flex flex-col gap-5 p-4 sm:gap-6 sm:p-6"
        )}
      >
        <FormSectionTitle
          tone="dark"
          icon={MapPin}
          title="Endereço"
          description="Digite o CEP para preencher rua, bairro e cidade automaticamente."
        />

        <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:gap-4">
          <div className="space-y-2">
            <DarkLabel htmlFor="cep">CEP</DarkLabel>
            <Input
              id="cep"
              inputMode="numeric"
              placeholder="00000-000"
              value={cep}
              onChange={(e) => handleCepChange(e.target.value)}
              disabled={saving}
              className={ADMIN_SURFACE.input}
            />
          </div>
          <div className="flex items-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => lookupCep()}
              disabled={loadingCep || saving}
              className={cn(
                "h-10 w-full sm:h-9 sm:w-auto",
                ADMIN_SURFACE.btnGhost
              )}
            >
              {loadingCep ? (
                <>
                  <Loader2 className="animate-spin" />
                  Buscando...
                </>
              ) : (
                "Buscar CEP"
              )}
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <DarkLabel htmlFor="street">Rua</DarkLabel>
          <Input
            id="street"
            name="street"
            value={street}
            onChange={(e) => setStreet(e.target.value)}
            placeholder="Preenchido pelo CEP"
            disabled={saving}
            className={ADMIN_SURFACE.input}
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2 sm:gap-4">
          <div className="space-y-2">
            <DarkLabel htmlFor="addressNumber">Número</DarkLabel>
            <Input
              id="addressNumber"
              name="addressNumber"
              defaultValue={initialValues.addressNumber}
              placeholder="Ex: 123"
              disabled={saving}
              className={ADMIN_SURFACE.input}
            />
          </div>
          <div className="space-y-2">
            <DarkLabel htmlFor="addressComplement">Complemento</DarkLabel>
            <Input
              id="addressComplement"
              name="addressComplement"
              defaultValue={initialValues.addressComplement}
              placeholder="Sala, loja, etc. (opcional)"
              disabled={saving}
              className={ADMIN_SURFACE.input}
            />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3 sm:gap-4">
          <div className="space-y-2">
            <DarkLabel htmlFor="neighborhood">Bairro</DarkLabel>
            <Input
              id="neighborhood"
              value={neighborhood}
              onChange={(e) => setNeighborhood(e.target.value)}
              placeholder="Bairro"
              disabled={saving}
              className={ADMIN_SURFACE.input}
            />
          </div>
          <div className="space-y-2">
            <DarkLabel htmlFor="city">Cidade</DarkLabel>
            <Input
              id="city"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="Cidade"
              disabled={saving}
              className={ADMIN_SURFACE.input}
            />
          </div>
          <div className="space-y-2">
            <DarkLabel htmlFor="state">UF</DarkLabel>
            <Input
              id="state"
              value={state}
              onChange={(e) =>
                setState(e.target.value.toUpperCase().slice(0, 2))
              }
              placeholder="SP"
              maxLength={2}
              disabled={saving}
              className={ADMIN_SURFACE.input}
            />
          </div>
        </div>
      </div>

      <div className="sticky bottom-0 z-10 -mx-4 border-t border-white/10 bg-[#0e0f11]/95 px-4 py-3.5 backdrop-blur supports-[backdrop-filter]:bg-[#0e0f11]/80 sm:-mx-0 sm:rounded-2xl sm:border sm:px-5 sm:py-4">
        <div className="flex justify-end">
          <Button
            type="submit"
            disabled={saving}
            className={cn(
              "h-10 w-full sm:h-9 sm:w-auto",
              ADMIN_SURFACE.btnPrimary
            )}
          >
            {saving ? "Salvando..." : submitLabel}
          </Button>
        </div>
      </div>
    </form>
  );
}
