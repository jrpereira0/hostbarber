"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AtSign,
  Eye,
  EyeOff,
  Globe,
  Link2,
  Lock,
  Mail,
  MapPin,
  Phone,
  Store,
  UserRound,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FormSectionTitle } from "@/components/admin/form-section";
import {
  AdminFormActions,
  AdminFormFields,
  AdminFormPage,
  AdminFormSectionCard,
} from "@/components/admin/admin-form-layout";
import { formatCep, formatWhatsapp } from "@/lib/format";
import { fetchAddressByCep } from "@/lib/viacep";
import {
  createShop,
  updateShop,
} from "@/app/plataforma/(panel)/clientes/actions";
import type { PlatformShop } from "@/lib/shops/types";
import { bookingPathForSlug } from "@/lib/booking-path";
import { normalizeSlugInput } from "@/lib/shops/slug";
import { PlatformDeleteShopControl } from "@/components/platform/platform-delete-shop-control";
import { ADMIN_SURFACE } from "@/lib/admin-surface";
import { cn } from "@/lib/utils";

type ShopFormProps =
  | { mode: "create" }
  | { mode: "edit"; shop: PlatformShop };

type TabId = "loja" | "acesso" | "endereco" | "redes";

const TAB_TRIGGER_CLASS =
  "flex-none gap-2 px-3 text-[#b4b6bb] data-[state=active]:bg-[rgb(236_241_94_/_14%)] data-[state=active]:text-[#ecf15e] data-[state=active]:shadow-none";

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

