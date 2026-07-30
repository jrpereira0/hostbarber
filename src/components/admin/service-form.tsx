"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarClock, CircleDollarSign, Scissors } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { CheckboxGroup } from "@/components/admin/checkbox-group";
import {
  AdminFormActions,
  AdminFormFields,
} from "@/components/admin/admin-form-layout";
import { FormSectionTitle } from "@/components/admin/form-section";
import { PhotoField } from "@/components/admin/photo-field";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatPriceBRL, WEEKDAYS } from "@/lib/format";
import {
  DEFAULT_PHOTO_POSITION,
  normalizePhotoPosition,
} from "@/lib/photo-position";
import { formatServiceCatalogPriceLabel } from "@/lib/public-service-prices";
import { weekdayPriceInputsFromRows } from "@/lib/service-weekday-prices";
import type { ActionResult } from "@/lib/require-owner";
import { ADMIN_SURFACE } from "@/lib/admin-surface";
import { cn } from "@/lib/utils";

export type ProfessionalOption = { id: string; nickname: string };

export type BusinessHourOption = {
  weekday: number;
  active: boolean;
};

export type ServiceFormValues = {
  name: string;
  description: string;
  durationMinutes: number;
  photoUrl: string | null;
  photoPosition?: string | null;
  professionalIds: string[];
  weekdayPrices: { weekday: number; priceCents: number }[];
  priceFrom: boolean;
};

type WeekdayRowState = {
  weekday: number;
  shopOpen: boolean;
  offered: boolean;
  priceCents: number;
};

type ServiceFormProps = {
  professionals: ProfessionalOption[];
  businessHours: BusinessHourOption[];
  initialValues?: ServiceFormValues;
  onSubmit: (formData: FormData) => Promise<ActionResult>;
  submitLabel: string;
  isEdit?: boolean;
  /** Se definido, não redireciona para a lista após salvar. */
  onSaved?: () => void;
};

function buildInitialWeekdayRows(
  businessHours: BusinessHourOption[],
  weekdayPrices: { weekday: number; priceCents: number }[]
): WeekdayRowState[] {
  const inputs = weekdayPriceInputsFromRows(weekdayPrices, businessHours);
  return inputs.map((row) => ({
    weekday: row.weekday,
    shopOpen: row.shopOpen,
    offered: row.priceCents !== null,
    priceCents: row.priceCents ?? 0,
  }));
}

