"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AtSign,
  CalendarClock,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  Percent,
  Scissors,
  Shield,
  UserRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { CheckboxGroup } from "@/components/admin/checkbox-group";
import {
  AdminFormActions,
  AdminFormFields,
} from "@/components/admin/admin-form-layout";
import { FormSectionTitle } from "@/components/admin/form-section";
import { PhotoField } from "@/components/admin/photo-field";
import {
  appendPermissionsToFormData,
  ProfessionalPermissionsFields,
} from "@/components/admin/professional-permissions-fields";
import {
  WeekGridEditor,
  fillWeek,
  type DayRanges,
} from "@/components/admin/week-grid-editor";
import type { BusinessDay } from "@/components/admin/business-hours-form";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProfessionalCommissionsPanel } from "@/components/admin/professional-commissions-panel";
import { formatWhatsapp } from "@/lib/format";
import {
  DEFAULT_PHOTO_POSITION,
  normalizePhotoPosition,
} from "@/lib/photo-position";
import type { ActionResult } from "@/lib/require-owner";
import type { CommissionPayout } from "@/lib/commission-payout-service";
import {
  DEFAULT_BARBER_PERMISSIONS,
  type ProfessionalPermissions,
} from "@/lib/professional-permissions";
import { ADMIN_SURFACE } from "@/lib/admin-surface";
import { cn } from "@/lib/utils";

export type ServiceOption = { id: string; name: string };

export type ProfessionalFormValues = {
  firstName: string;
  lastName: string;
  nickname: string;
  whatsapp: string;
  email: string;
  instagram: string;
  photoUrl: string | null;
  photoPosition?: string | null;
  commissionPercent: number;
  serviceIds: string[];
  schedule: DayRanges[];
  permissions: ProfessionalPermissions;
};

type ProfessionalFormProps = {
  services: ServiceOption[];
  businessDays: BusinessDay[];
  initialValues?: ProfessionalFormValues;
  onSubmit: (formData: FormData) => Promise<ActionResult>;
  submitLabel: string;
  isEdit?: boolean;
  /** Se definido, não redireciona para a lista após salvar. */
  onSaved?: () => void;
  /** Só na edição: painel de comissões / histórico de pagamentos. */
  commissions?: {
    professionalId: string;
    today: string;
    from: string;
    to: string;
    openCommissionCents: number;
    payouts: CommissionPayout[];
  };
};

function FieldHint({ children }: { children: React.ReactNode }) {
  return <p className={cn("text-xs", ADMIN_SURFACE.muted)}>{children}</p>;
}

function FormPanel({ children }: { children: React.ReactNode }) {
  return (
    <div className={cn(ADMIN_SURFACE.panel, "flex flex-col gap-5 p-4 sm:gap-6 sm:p-6")}>
      {children}
    </div>
  );
}

function DarkLabel({
  htmlFor,
  children,
}: {
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <Label htmlFor={htmlFor} className="text-[#f5f5f5]">
      {children}
    </Label>
  );
}