export function PlatformShopForm(props: ShopFormProps) {
  const router = useRouter();
  const isEdit = props.mode === "edit";
  const shop = isEdit ? props.shop : null;

  const [tab, setTab] = useState<TabId>("loja");
  const [name, setName] = useState(shop?.name ?? "");
  const [slug, setSlug] = useState(shop?.slug ?? "");
  const [bio, setBio] = useState(shop?.bio ?? "");
  const [ownerEmail, setOwnerEmail] = useState(shop?.ownerEmail ?? "");
  const [whatsapp, setWhatsapp] = useState(
    shop?.ownerWhatsapp ? formatWhatsapp(shop.ownerWhatsapp) : ""
  );
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState(
    shop?.phone ? formatWhatsapp(shop.phone) : ""
  );
  const [cep, setCep] = useState(shop?.cep ? formatCep(shop.cep) : "");
  const [street, setStreet] = useState(shop?.street ?? "");
  const [addressNumber, setAddressNumber] = useState(
    shop?.addressNumber ?? ""
  );
  const [addressComplement, setAddressComplement] = useState(
    shop?.addressComplement ?? ""
  );
  const [neighborhood, setNeighborhood] = useState(shop?.neighborhood ?? "");
  const [city, setCity] = useState(shop?.city ?? "");
  const [state, setState] = useState(shop?.state ?? "");
  const [instagram, setInstagram] = useState(shop?.instagram ?? "");
  const [facebook, setFacebook] = useState(shop?.facebook ?? "");
  const [website, setWebsite] = useState(shop?.website ?? "");
  const [active, setActive] = useState(shop?.active ?? true);
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);

  async function lookupCep(rawCep?: string) {
    const digits = (rawCep ?? cep).replace(/\D/g, "");
    if (digits.length !== 8) {
      toast.error("Informe um CEP com 8 dígitos.");
      return;
    }

    const result = await fetchAddressByCep(digits);
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

  function validateBeforeSubmit(): TabId | null {
    if (!name.trim()) {
      toast.error("Informe o nome da loja.");
      return "loja";
    }

    const email = ownerEmail.trim().toLowerCase();
    if (!email || !email.includes("@")) {
      toast.error("Informe um e-mail válido do dono.");
      return "acesso";
    }

    const wa = whatsapp.replace(/\D/g, "");
    if (wa.length < 10 || wa.length > 13) {
      toast.error("Informe um WhatsApp válido do dono.");
      return "acesso";
    }

    if (!isEdit && password.length < 6) {
      toast.error("A senha precisa ter pelo menos 6 caracteres.");
      return "acesso";
    }

    if (isEdit && password.length > 0 && password.length < 6) {
      toast.error("A nova senha precisa ter pelo menos 6 caracteres.");
      return "acesso";
    }

    return null;
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const invalidTab = validateBeforeSubmit();
    if (invalidTab) {
      setTab(invalidTab);
      return;
    }

    setSaving(true);

    const formData = new FormData();
    formData.set("name", name.trim());
    formData.set("slug", slug.trim());
    formData.set("bio", bio.trim());
    formData.set("ownerEmail", ownerEmail.trim().toLowerCase());
    formData.set("ownerWhatsapp", whatsapp);
    formData.set("password", password);
    formData.set("phone", phone);
    formData.set("cep", cep);
    formData.set("street", street);
    formData.set("addressNumber", addressNumber);
    formData.set("addressComplement", addressComplement);
    formData.set("neighborhood", neighborhood);
    formData.set("city", city);
    formData.set("state", state);
    formData.set("instagram", instagram);
    formData.set("facebook", facebook);
    formData.set("website", website);
    formData.set("active", active ? "true" : "false");

    const result = isEdit
      ? await updateShop(shop!.id, formData)
      : await createShop(formData);

    setSaving(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }

    toast.success(
      isEdit ? "Cliente atualizado." : "Cliente cadastrado."
    );
    router.push("/plataforma");
    router.refresh();
  }

  return (
    <AdminFormPage tone="dark">
      <form onSubmit={handleSubmit} className="flex w-full flex-col gap-4">
        <Tabs
          value={tab}
          onValueChange={(value) => setTab(value as TabId)}
          className="flex w-full flex-col gap-4"
        >
          <div className="-mx-1 overflow-x-auto px-1 pb-0.5">
            <TabsList className="h-auto w-max min-w-full flex-nowrap justify-start gap-1 rounded-xl border border-white/10 bg-white/[0.04] p-1">
              <TabsTrigger value="loja" className={TAB_TRIGGER_CLASS}>
                <Store className="size-3.5" />
                Loja
              </TabsTrigger>
              <TabsTrigger value="acesso" className={TAB_TRIGGER_CLASS}>
                <UserRound className="size-3.5" />
                Acesso
              </TabsTrigger>
              <TabsTrigger value="endereco" className={TAB_TRIGGER_CLASS}>
                <MapPin className="size-3.5" />
                Endereço
              </TabsTrigger>
              <TabsTrigger value="redes" className={TAB_TRIGGER_CLASS}>
                <Globe className="size-3.5" />
                Redes
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="loja" className="mt-0">
            <AdminFormSectionCard
              tone="dark"
              title="Dados da loja"
              description="Nome e informações que identificam o cliente na plataforma."
            >
              <div className="mb-4">
                <FormSectionTitle
                  tone="dark"
                  icon={Store}
                  title="Identificação"
                  description="Esses dados ficam no cadastro da plataforma."
                />
              </div>
              <AdminFormFields columns={2}>
                <div className="space-y-2 sm:col-span-2 lg:col-span-1">
                  <DarkLabel htmlFor="name">Nome da loja</DarkLabel>
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ex.: Barbearia Centro"
                    className={ADMIN_SURFACE.input}
                  />
                </div>
                {isEdit ? (
                  <div className="flex items-center justify-between gap-3 rounded-lg border border-white/10 px-3 py-3 sm:col-span-2 lg:col-span-1">
                    <div>
                      <p className="text-sm font-medium text-[#f5f5f5]">
                        Cliente ativo
                      </p>
                      <FieldHint>
                        Inativos ficam no cadastro, mas painel e agenda pública
                        ficam bloqueados.
                      </FieldHint>
                    </div>
                    <Switch checked={active} onCheckedChange={setActive} />
                  </div>
                ) : null}
                <div className="space-y-2 sm:col-span-2">
                  <DarkLabel htmlFor="slug">Link de agendamento</DarkLabel>
                  <div className="relative">
                    <Link2 className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[#b4b6bb]" />
                    <Input
                      id="slug"
                      value={slug}
                      onChange={(e) =>
                        setSlug(normalizeSlugInput(e.target.value))
                      }
                      placeholder="gerado automaticamente pelo nome"
                      maxLength={60}
                      className={cn(ADMIN_SURFACE.input, "pl-10")}
                    />
                  </div>
                  <FieldHint>
                    {bookingPathForSlug(slug || "sua-barbearia")} — deixe em
                    branco pra gerar a partir do nome. Trocar o link quebra o
                    endereço antigo já divulgado.
                  </FieldHint>
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <DarkLabel htmlFor="bio">Bio (opcional)</DarkLabel>
                  <Textarea
                    id="bio"
                    rows={4}
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    placeholder="Uma frase curta sobre a loja"
                    className={ADMIN_SURFACE.input}
                  />
                </div>
              </AdminFormFields>
            </AdminFormSectionCard>
          </TabsContent>

          <TabsContent value="acesso" className="mt-0">
            <AdminFormSectionCard
              tone="dark"
              title="Acesso do dono"
              description="E-mail, WhatsApp e senha para o dono entrar no painel da loja."
            >
              <div className="mb-4">
                <FormSectionTitle
                  tone="dark"
                  icon={UserRound}
                  title="Credenciais"
                  description="O e-mail e a senha criam o usuário no login."
                />
              </div>
              <AdminFormFields columns={2}>
                <div className="space-y-2">
                  <DarkLabel htmlFor="ownerEmail">E-mail do dono</DarkLabel>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[#b4b6bb]" />
                    <Input
                      id="ownerEmail"
                      type="email"
                      value={ownerEmail}
                      onChange={(e) => setOwnerEmail(e.target.value)}
                      placeholder="dono@email.com"
                      className={cn(ADMIN_SURFACE.input, "pl-10")}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <DarkLabel htmlFor="ownerWhatsapp">
                    WhatsApp do dono
                  </DarkLabel>
                  <div className="relative">
                    <Phone className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[#b4b6bb]" />
                    <Input
                      id="ownerWhatsapp"
                      value={whatsapp}
                      onChange={(e) =>
                        setWhatsapp(formatWhatsapp(e.target.value))
                      }
                      placeholder="(11) 99999-9999"
                      className={cn(ADMIN_SURFACE.input, "pl-10")}
                    />
                  </div>
                </div>
                <div className="space-y-2 sm:col-span-2 lg:max-w-md">
                  <DarkLabel htmlFor="password">
                    {isEdit ? "Nova senha (opcional)" : "Senha inicial"}
                  </DarkLabel>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[#b4b6bb]" />
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="new-password"
                      placeholder={
                        isEdit
                          ? "Deixe em branco para manter a atual"
                          : "Mínimo 6 caracteres"
                      }
                      className={cn(ADMIN_SURFACE.input, "pr-11 pl-10")}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute top-1/2 right-2.5 flex size-8 -translate-y-1/2 items-center justify-center rounded-lg text-[#b4b6bb] hover:text-[#f5f5f5]"
                      aria-label={
                        showPassword ? "Esconder senha" : "Mostrar senha"
                      }
                    >
                      {showPassword ? (
                        <EyeOff className="size-4" />
                      ) : (
                        <Eye className="size-4" />
                      )}
                    </button>
                  </div>
                  {isEdit ? (
                    <FieldHint>
                      Preencha só se quiser trocar a senha do dono.
                    </FieldHint>
                  ) : null}
                </div>
              </AdminFormFields>
            </AdminFormSectionCard>
          </TabsContent>

          <TabsContent value="endereco" className="mt-0">
            <AdminFormSectionCard
              tone="dark"
              title="Endereço"
              description="O CEP preenche rua, bairro e cidade automaticamente."
            >
              <div className="mb-4">
                <FormSectionTitle tone="dark" icon={MapPin} title="Localização" />
              </div>
              <AdminFormFields columns={3}>
                <div className="space-y-2">
                  <DarkLabel htmlFor="cep">CEP</DarkLabel>
                  <Input
                    id="cep"
                    value={cep}
                    onChange={(e) => handleCepChange(e.target.value)}
                    placeholder="00000-000"
                    className={ADMIN_SURFACE.input}
                  />
                </div>
                <div className="space-y-2">
                  <DarkLabel htmlFor="addressNumber">Número</DarkLabel>
                  <Input
                    id="addressNumber"
                    value={addressNumber}
                    onChange={(e) => setAddressNumber(e.target.value)}
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
                    maxLength={2}
                    placeholder="SP"
                    className={ADMIN_SURFACE.input}
                  />
                </div>
                <div className="space-y-2 sm:col-span-2 lg:col-span-3">
                  <DarkLabel htmlFor="street">Rua</DarkLabel>
                  <Input
                    id="street"
                    value={street}
                    onChange={(e) => setStreet(e.target.value)}
                    className={ADMIN_SURFACE.input}
                  />
                </div>
                <div className="space-y-2">
                  <DarkLabel htmlFor="addressComplement">Complemento</DarkLabel>
                  <Input
                    id="addressComplement"
                    value={addressComplement}
                    onChange={(e) => setAddressComplement(e.target.value)}
                    className={ADMIN_SURFACE.input}
                  />
                </div>
                <div className="space-y-2">
                  <DarkLabel htmlFor="neighborhood">Bairro</DarkLabel>
                  <Input
                    id="neighborhood"
                    value={neighborhood}
                    onChange={(e) => setNeighborhood(e.target.value)}
                    className={ADMIN_SURFACE.input}
                  />
                </div>
                <div className="space-y-2">
                  <DarkLabel htmlFor="city">Cidade</DarkLabel>
                  <Input
                    id="city"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className={ADMIN_SURFACE.input}
                  />
                </div>
                <div className="space-y-2 sm:col-span-2 lg:col-span-3 lg:max-w-md">
                  <DarkLabel htmlFor="phone">
                    Telefone da loja (opcional)
                  </DarkLabel>
                  <Input
                    id="phone"
                    value={phone}
                    onChange={(e) => setPhone(formatWhatsapp(e.target.value))}
                    placeholder="Se for diferente do WhatsApp do dono"
                    className={ADMIN_SURFACE.input}
                  />
                </div>
              </AdminFormFields>
            </AdminFormSectionCard>
          </TabsContent>

          <TabsContent value="redes" className="mt-0">
            <AdminFormSectionCard
              tone="dark"
              title="Redes sociais"
              description="Opcional — Instagram, Facebook e site."
            >
              <AdminFormFields columns={2}>
                <div className="space-y-2">
                  <DarkLabel htmlFor="instagram">Instagram</DarkLabel>
                  <div className="relative">
                    <AtSign className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[#b4b6bb]" />
                    <Input
                      id="instagram"
                      value={instagram}
                      onChange={(e) => setInstagram(e.target.value)}
                      placeholder="usuario"
                      className={cn(ADMIN_SURFACE.input, "pl-10")}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <DarkLabel htmlFor="facebook">Facebook</DarkLabel>
                  <Input
                    id="facebook"
                    value={facebook}
                    onChange={(e) => setFacebook(e.target.value)}
                    placeholder="facebook.com/..."
                    className={ADMIN_SURFACE.input}
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <DarkLabel htmlFor="website">Site</DarkLabel>
                  <div className="relative">
                    <Globe className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[#b4b6bb]" />
                    <Input
                      id="website"
                      value={website}
                      onChange={(e) => setWebsite(e.target.value)}
                      placeholder="https://"
                      className={cn(ADMIN_SURFACE.input, "pl-10")}
                    />
                  </div>
                </div>
              </AdminFormFields>
            </AdminFormSectionCard>
          </TabsContent>
        </Tabs>

        <AdminFormActions
          tone="dark"
          onCancel={() => router.push("/plataforma")}
          submitLabel={isEdit ? "Salvar alterações" : "Cadastrar cliente"}
          saving={saving}
        />
      </form>

      {isEdit && shop ? (
        <div className="mt-2">
          <PlatformDeleteShopControl shopId={shop.id} shopName={shop.name} />
        </div>
      ) : null}
    </AdminFormPage>
  );
}