function FieldHint({ children }: { children: React.ReactNode }) {
  return <p className={cn("text-xs", ADMIN_SURFACE.muted)}>{children}</p>;
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

export function ServiceForm({
  professionals,
  businessHours,
  initialValues,
  onSubmit,
  submitLabel,
  isEdit = false,
  onSaved,
}: ServiceFormProps) {
  const router = useRouter();
  const [preview, setPreview] = useState<string | null>(
    initialValues?.photoUrl ?? null
  );
  const [photoPosition, setPhotoPosition] = useState(
    normalizePhotoPosition(
      initialValues?.photoPosition ?? DEFAULT_PHOTO_POSITION
    )
  );
  const [name, setName] = useState(initialValues?.name ?? "");
  const [description, setDescription] = useState(
    initialValues?.description ?? ""
  );
  const [durationMinutes, setDurationMinutes] = useState(
    initialValues?.durationMinutes
      ? String(initialValues.durationMinutes)
      : ""
  );
  const [professionalIds, setProfessionalIds] = useState<string[]>(
    initialValues?.professionalIds ?? []
  );
  const [weekdayRows, setWeekdayRows] = useState<WeekdayRowState[]>(() =>
    buildInitialWeekdayRows(
      businessHours,
      initialValues?.weekdayPrices ?? []
    )
  );
  const [bulkPriceCents, setBulkPriceCents] = useState(0);
  const [priceFrom, setPriceFrom] = useState(initialValues?.priceFrom ?? false);
  const [activeTab, setActiveTab] = useState("info");
  const [saving, setSaving] = useState(false);

  const openWeekdays = useMemo(
    () => businessHours.filter((row) => row.active).map((row) => row.weekday),
    [businessHours]
  );

  const catalogPriceLabel = useMemo(() => {
    const prices = weekdayRows
      .filter((row) => row.shopOpen && row.offered && row.priceCents > 0)
      .map((row) => ({ weekday: row.weekday, priceCents: row.priceCents }));

    if (prices.length === 0) return null;

    return formatServiceCatalogPriceLabel(
      Math.min(...prices.map((row) => row.priceCents)),
      prices,
      priceFrom
    );
  }, [weekdayRows, priceFrom]);

  function handleBulkPriceChange(event: React.ChangeEvent<HTMLInputElement>) {
    const digits = event.target.value.replace(/\D/g, "").slice(0, 8);
    setBulkPriceCents(Number(digits));
  }

  function applyBulkPrice() {
    if (bulkPriceCents < 1) {
      toast.error("Informe um preço válido para aplicar em todos os dias.");
      return;
    }
    setWeekdayRows((rows) =>
      rows.map((row) =>
        row.shopOpen
          ? { ...row, offered: true, priceCents: bulkPriceCents }
          : row
      )
    );
    toast.success("Preço aplicado nos dias abertos.");
  }

  function updateWeekdayRow(
    weekday: number,
    patch: Partial<Pick<WeekdayRowState, "offered" | "priceCents">>
  ) {
    setWeekdayRows((rows) =>
      rows.map((row) =>
        row.weekday === weekday ? { ...row, ...patch } : row
      )
    );
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedName = name.trim();
    if (!trimmedName) {
      toast.error("Informe o nome do serviço.");
      setActiveTab("info");
      return;
    }

    const duration = Number.parseInt(durationMinutes, 10);
    if (!Number.isFinite(duration) || duration < 5) {
      toast.error("Informe a duração do atendimento (mínimo 5 minutos).");
      setActiveTab("agenda");
      return;
    }

    setSaving(true);

    const formData = new FormData(event.currentTarget);
    formData.set("name", trimmedName);
    formData.set("description", description.trim());
    formData.set("durationMinutes", String(duration));
    formData.set("priceFrom", priceFrom ? "on" : "off");
    formData.delete("professionalIds");
    for (const professionalId of professionalIds) {
      formData.append("professionalIds", professionalId);
    }

    for (const row of weekdayRows) {
      if (!row.shopOpen) continue;
      if (row.offered) {
        formData.set(`weekdayOffered_${row.weekday}`, "on");
        formData.set(`weekdayPriceCents_${row.weekday}`, String(row.priceCents));
      }
    }

    const result = await onSubmit(formData);

    if (result.ok) {
      toast.success(isEdit ? "Serviço atualizado." : "Serviço cadastrado.");
      if (onSaved) {
        onSaved();
        router.refresh();
        setSaving(false);
      } else {
        router.push("/admin/servicos");
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
      data-tour="tour-service-form"
    >
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="-mx-1 overflow-x-auto px-1 pb-0.5">
          <TabsList className="h-auto w-max min-w-full flex-nowrap justify-start gap-1 rounded-xl border border-white/10 bg-white/[0.04] p-1">
            <TabsTrigger value="info" className="flex-none px-3">
              Dados
            </TabsTrigger>
            <TabsTrigger value="precos" className="flex-none px-3">
              Preços
            </TabsTrigger>
            <TabsTrigger value="agenda" className="flex-none px-3">
              Agenda
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent
          value="info"
          forceMount
          className="mt-4 data-[state=inactive]:hidden"
        >
          <FormPanel>
            <FormSectionTitle
              tone="dark"
              icon={Scissors}
              title="Informações do serviço"
              description="Nome, foto e descrição que o cliente vê ao escolher."
            />

            <PhotoField
              preview={preview}
              position={photoPosition}
              onPreviewChange={setPreview}
              onPositionChange={setPhotoPosition}
              tone="dark"
            />

            <AdminFormFields columns={1}>
              <div className="space-y-2">
                <DarkLabel htmlFor="name">Nome do serviço</DarkLabel>
                <Input
                  id="name"
                  name="name"
                  placeholder="Ex: Corte degradê"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  disabled={saving}
                  className={ADMIN_SURFACE.input}
                  autoComplete="off"
                />
              </div>

              <div className="space-y-2">
                <DarkLabel htmlFor="description">Descrição (opcional)</DarkLabel>
                <Textarea
                  id="description"
                  name="description"
                  placeholder="Ex: Corte na tesoura e máquina, com acabamento na navalha."
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  rows={3}
                  disabled={saving}
                  className={cn(
                    "min-h-[5.5rem] resize-y",
                    ADMIN_SURFACE.input
                  )}
                />
              </div>
            </AdminFormFields>
          </FormPanel>
        </TabsContent>

        <TabsContent
          value="precos"
          forceMount
          className="mt-4 data-[state=inactive]:hidden"
        >
          <FormPanel>
            <FormSectionTitle
              tone="dark"
              icon={CircleDollarSign}
              title="Preço por dia da semana"
              description="Marque os dias em que o serviço é oferecido e defina o preço de cada um."
            />

            <div
              className={cn(
                "flex items-start justify-between gap-4 rounded-xl border px-4 py-3.5",
                "border-white/10 bg-[#1a1b1e]/60"
              )}
            >
              <div className="min-w-0 space-y-1">
                <DarkLabel htmlFor="priceFrom">Valor a partir de</DarkLabel>
                <FieldHint>
                  Marque quando o preço final varia no atendimento — por
                  exemplo, progressiva conforme o tamanho do cabelo. O valor
                  cadastrado é só referência mínima para o cliente.
                </FieldHint>
              </div>
              <Switch
                id="priceFrom"
                checked={priceFrom}
                onCheckedChange={setPriceFrom}
                disabled={saving}
                className="shrink-0"
              />
            </div>

            <div
              className={cn(
                "flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-end",
                "border-white/10 bg-white/[0.03]"
              )}
            >
              <div className="min-w-0 flex-1 space-y-2">
                <DarkLabel htmlFor="bulkPrice">
                  Mesmo preço em todos os dias abertos
                </DarkLabel>
                <Input
                  id="bulkPrice"
                  inputMode="numeric"
                  placeholder="R$ 0,00"
                  value={
                    bulkPriceCents > 0 ? formatPriceBRL(bulkPriceCents) : ""
                  }
                  onChange={handleBulkPriceChange}
                  disabled={saving}
                  className={ADMIN_SURFACE.input}
                  autoComplete="off"
                />
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={applyBulkPrice}
                disabled={saving}
                className={ADMIN_SURFACE.btnGhost}
              >
                Aplicar
              </Button>
            </div>

            {openWeekdays.length === 0 ? (
              <p className={cn("text-sm", ADMIN_SURFACE.muted)}>
                A barbearia não tem dias abertos cadastrados. Ajuste em
                Configurações antes de cadastrar serviços.
              </p>
            ) : (
              <div
                className={cn(
                  "overflow-x-auto rounded-xl border",
                  "border-white/10"
                )}
              >
                <table className="w-full min-w-[480px] text-sm">
                  <thead>
                    <tr className="border-b border-white/10 bg-white/[0.03] text-left text-xs text-[#b4b6bb]">
                      <th className="px-4 py-3 font-medium">Dia</th>
                      <th className="px-4 py-3 font-medium">Oferece</th>
                      <th className="px-4 py-3 font-medium">Preço</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10">
                    {weekdayRows.map((row) => (
                      <tr
                        key={row.weekday}
                        className={cn(
                          !row.shopOpen && "bg-white/[0.02] text-[#8b8d93]"
                        )}
                      >
                        <td className="px-4 py-3 font-medium text-[#f5f5f5]">
                          {WEEKDAYS[row.weekday]}
                          {!row.shopOpen ? (
                            <span
                              className={cn(
                                "ml-2 text-xs font-normal",
                                ADMIN_SURFACE.muted
                              )}
                            >
                              (fechado)
                            </span>
                          ) : null}
                        </td>
                        <td className="px-4 py-3">
                          {row.shopOpen ? (
                            <Checkbox
                              id={`weekday-offered-${row.weekday}`}
                              checked={row.offered}
                              disabled={saving}
                              onCheckedChange={(checked) =>
                                updateWeekdayRow(row.weekday, {
                                  offered: checked === true,
                                })
                              }
                            />
                          ) : (
                            <span className={cn("text-xs", ADMIN_SURFACE.muted)}>
                              —
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <Input
                            inputMode="numeric"
                            placeholder="R$ 0,00"
                            disabled={
                              !row.shopOpen || !row.offered || saving
                            }
                            value={
                              row.offered && row.priceCents > 0
                                ? formatPriceBRL(row.priceCents)
                                : ""
                            }
                            onChange={(event) => {
                              const digits = event.target.value
                                .replace(/\D/g, "")
                                .slice(0, 8);
                              updateWeekdayRow(row.weekday, {
                                priceCents: Number(digits),
                              });
                            }}
                            className={cn("max-w-[140px]", ADMIN_SURFACE.input)}
                            autoComplete="off"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {catalogPriceLabel ? (
              <>
                <Separator className="bg-white/10" />
                <p className={cn("text-sm", ADMIN_SURFACE.muted)}>
                  Na listagem aparece como{" "}
                  <span className="font-medium text-[#ecf15e]">
                    {catalogPriceLabel}
                  </span>
                </p>
              </>
            ) : null}
          </FormPanel>
        </TabsContent>

        <TabsContent
          value="agenda"
          forceMount
          className="mt-4 data-[state=inactive]:hidden"
        >
          <FormPanel>
            <FormSectionTitle
              tone="dark"
              icon={CalendarClock}
              title="Agenda"
              description="Duração do atendimento e quem pode fazer esse serviço."
            />

            <AdminFormFields columns={2}>
              <div className="space-y-2">
                <DarkLabel htmlFor="durationMinutes">
                  Duração (minutos)
                </DarkLabel>
                <Input
                  id="durationMinutes"
                  name="durationMinutes"
                  type="number"
                  min={5}
                  max={480}
                  step={5}
                  placeholder="Ex: 40"
                  value={durationMinutes}
                  onChange={(event) => setDurationMinutes(event.target.value)}
                  disabled={saving}
                  className={ADMIN_SURFACE.input}
                  autoComplete="off"
                />
                <FieldHint>
                  Define quais horários aparecem livres na agenda.
                </FieldHint>
              </div>

              <div className="space-y-3 sm:col-span-2">
                <DarkLabel>Profissionais que fazem</DarkLabel>
                {professionals.length === 0 ? (
                  <div
                    className={cn(
                      "rounded-xl border border-dashed px-4 py-8 text-center text-sm",
                      "border-white/10",
                      ADMIN_SURFACE.muted
                    )}
                  >
                    Nenhum profissional cadastrado. Cadastre em Profissionais e
                    volte aqui para marcar.
                  </div>
                ) : (
                  <CheckboxGroup
                    tone="dark"
                    name="professionalIds"
                    options={professionals.map((professional) => ({
                      id: professional.id,
                      label: professional.nickname,
                    }))}
                    value={professionalIds}
                    onChange={setProfessionalIds}
                  />
                )}
              </div>
            </AdminFormFields>
          </FormPanel>
        </TabsContent>
      </Tabs>

      <AdminFormActions
        tone="dark"
        onCancel={() => router.push("/admin/servicos")}
        submitLabel={submitLabel}
        saving={saving}
      />
    </form>
  );
}