export function ProfessionalForm({
  services,
  businessDays,
  initialValues,
  onSubmit,
  submitLabel,
  isEdit = false,
  onSaved,
  commissions,
}: ProfessionalFormProps) {
  const router = useRouter();
  const [preview, setPreview] = useState<string | null>(
    initialValues?.photoUrl ?? null
  );
  const [photoPosition, setPhotoPosition] = useState(
    normalizePhotoPosition(
      initialValues?.photoPosition ?? DEFAULT_PHOTO_POSITION
    )
  );
  const [firstName, setFirstName] = useState(initialValues?.firstName ?? "");
  const [lastName, setLastName] = useState(initialValues?.lastName ?? "");
  const [nickname, setNickname] = useState(initialValues?.nickname ?? "");
  const [commissionPercent, setCommissionPercent] = useState(
    String(initialValues?.commissionPercent ?? 50)
  );
  const [whatsapp, setWhatsapp] = useState(
    formatWhatsapp(initialValues?.whatsapp ?? "")
  );
  const [instagram, setInstagram] = useState(initialValues?.instagram ?? "");
  const [email, setEmail] = useState(initialValues?.email ?? "");
  const [password, setPassword] = useState("");
  const [serviceIds, setServiceIds] = useState<string[]>(
    initialValues?.serviceIds ?? []
  );
  const [schedule, setSchedule] = useState<DayRanges[]>(() =>
    fillWeek(initialValues?.schedule ?? [])
  );
  const [permissions, setPermissions] = useState<ProfessionalPermissions>(
    initialValues?.permissions ?? { ...DEFAULT_BARBER_PERMISSIONS }
  );
  const [showPassword, setShowPassword] = useState(false);
  const [activeTab, setActiveTab] = useState("dados");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!firstName.trim() || !lastName.trim() || !nickname.trim()) {
      toast.error("Preencha nome, sobrenome e apelido.");
      setActiveTab("dados");
      return;
    }

    const commission = Number.parseInt(commissionPercent, 10);
    if (!Number.isFinite(commission) || commission < 0 || commission > 100) {
      toast.error("Informe uma comissão entre 0 e 100%.");
      setActiveTab("dados");
      return;
    }

    if (whatsapp.replace(/\D/g, "").length < 10) {
      toast.error("Informe um WhatsApp válido.");
      setActiveTab("dados");
      return;
    }

    if (!email.trim()) {
      toast.error("Informe o e-mail de acesso.");
      setActiveTab("acesso");
      return;
    }

    if (!isEdit && password.length < 6) {
      toast.error("A senha precisa ter no mínimo 6 caracteres.");
      setActiveTab("acesso");
      return;
    }

    if (isEdit && password && password.length < 6) {
      toast.error("A nova senha precisa ter no mínimo 6 caracteres.");
      setActiveTab("acesso");
      return;
    }

    setSaving(true);

    const formData = new FormData(event.currentTarget);
    formData.set("firstName", firstName.trim());
    formData.set("lastName", lastName.trim());
    formData.set("nickname", nickname.trim());
    formData.set("commissionPercent", String(commission));
    formData.set("whatsapp", whatsapp.replace(/\D/g, ""));
    formData.set("instagram", instagram.trim());
    formData.set("email", email.trim());
    formData.set("password", password);
    formData.set("schedule", JSON.stringify(schedule));
    formData.delete("serviceIds");
    for (const serviceId of serviceIds) {
      formData.append("serviceIds", serviceId);
    }
    appendPermissionsToFormData(formData, permissions);

    const result = await onSubmit(formData);

    if (result.ok) {
      toast.success(
        isEdit ? "Profissional atualizado." : "Profissional cadastrado."
      );
      if (onSaved) {
        onSaved();
        router.refresh();
        setSaving(false);
      } else {
        router.push("/admin/profissionais");
        router.refresh();
      }
    } else {
      toast.error(result.error);
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex w-full flex-col gap-4"
      autoComplete="off"
    >
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="-mx-1 overflow-x-auto px-1 pb-0.5">
          <TabsList className="h-auto w-max min-w-full flex-nowrap justify-start gap-1 rounded-xl border border-white/10 bg-white/[0.04] p-1">
            <TabsTrigger value="dados" className="flex-none px-3">
              Dados
            </TabsTrigger>
            <TabsTrigger value="acesso" className="flex-none px-3">
              Acesso
            </TabsTrigger>
            <TabsTrigger value="servicos" className="flex-none px-3">
              Serviços
            </TabsTrigger>
            <TabsTrigger value="horario" className="flex-none px-3">
              Horário
            </TabsTrigger>
            {isEdit && commissions ? (
              <TabsTrigger value="comissoes" className="flex-none px-3">
                Comissões
              </TabsTrigger>
            ) : null}
          </TabsList>
        </div>

        <TabsContent
          value="dados"
          forceMount
          className="mt-4 data-[state=inactive]:hidden"
        >
          <FormPanel>
            <FormSectionTitle
              tone="dark"
              icon={UserRound}
              title="Perfil"
              description="Foto e apelido são o que o cliente vê ao agendar."
            />

            <PhotoField
              preview={preview}
              position={photoPosition}
              onPreviewChange={setPreview}
              onPositionChange={setPhotoPosition}
              shape="circle"
              tone="dark"
            />

            <AdminFormFields columns={2}>
              <div className="space-y-2">
                <DarkLabel htmlFor="firstName">Nome</DarkLabel>
                <Input
                  id="firstName"
                  name="firstName"
                  placeholder="Ex: Carlos"
                  value={firstName}
                  onChange={(event) => setFirstName(event.target.value)}
                  disabled={saving}
                  className={ADMIN_SURFACE.input}
                  autoComplete="off"
                />
              </div>

              <div className="space-y-2">
                <DarkLabel htmlFor="lastName">Sobrenome</DarkLabel>
                <Input
                  id="lastName"
                  name="lastName"
                  placeholder="Ex: Silva"
                  value={lastName}
                  onChange={(event) => setLastName(event.target.value)}
                  disabled={saving}
                  className={ADMIN_SURFACE.input}
                  autoComplete="off"
                />
              </div>

              <div className="space-y-2 sm:col-span-2">
                <DarkLabel htmlFor="nickname">Apelido</DarkLabel>
                <Input
                  id="nickname"
                  name="nickname"
                  placeholder="Ex: Carlão"
                  value={nickname}
                  onChange={(event) => setNickname(event.target.value)}
                  disabled={saving}
                  className={ADMIN_SURFACE.input}
                  autoComplete="off"
                />
                <FieldHint>
                  É assim que o cliente vê esse profissional na agenda.
                </FieldHint>
              </div>
            </AdminFormFields>

            <Separator className="bg-white/10" />

            <FormSectionTitle
              tone="dark"
              icon={Percent}
              title="Comissão e contato"
              description="Percentual na comanda e formas de falar com o barbeiro."
            />

            <AdminFormFields columns={2}>
              <div className="space-y-2">
                <DarkLabel htmlFor="commissionPercent">Comissão (%)</DarkLabel>
                <Input
                  id="commissionPercent"
                  name="commissionPercent"
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  inputMode="numeric"
                  value={commissionPercent}
                  onChange={(event) =>
                    setCommissionPercent(event.target.value)
                  }
                  disabled={saving}
                  className={ADMIN_SURFACE.input}
                  autoComplete="off"
                />
              </div>

              <div className="space-y-2">
                <DarkLabel htmlFor="whatsapp">WhatsApp</DarkLabel>
                <Input
                  id="whatsapp"
                  name="whatsapp"
                  type="tel"
                  inputMode="numeric"
                  placeholder="(11) 99999-8888"
                  value={whatsapp}
                  onChange={(event) =>
                    setWhatsapp(formatWhatsapp(event.target.value))
                  }
                  disabled={saving}
                  className={ADMIN_SURFACE.input}
                  autoComplete="off"
                />
              </div>

              <div className="space-y-2 sm:col-span-2">
                <DarkLabel htmlFor="instagram">Instagram (opcional)</DarkLabel>
                <div className="relative">
                  <AtSign
                    className={cn(
                      "absolute left-3 top-1/2 size-4 -translate-y-1/2",
                      ADMIN_SURFACE.muted
                    )}
                  />
                  <Input
                    id="instagram"
                    name="professional_instagram"
                    type="text"
                    inputMode="text"
                    placeholder="nome.do.perfil"
                    value={instagram}
                    onChange={(event) => setInstagram(event.target.value)}
                    className={cn("pl-9", ADMIN_SURFACE.input)}
                    disabled={saving}
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    data-1p-ignore
                    data-lpignore="true"
                    data-form-type="other"
                  />
                </div>
              </div>
            </AdminFormFields>
          </FormPanel>
        </TabsContent>

        <TabsContent
          value="acesso"
          forceMount
          className="mt-4 data-[state=inactive]:hidden"
        >
          <div className="flex flex-col gap-4">
            <FormPanel>
              <FormSectionTitle
                tone="dark"
                icon={KeyRound}
                title="Login no painel"
                description="E-mail e senha para o barbeiro entrar no sistema."
              />

              <AdminFormFields columns={2}>
                <div className="space-y-2">
                  <DarkLabel htmlFor="email">E-mail</DarkLabel>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    placeholder="barbeiro@email.com"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    disabled={saving}
                    className={ADMIN_SURFACE.input}
                    autoComplete="off"
                    data-1p-ignore
                    data-lpignore="true"
                  />
                </div>

                <div className="space-y-2">
                  <DarkLabel htmlFor="password">
                    {isEdit ? "Nova senha" : "Senha"}
                  </DarkLabel>
                  <div className="relative">
                    <Input
                      id="password"
                      name="password"
                      type={showPassword ? "text" : "password"}
                      minLength={6}
                      placeholder={
                        isEdit
                          ? "Deixe vazio para manter"
                          : "Mínimo 6 caracteres"
                      }
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      className={cn("pr-10", ADMIN_SURFACE.input)}
                      disabled={saving}
                      autoComplete="new-password"
                      data-1p-ignore
                      data-lpignore="true"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((value) => !value)}
                      className={cn(
                        "absolute right-3 top-1/2 -translate-y-1/2 transition-colors",
                        ADMIN_SURFACE.muted,
                        "hover:text-[#f5f5f5]"
                      )}
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
                </div>
              </AdminFormFields>
            </FormPanel>

            <FormPanel>
              <FormSectionTitle
                tone="dark"
                icon={Shield}
                title="Permissões"
                description="O que esse profissional pode fazer na agenda e nas comandas."
              />
              <ProfessionalPermissionsFields
                tone="dark"
                value={permissions}
                onChange={setPermissions}
              />
            </FormPanel>
          </div>
        </TabsContent>

        <TabsContent
          value="servicos"
          forceMount
          className="mt-4 data-[state=inactive]:hidden"
        >
          <FormPanel>
            <FormSectionTitle
              tone="dark"
              icon={Scissors}
              title="Serviços"
              description="O cliente só agenda com ele os serviços marcados."
            />

            {services.length === 0 ? (
              <div
                className={cn(
                  "rounded-xl border border-dashed px-4 py-8 text-center text-sm",
                  "border-white/10",
                  ADMIN_SURFACE.muted
                )}
              >
                Nenhum serviço cadastrado ainda.
              </div>
            ) : (
              <CheckboxGroup
                tone="dark"
                name="serviceIds"
                options={services.map((service) => ({
                  id: service.id,
                  label: service.name,
                }))}
                value={serviceIds}
                onChange={setServiceIds}
              />
            )}
          </FormPanel>
        </TabsContent>

        <TabsContent
          value="horario"
          forceMount
          className="mt-4 data-[state=inactive]:hidden"
        >
          <FormPanel>
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
              <FormSectionTitle
                tone="dark"
                icon={CalendarClock}
                title="Horário de atendimento"
                description="Dia desligado é folga. Dá para ter pausa no meio do dia."
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={saving}
                className={cn(
                  "h-10 w-full sm:h-8 sm:w-auto",
                  ADMIN_SURFACE.btnGhost
                )}
                onClick={() =>
                  setSchedule(
                    businessDays.map((day) => ({
                      weekday: day.weekday,
                      ranges: day.active
                        ? [
                            {
                              startTime: day.openTime,
                              endTime: day.closeTime,
                            },
                          ]
                        : [],
                    }))
                  )
                }
              >
                <Copy />
                Copiar da barbearia
              </Button>
            </div>

            <WeekGridEditor
              days={schedule}
              businessDays={businessDays}
              onChange={setSchedule}
              tone="dark"
            />
          </FormPanel>
        </TabsContent>

        {isEdit && commissions ? (
          <TabsContent value="comissoes" className="mt-4">
            <ProfessionalCommissionsPanel
              tone="dark"
              professionalId={commissions.professionalId}
              professionalNickname={nickname || "Barbeiro"}
              today={commissions.today}
              from={commissions.from}
              to={commissions.to}
              openCommissionCents={commissions.openCommissionCents}
              payouts={commissions.payouts}
            />
          </TabsContent>
        ) : null}
      </Tabs>

      {activeTab !== "comissoes" ? (
        <AdminFormActions
          tone="dark"
          onCancel={() => router.push("/admin/profissionais")}
          submitLabel={submitLabel}
          saving={saving}
        />
      ) : null}
    </form>
  );
}
