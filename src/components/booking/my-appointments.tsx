"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { CalendarDays, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ClientWhatsappAuth } from "@/components/booking/client-whatsapp-auth";
import { useClientSession } from "@/components/booking/client-session-context";
import { ProfessionalAvatar } from "@/components/admin/professional-avatar";
import { BookingDatePicker } from "@/components/booking/booking-date-picker";
import { AppointmentCardsSkeleton } from "@/components/skeletons/appointment-cards-skeleton";
import { SlotGridSkeleton } from "@/components/skeletons/slot-grid-skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  formatDateBR,
  formatDuration,
  formatPriceBRL,
  formatWhatsapp,
} from "@/lib/format";
import {
  formatPublicServicePriceLabel,
  formatPublicServicesTotalLabel,
} from "@/lib/public-service-prices";
import { sortServicesByPopularity } from "@/lib/booking-service-groups";
import {
  earliestBookableDate,
  nowMinutesInTimezone,
} from "@/lib/availability";
import type { PublicAppointmentItem } from "@/lib/manage-public-appointment";
import type { ShopCatalog } from "@/lib/get-shop-catalog";
import { withShopQuery } from "@/lib/booking-path";
import { cn } from "@/lib/utils";

const MAX_DAYS_AHEAD = 60;

type Step = "phone" | "list" | "edit";
type ListTab = "upcoming" | "history";

type MyAppointmentsProps = {
  catalog: ShopCatalog;
  today: string;
};

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function statusLabel(status?: string): string {
  switch (status) {
    case "done":
      return "Concluído";
    case "cancelled":
      return "Cancelado";
    case "confirmed":
      return "Confirmado";
    case "scheduled":
      return "Agendado";
    default:
      return status ?? "—";
  }
}

function statusTone(status?: string): { bg: string; text: string } {
  switch (status) {
    case "done":
      return { bg: "rgba(236,241,94,0.12)", text: "#ecf15e" };
    case "cancelled":
      return { bg: "rgba(228,0,20,0.12)", text: "#ffb4b8" };
    default:
      return { bg: "rgba(255,255,255,0.1)", text: "#a3a3a3" };
  }
}

export function MyAppointments({ catalog, today }: MyAppointmentsProps) {
  const shopSlug = catalog.shop.slug;
  const clientSession = useClientSession();
  const maxDate = addDays(today, MAX_DAYS_AHEAD);
  const minDate = useMemo(
    () =>
      earliestBookableDate({
        today,
        nowMinutes: nowMinutesInTimezone(),
        businessHours: catalog.businessHours,
        maxDaysAhead: MAX_DAYS_AHEAD,
      }),
    [today, catalog.businessHours]
  );

  const [step, setStep] = useState<Step>("phone");
  const stepRef = useRef<Step>("phone");

  const [listTab, setListTab] = useState<ListTab>("upcoming");
  const [whatsappDigits, setWhatsappDigits] = useState("");
  const [appointments, setAppointments] = useState<PublicAppointmentItem[]>([]);
  const [loadingList, setLoadingList] = useState(false);

  const [cancelTarget, setCancelTarget] = useState<PublicAppointmentItem | null>(
    null
  );
  const [cancelBusy, setCancelBusy] = useState(false);

  const [editing, setEditing] = useState<PublicAppointmentItem | null>(null);
  const [editDate, setEditDate] = useState(minDate);
  const [editStartTime, setEditStartTime] = useState<string | null>(null);
  const editStartTimeRef = useRef<string | null>(null);
  const [editServiceIds, setEditServiceIds] = useState<string[]>([]);
  const [availableSlots, setAvailableSlots] = useState<string[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [slotsError, setSlotsError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Espelhos pra respostas de fetch lerem o valor atual sem virar dependência.
  useEffect(() => {
    stepRef.current = step;
    editStartTimeRef.current = editStartTime;
  });

  const professionals = catalog.professionals.filter(
    (p) => p.serviceIds.length > 0
  );

  const editingProfessional = professionals.find(
    (p) => p.id === editing?.professionalId
  );
  const editingProName =
    editingProfessional?.nickname ?? editing?.professionalName ?? "Barbeiro";
  const editingProPhoto =
    editingProfessional?.photoUrl ?? editing?.professionalPhotoUrl ?? null;

  const availableServices = useMemo(() => {
    const allowed = new Set(
      editingProfessional?.serviceIds ?? editing?.serviceIds ?? []
    );
    const fromCatalog = sortServicesByPopularity(
      catalog.services.filter((s) => allowed.has(s.id))
    );
    if (fromCatalog.length > 0) return fromCatalog;
    return (editing?.serviceIds ?? []).map((id, index) => ({
      id,
      name: editing?.serviceNames[index] ?? "Serviço",
      description: "",
      photoUrl: null,
      photoPosition: "50% 50%",
      durationMinutes: editing?.totalMinutes ?? 0,
      priceCents: editing?.totalPriceCents ?? 0,
      priceFrom: false,
      weekdayPrices: [] as { weekday: number; priceCents: number }[],
      bookingCount: 0,
    }));
  }, [catalog.services, editingProfessional, editing]);

  const selectedServices = catalog.services.filter((s) =>
    editServiceIds.includes(s.id)
  );
  const editTotalMinutes =
    selectedServices.length > 0
      ? selectedServices.reduce((sum, s) => sum + s.durationMinutes, 0)
      : (editing?.totalMinutes ?? 0);
  const editTotalPriceLabel =
    selectedServices.length > 0
      ? formatPublicServicesTotalLabel(selectedServices, editDate)
      : formatPriceBRL(editing?.totalPriceCents ?? 0);

  const fetchAppointments = useCallback(
    async (canonical: string, tab: ListTab = "upcoming") => {
      setLoadingList(true);
      try {
        const res = await fetch(
          withShopQuery(`/api/v1/appointments?whatsapp=${encodeURIComponent(canonical)}&mode=${tab}`, shopSlug),
          { credentials: "include" }
        );
        const body = await res.json();
        if (!res.ok) {
          toast.error(body.error ?? "Não foi possível buscar seus horários.");
          return false;
        }
        setAppointments(body.appointments ?? []);
        setWhatsappDigits(canonical);
        if (stepRef.current !== "edit") {
          setStep("list");
        }
        return true;
      } catch {
        toast.error("Não foi possível buscar seus horários.");
        return false;
      } finally {
        setLoadingList(false);
      }
    },
    [shopSlug]
  );

  const handleAuthenticated = useCallback(
    (canonical: string) => {
      setListTab("upcoming");
      void fetchAppointments(canonical, "upcoming");
    },
    [fetchAppointments]
  );

  useEffect(() => {
    if (clientSession.status !== "anonymous") return;
    if (step === "phone") return;
    setStep("phone");
    setWhatsappDigits("");
    setAppointments([]);
    setEditing(null);
    setCancelTarget(null);
  }, [clientSession.status, step]);

  const switchTab = (tab: ListTab) => {
    if (tab === listTab || step === "edit") return;
    setListTab(tab);
    if (whatsappDigits) {
      void fetchAppointments(whatsappDigits, tab);
    }
  };

  useEffect(() => {
    if (step !== "edit" || !editing || editServiceIds.length === 0) return;

    const controller = new AbortController();
    const params = new URLSearchParams({
      professionalId: editing.professionalId,
      date: editDate,
      serviceIds: editServiceIds.join(","),
      excludeAppointmentId: editing.id,
    });

    async function loadSlots() {
      setLoadingSlots(true);
      setSlotsError(null);

      try {
        const res = await fetch(
          withShopQuery(`/api/v1/appointments/availability?${params}`, shopSlug),
          { signal: controller.signal }
        );
        const body = await res.json();

        if (!res.ok) {
          setAvailableSlots([]);
          setSlotsError(body.error ?? "Não foi possível carregar os horários.");
          return;
        }

        const loaded: string[] = body.slots ?? [];
        setAvailableSlots(loaded);
        if (loaded.length === 0) {
          setSlotsError("Nenhum horário livre neste dia para esses serviços.");
        }

        const current = editStartTimeRef.current;
        if (current && !loaded.includes(current)) {
          setEditStartTime(null);
        }
      } catch {
        if (controller.signal.aborted) return;
        setAvailableSlots([]);
        setSlotsError("Não foi possível carregar os horários.");
      } finally {
        if (!controller.signal.aborted) setLoadingSlots(false);
      }
    }

    void loadSlots();

    return () => controller.abort();
  }, [step, editing, editDate, editServiceIds, shopSlug]);

  function startEdit(appointment: PublicAppointmentItem) {
    setEditing(appointment);
    setEditDate(appointment.date < minDate ? minDate : appointment.date);
    setEditStartTime(appointment.startTime);
    setEditServiceIds([...appointment.serviceIds]);
    setAvailableSlots([]);
    setSlotsError(null);
    setStep("edit");
  }

  function leaveEdit() {
    setEditing(null);
    setAvailableSlots([]);
    setSlotsError(null);
    setStep("list");
  }

  function toggleEditService(id: string, checked: boolean) {
    const next = checked
      ? [...editServiceIds, id]
      : editServiceIds.filter((v) => v !== id);

    setEditServiceIds(next);
    setEditStartTime(null);

    // Sem serviço marcado não há o que buscar: limpa a lista de horários.
    if (next.length === 0) {
      setAvailableSlots([]);
      setSlotsError(null);
    }
  }

  async function handleCancelConfirm() {
    if (!cancelTarget) return;
    setCancelBusy(true);

    try {
      const res = await fetch(
        withShopQuery(`/api/v1/appointments/${cancelTarget.id}?whatsapp=${encodeURIComponent(whatsappDigits)}`, shopSlug),
        { method: "DELETE", credentials: "include" }
      );
      const body = await res.json();

      if (!res.ok) {
        toast.error(body.error ?? "Não foi possível cancelar.");
        setCancelBusy(false);
        return;
      }

      toast.success("Agendamento cancelado.");
      setCancelTarget(null);
      await fetchAppointments(whatsappDigits, "upcoming");
      setListTab("upcoming");
    } catch {
      toast.error("Não foi possível cancelar.");
    }

    setCancelBusy(false);
  }

  async function handleSaveEdit() {
    if (!editing || !editStartTime || editServiceIds.length === 0) {
      toast.error("Escolha data, horário e pelo menos um serviço.");
      return;
    }

    setSaving(true);

    try {
      const res = await fetch(withShopQuery(`/api/v1/appointments/${editing.id}`, shopSlug), {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          whatsapp: whatsappDigits,
          professionalId: editing.professionalId,
          date: editDate < minDate ? minDate : editDate,
          startTime: editStartTime,
          serviceIds: editServiceIds,
        }),
      });

      const body = await res.json();

      if (!res.ok) {
        toast.error(body.error ?? "Não foi possível salvar.");
        setSaving(false);
        return;
      }

      toast.success("Horário atualizado.");
      setEditing(null);
      setListTab("upcoming");
      setStep("list");
      await fetchAppointments(whatsappDigits, "upcoming");
    } catch {
      toast.error("Não foi possível salvar.");
    }

    setSaving(false);
  }

  if (step === "phone") {
    return (
      <div className="flex min-h-0 flex-1 flex-col px-5 pt-6">
        <h2 className="booking-display text-[1.75rem] font-medium leading-tight tracking-tight">
          Horários
        </h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Confirme o WhatsApp pra ver próximos horários e o histórico.
        </p>

        <div className="mt-8">
          <ClientWhatsappAuth
          shopSlug={shopSlug}
            onAuthenticated={handleAuthenticated}
            hint="Informe seu WhatsApp pra ver e gerenciar seus horários neste aparelho."
          />
          {loadingList ? (
            <p className="mt-4 text-sm text-muted-foreground">Carregando...</p>
          ) : null}
        </div>
      </div>
    );
  }

  if (step === "edit" && editing) {
    const safeDate = editDate < minDate ? minDate : editDate;

    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="shrink-0 px-5 pt-5">
          <h2 className="booking-display text-[1.75rem] font-medium leading-tight tracking-tight">
            Remarcar
          </h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {editingProName} · escolha serviços, data e horário.
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3 rounded-2xl bg-[#151618] px-3 py-2.5 ring-1 ring-white/8">
              <ProfessionalAvatar
                photoUrl={editingProPhoto}
                photoPosition={editingProfessional?.photoPosition}
                name={editingProName}
                size="md"
              />
              <div>
                <p className="font-medium">{editingProName}</p>
                <p className="text-xs text-muted-foreground">
                  {formatWhatsapp(whatsappDigits)}
                </p>
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground">
                1. Serviços
              </p>
              {availableServices.length === 0 ? (
                <p className="rounded-2xl bg-white/[0.04] px-4 py-5 text-center text-sm text-muted-foreground">
                  Não foi possível carregar os serviços deste barbeiro.
                </p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {availableServices.map((svc) => {
                    const checked = editServiceIds.includes(svc.id);
                    return (
                      <li key={svc.id}>
                        <label
                          className={cn(
                            "flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-3 transition-all",
                            checked
                              ? "border-primary bg-primary/10"
                              : "border-white/10 bg-white/[0.03]"
                          )}
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(c) =>
                              toggleEditService(svc.id, c === true)
                            }
                          />
                          <div className="min-w-0 flex-1">
                            <p className="font-medium">{svc.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {formatDuration(svc.durationMinutes)} ·{" "}
                              {formatPublicServicePriceLabel(svc, safeDate)}
                            </p>
                          </div>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground">
                2. Data
              </p>
              <BookingDatePicker
                selectedDate={safeDate}
                today={today}
                minDate={minDate}
                maxDate={maxDate}
                onSelectDate={(d) => {
                  setEditDate(d);
                  setEditStartTime(null);
                }}
              />
            </div>

            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground">
                3. Horário
              </p>
              {editServiceIds.length === 0 ? (
                <p className="rounded-2xl bg-white/[0.04] px-4 py-5 text-center text-sm text-muted-foreground">
                  Escolha pelo menos um serviço pra ver os horários.
                </p>
              ) : loadingSlots ? (
                <SlotGridSkeleton />
              ) : slotsError ? (
                <p className="rounded-2xl bg-white/[0.04] px-4 py-5 text-center text-sm text-muted-foreground">
                  {slotsError}
                </p>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {availableSlots.map((slot) => (
                    <Button
                      key={slot}
                      type="button"
                      variant={editStartTime === slot ? "default" : "outline"}
                      size="sm"
                      className="h-11 rounded-xl tabular-nums"
                      onClick={() => setEditStartTime(slot)}
                    >
                      {slot}
                    </Button>
                  ))}
                </div>
              )}
            </div>

            {editStartTime && editServiceIds.length > 0 ? (
              <p className="text-center text-xs text-muted-foreground">
                Total: {formatDuration(editTotalMinutes)} · {editTotalPriceLabel}
              </p>
            ) : null}
          </div>
        </div>

        <div className="relative shrink-0 border-t border-white/8 px-5 pb-3 pt-2">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="lg"
              onClick={leaveEdit}
              className="h-12 shrink-0 rounded-2xl px-3 text-muted-foreground"
            >
              Voltar
            </Button>
            <Button
              type="button"
              size="lg"
              disabled={
                saving ||
                !editStartTime ||
                editServiceIds.length === 0 ||
                loadingSlots
              }
              onClick={() => void handleSaveEdit()}
              className="h-12 min-w-0 flex-1 rounded-2xl font-semibold"
            >
              {saving ? "Salvando..." : "Salvar alterações"}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="px-5 pb-6 pt-6">
        <h2 className="booking-display text-[1.75rem] font-medium leading-tight tracking-tight">
          Horários
        </h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Próximos e histórico deste WhatsApp
        </p>

        <div className="mt-4 flex rounded-[14px] bg-white/[0.06] p-1">
          {(
            [
              { id: "upcoming", label: "Próximos" },
              { id: "history", label: "Histórico" },
            ] as const
          ).map((tab) => {
            const active = listTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => switchTab(tab.id)}
                className={cn(
                  "h-10 flex-1 rounded-[11px] text-[13px] font-semibold transition-colors",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground"
                )}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="mt-4">
          {loadingList ? (
            <AppointmentCardsSkeleton />
          ) : appointments.length === 0 ? (
            <div className="rounded-2xl bg-[#151618] px-5 py-10 text-center ring-1 ring-white/8">
              {listTab === "upcoming" ? (
                <CalendarDays
                  className="mx-auto size-8 text-muted-foreground"
                  strokeWidth={1.5}
                />
              ) : (
                <Clock
                  className="mx-auto size-8 text-muted-foreground"
                  strokeWidth={1.5}
                />
              )}
              <p className="mt-3 font-medium text-[#f5f5f5]">
                {listTab === "upcoming"
                  ? "Nenhum horário marcado"
                  : "Nenhum atendimento no histórico"}
              </p>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                {listTab === "upcoming"
                  ? "Quando você agendar, os próximos horários aparecem aqui pra remarcar ou cancelar."
                  : "Atendimentos passados e cancelados aparecem nesta lista."}
              </p>
            </div>
          ) : (
            <ul className="flex flex-col gap-3">
              {appointments.map((a) => {
                const tone = statusTone(a.status);
                return (
                  <li
                    key={a.id}
                    className="rounded-2xl bg-[#151618] p-4 ring-1 ring-white/8"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[1.75rem] font-semibold tabular-nums leading-none tracking-tight text-[#f5f5f5]">
                          {a.startTime}
                        </p>
                        <p className="mt-1.5 text-sm capitalize text-muted-foreground">
                          {formatDateBR(a.date)}
                        </p>
                      </div>
                      {listTab === "history" ? (
                        <span
                          className="rounded-full px-2.5 py-1 text-[11px] font-medium"
                          style={{
                            backgroundColor: tone.bg,
                            color: tone.text,
                          }}
                        >
                          {statusLabel(a.status)}
                        </span>
                      ) : (
                        <ProfessionalAvatar
                          photoUrl={a.professionalPhotoUrl}
                          photoPosition={
                            catalog.professionals.find(
                              (p) => p.id === a.professionalId
                            )?.photoPosition
                          }
                          name={a.professionalName}
                          size="md"
                        />
                      )}
                    </div>

                    <div className="mt-4 border-t border-white/8 pt-3">
                      <div
                        className={cn(
                          listTab === "history" && "flex items-start gap-3"
                        )}
                      >
                        {listTab === "history" ? (
                          <ProfessionalAvatar
                            photoUrl={a.professionalPhotoUrl}
                            photoPosition={
                              catalog.professionals.find(
                                (p) => p.id === a.professionalId
                              )?.photoPosition
                            }
                            name={a.professionalName}
                            size="md"
                          />
                        ) : null}
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-[#f5f5f5]">
                            {a.professionalName}
                          </p>
                          <p className="mt-0.5 text-sm leading-snug text-muted-foreground">
                            {a.serviceNames.join(", ")}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {formatDuration(a.totalMinutes)} ·{" "}
                            {formatPriceBRL(a.totalPriceCents)}
                          </p>
                        </div>
                      </div>
                    </div>

                    {listTab === "upcoming" ? (
                      <div className="mt-4 grid grid-cols-2 gap-2">
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          className="h-11 rounded-xl bg-white/[0.06] hover:bg-white/10"
                          onClick={() => startEdit(a)}
                        >
                          Remarcar
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          className="h-11 rounded-xl bg-white/[0.06] text-destructive hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => setCancelTarget(a)}
                        >
                          Cancelar
                        </Button>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      <Dialog
        open={!!cancelTarget}
        onOpenChange={(open) => !open && setCancelTarget(null)}
      >
        <DialogContent className="booking-dialog gap-0 overflow-hidden p-0 sm:max-w-md">
          <DialogHeader className="space-y-2 border-b px-6 py-6 pr-12 text-left">
            <DialogTitle className="text-lg font-semibold">
              Cancelar agendamento?
            </DialogTitle>
            <DialogDescription className="mt-2 text-sm leading-relaxed">
              O horário volta a ficar livre na agenda da barbearia.
            </DialogDescription>
          </DialogHeader>

          {cancelTarget ? (
            <div className="px-6 py-5">
              <div className="rounded-xl border p-5">
                <div className="flex items-end justify-between gap-4">
                  <div>
                    <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                      Data
                    </p>
                    <p className="mt-1.5 text-sm font-semibold capitalize">
                      {formatDateBR(cancelTarget.date)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                      Horário
                    </p>
                    <p className="mt-1.5 text-xl font-semibold tabular-nums leading-none">
                      {cancelTarget.startTime}
                    </p>
                  </div>
                </div>

                <div className="my-5 h-px bg-border" />

                <div className="flex items-center gap-3.5">
                  <ProfessionalAvatar
                    photoUrl={cancelTarget.professionalPhotoUrl}
                    photoPosition={
                      catalog.professionals.find(
                        (p) => p.id === cancelTarget.professionalId
                      )?.photoPosition
                    }
                    name={cancelTarget.professionalName}
                    size="md"
                  />
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">Barbeiro</p>
                    <p className="mt-0.5 truncate font-semibold">
                      {cancelTarget.professionalName}
                    </p>
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                      {cancelTarget.serviceNames.join(", ")}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          <DialogFooter className="flex-row gap-2 border-t px-6 py-5 sm:justify-stretch">
            <Button
              type="button"
              variant="secondary"
              className="h-11 flex-1 rounded-2xl"
              onClick={() => setCancelTarget(null)}
              disabled={cancelBusy}
            >
              Voltar
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="h-11 flex-1 rounded-2xl font-semibold"
              onClick={() => void handleCancelConfirm()}
              disabled={cancelBusy}
            >
              {cancelBusy ? "Cancelando..." : "Sim, cancelar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
