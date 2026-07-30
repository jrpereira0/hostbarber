"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Check, CheckCircle2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ProfessionalAvatar } from "@/components/admin/professional-avatar";
import { SearchInput } from "@/components/admin/search-input";
import { BookingDatePicker } from "@/components/booking/booking-date-picker";
import {
  ClientWhatsappAuth,
  logoutClientSession,
} from "@/components/booking/client-whatsapp-auth";
import { ServiceThumbnail } from "@/components/booking/service-thumbnail";
import {
  formatDateBR,
  formatDuration,
  formatPriceBRL,
  formatWhatsapp,
} from "@/lib/format";
import { matchesSearch } from "@/lib/text";
import {
  formatPublicServicePriceLabel,
  formatPublicServicesTotalLabel,
  sumPublicServicesPriceCents,
} from "@/lib/public-service-prices";
import { groupServicesForBooking } from "@/lib/booking-service-groups";
import {
  earliestBookableDate,
  nowMinutesInTimezone,
} from "@/lib/availability";
import { normalizeWhatsapp, whatsappLookupDelayMs } from "@/lib/whatsapp";
import { SlotGridSkeleton } from "@/components/skeletons/slot-grid-skeleton";
import { cn } from "@/lib/utils";
import type { PublicService, ShopCatalog } from "@/lib/get-shop-catalog";
import { withShopQuery } from "@/lib/booking-path";

type Step = "professional" | "services" | "datetime" | "confirm";

const NO_PREFERENCE_ID = "__any__";
const MAX_DAYS_AHEAD = 60;
const stepOrder: Step[] = ["professional", "services", "datetime", "confirm"];

const stepMeta: Record<Step, { title: string; hint: string }> = {
  professional: {
    title: "Quem te atende?",
    hint: "Escolha o barbeiro ou deixe qualquer um.",
  },
  services: {
    title: "Qual serviço?",
    hint: "Toque pra marcar. Pode escolher mais de um.",
  },
  datetime: {
    title: "Quando você vem?",
    hint: "Dia e horário livre.",
  },
  confirm: {
    title: "Seus dados",
    hint: "Informe o WhatsApp e finalize.",
  },
};

type BookingFlowProps = {
  catalog: ShopCatalog;
  today: string;
};

type Confirmation = {
  professionalId: string;
  professionalName: string;
  professionalPhotoUrl: string | null;
  date: string;
  startTime: string;
  serviceNames: string[];
  totalPriceCents: number;
  totalMinutes: number;
  customerName: string;
};

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function StepDots({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: total }, (_, index) => {
        const active = index + 1 <= current;
        return (
          <span
            key={index}
            className={cn(
              "h-1.5 rounded-full transition-all",
              active ? "w-5 bg-primary" : "w-1.5 bg-white/15"
            )}
          />
        );
      })}
    </div>
  );
}

function ServicePickerRow({
  service,
  checked,
  onToggle,
}: {
  service: PublicService;
  checked: boolean;
  onToggle: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onToggle(!checked)}
      className={cn(
        "flex w-full items-center gap-3 rounded-2xl px-3.5 py-3 text-left transition-colors ring-1",
        checked
          ? "bg-primary/10 ring-primary/45"
          : "bg-[#151618] ring-white/8 active:bg-white/[0.04]"
      )}
    >
      <ServiceThumbnail
        photoUrl={service.photoUrl}
        photoPosition={service.photoPosition}
        name={service.name}
        size="md"
        className="border-white/10 bg-[#0e0f11]"
      />
      <div className="min-w-0 flex-1">
        <p className="text-[0.95rem] font-medium leading-snug">{service.name}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span>{formatDuration(service.durationMinutes)}</span>
          <span className="text-white/20">·</span>
          <span>{formatPublicServicePriceLabel(service)}</span>
        </div>
      </div>
      <span
        className={cn(
          "flex size-6 shrink-0 items-center justify-center rounded-full transition-colors",
          checked
            ? "bg-primary text-primary-foreground"
            : "bg-white/[0.06] ring-1 ring-white/12"
        )}
      >
        {checked ? <Check className="size-3.5" strokeWidth={2.5} /> : null}
      </span>
    </button>
  );
}

function SelectedServiceChips({
  services,
  onRemove,
}: {
  services: PublicService[];
  onRemove: (id: string) => void;
}) {
  if (services.length === 0) return null;

  return (
    <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {services.map((service) => (
        <button
          key={service.id}
          type="button"
          onClick={() => onRemove(service.id)}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
        >
          <span className="max-w-[9.5rem] truncate">{service.name}</span>
          <span className="text-primary-foreground/70">×</span>
        </button>
      ))}
    </div>
  );
}

const SLOT_PERIODS = [
  { label: "Manhã", from: 0, to: 12 },
  { label: "Tarde", from: 12, to: 18 },
  { label: "Noite", from: 18, to: 24 },
] as const;

function SlotGroups({
  slots,
  selected,
  onSelect,
}: {
  slots: string[];
  selected: string | null;
  onSelect: (slot: string) => void;
}) {
  const groups = SLOT_PERIODS.map((period) => ({
    label: period.label,
    slots: slots.filter((s) => {
      const hour = parseInt(s.split(":")[0], 10);
      return hour >= period.from && hour < period.to;
    }),
  })).filter((g) => g.slots.length > 0);

  return (
    <div className="flex flex-col gap-4">
      {groups.map((group) => (
        <div key={group.label}>
          <p className="mb-2 text-xs font-medium text-muted-foreground">
            {group.label}
          </p>
          <div className="grid grid-cols-3 gap-2">
            {group.slots.map((slot) => (
              <button
                key={slot}
                type="button"
                onClick={() => onSelect(slot)}
                className={cn(
                  "h-12 rounded-2xl border text-base font-semibold tabular-nums transition-colors",
                  selected === slot
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-white/10 bg-white/[0.03]"
                )}
              >
                {slot}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function BookingFlow({ catalog, today }: BookingFlowProps) {
  const shopSlug = catalog.shop.slug;
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
  const rootRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const skipInitialScrollRef = useRef(true);

  const [step, setStep] = useState<Step>("professional");
  const [professionalId, setProfessionalId] = useState("");
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const [serviceSearch, setServiceSearch] = useState("");
  const [date, setDate] = useState(minDate);
  const [startTime, setStartTime] = useState<string | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [whatsappVerified, setWhatsappVerified] = useState(false);
  const [customerFound, setCustomerFound] = useState(false);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupDone, setLookupDone] = useState(false);
  const lastLookupDigitsRef = useRef("");
  const [saving, setSaving] = useState(false);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [availableSlots, setAvailableSlots] = useState<string[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [slotsError, setSlotsError] = useState<string | null>(null);

  useEffect(() => {
    if (skipInitialScrollRef.current) {
      skipInitialScrollRef.current = false;
      return;
    }

    bodyRef.current?.scrollTo({ top: 0 });
    const card = rootRef.current;
    if (!card || card.offsetParent === null) return;

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        card.scrollIntoView({
          behavior: "smooth",
          block: "center",
          inline: "nearest",
        });
      });
    });
  }, [step, confirmation]);

  const { services } = catalog;
  const professionals = catalog.professionals.filter(
    (p) => p.serviceIds.length > 0
  );

  const anyPreference = professionalId === NO_PREFERENCE_ID;
  const selectedProfessional = anyPreference
    ? null
    : (professionals.find((p) => p.id === professionalId) ?? null);
  const currentStep = stepOrder.indexOf(step) + 1;
  const meta = useMemo(() => {
    if (step !== "confirm") return stepMeta[step];
    if (!whatsappVerified) return stepMeta.confirm;
    if (lookupLoading) {
      return {
        title: "Seus dados",
        hint: "Buscando seu cadastro...",
      };
    }
    if (customerFound) {
      return {
        title: "Confirmar agendamento",
        hint: "Revise os dados e finalize.",
      };
    }
    if (lookupDone) {
      return {
        title: "Confirmar agendamento",
        hint: "Complete nome e sobrenome pra finalizar.",
      };
    }
    return stepMeta.confirm;
  }, [step, whatsappVerified, lookupLoading, customerFound, lookupDone]);

  const availableServices = useMemo(() => {
    if (!professionalId) return [];
    if (anyPreference) {
      const allowed = new Set(professionals.flatMap((p) => p.serviceIds));
      return services.filter((s) => allowed.has(s.id));
    }
    const allowed = new Set(selectedProfessional?.serviceIds ?? []);
    return services.filter((s) => allowed.has(s.id));
  }, [
    anyPreference,
    professionalId,
    professionals,
    selectedProfessional,
    services,
  ]);

  const filteredServices = useMemo(() => {
    if (!serviceSearch.trim()) return availableServices;
    return availableServices.filter((s) => matchesSearch(s.name, serviceSearch));
  }, [availableServices, serviceSearch]);

  const serviceGroups = useMemo(
    () =>
      groupServicesForBooking(filteredServices, {
        searching: Boolean(serviceSearch.trim()),
      }),
    [filteredServices, serviceSearch]
  );

  const selectedServices = services.filter((s) => serviceIds.includes(s.id));
  const priceDate =
    step === "datetime" || step === "confirm" ? date : undefined;
  const totalMinutes = selectedServices.reduce(
    (sum, s) => sum + s.durationMinutes,
    0
  );
  const totalPrice = sumPublicServicesPriceCents(selectedServices, priceDate);
  const totalPriceLabel = formatPublicServicesTotalLabel(
    selectedServices,
    priceDate
  );

  useEffect(() => {
    if (step !== "datetime" || !professionalId || serviceIds.length === 0) {
      return;
    }

    let cancelled = false;
    const timer = setTimeout(() => {
      if (cancelled) return;
      setLoadingSlots(true);
      setSlotsError(null);
      setStartTime(null);

      const params = new URLSearchParams({
        date,
        serviceIds: serviceIds.join(","),
      });
      if (anyPreference) {
        params.set("anyProfessional", "1");
      } else {
        params.set("professionalId", professionalId);
      }

      fetch(withShopQuery(`/api/v1/appointments/availability?${params}`, shopSlug))
        .then(async (res) => {
          const body = await res.json();
          if (cancelled) return;
          if (!res.ok) {
            setAvailableSlots([]);
            setSlotsError(body.error ?? "Não foi possível carregar os horários.");
            return;
          }
          const loaded: string[] = body.slots ?? [];
          setAvailableSlots(loaded);
          if (loaded.length === 0) {
            setSlotsError(
              body.message ??
                "Nenhum horário livre neste dia para esses serviços."
            );
          }
        })
        .catch(() => {
          if (!cancelled) {
            setAvailableSlots([]);
            setSlotsError("Não foi possível carregar os horários.");
          }
        })
        .finally(() => {
          if (!cancelled) setLoadingSlots(false);
        });
    }, 0);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [step, professionalId, anyPreference, serviceIds, date, shopSlug]);

  useEffect(() => {
    if (step !== "confirm" || !whatsappVerified) return;

    const delay = whatsappLookupDelayMs(whatsapp);
    if (delay === null) {
      lastLookupDigitsRef.current = "";
      const resetTimer = setTimeout(() => {
        setLookupLoading(false);
        setLookupDone(false);
        setCustomerFound(false);
      }, 0);
      return () => clearTimeout(resetTimer);
    }

    let cancelled = false;
    const timer = setTimeout(() => {
      const current = normalizeWhatsapp(whatsapp);
      if (cancelled || !current) return;
      if (current === lastLookupDigitsRef.current) return;

      lastLookupDigitsRef.current = current;
      setLookupLoading(true);
      setLookupDone(false);
      setCustomerFound(false);

      fetch(withShopQuery("/api/v1/customers/me", shopSlug), { credentials: "include" })
        .then(async (res) => {
          const body = await res.json();
          if (cancelled) return;
          if (!res.ok) {
            lastLookupDigitsRef.current = "";
            setLookupDone(false);
            toast.error(body.error ?? "Não foi possível buscar seus dados.");
            return;
          }
          if (body.found && body.customer) {
            setFirstName(body.customer.firstName);
            setLastName(body.customer.lastName);
            setCustomerFound(true);
          } else {
            setFirstName("");
            setLastName("");
            setCustomerFound(false);
          }
          setLookupDone(true);
        })
        .catch(() => {
          if (!cancelled) {
            lastLookupDigitsRef.current = "";
            setLookupDone(false);
            toast.error("Não foi possível buscar seus dados. Tente de novo.");
          }
        })
        .finally(() => {
          if (!cancelled) setLookupLoading(false);
        });
    }, delay);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [whatsapp, step, whatsappVerified, shopSlug]);

  const handleWhatsappAuthenticated = useCallback((canonical: string) => {
    setWhatsapp(formatWhatsapp(canonical));
    setWhatsappVerified(true);
  }, []);

  function selectProfessional(id: string) {
    setProfessionalId(id);
    setServiceIds([]);
    setStartTime(null);
  }

  function toggleService(id: string, checked: boolean) {
    setServiceIds((prev) =>
      checked ? [...prev, id] : prev.filter((value) => value !== id)
    );
    setStartTime(null);
  }

  function resetCustomer() {
    setCustomerFound(false);
    setLookupDone(false);
    setLookupLoading(false);
    setFirstName("");
    setLastName("");
    setWhatsapp("");
    setWhatsappVerified(false);
    lastLookupDigitsRef.current = "";
  }

  async function handleNotMe() {
    await logoutClientSession();
    lastLookupDigitsRef.current = "";
    setWhatsapp("");
    setWhatsappVerified(false);
    setFirstName("");
    setLastName("");
    setCustomerFound(false);
    setLookupDone(false);
    setLookupLoading(false);
  }

  function restartBooking() {
    setConfirmation(null);
    setStep("professional");
    setProfessionalId("");
    setServiceIds([]);
    setServiceSearch("");
    setDate(minDate);
    setStartTime(null);
    setAvailableSlots([]);
    setSlotsError(null);
    setLoadingSlots(false);
    resetCustomer();
  }

  function goBack() {
    if (step === "confirm") {
      resetCustomer();
      setStep("datetime");
      return;
    }
    if (step === "datetime") setStep("services");
    else if (step === "services") setStep("professional");
  }

  function goNext() {
    if (step === "professional") {
      if (!professionalId) {
        toast.error("Escolha quem vai te atender.");
        return;
      }
      setStep("services");
      return;
    }
    if (step === "services") {
      if (serviceIds.length === 0) {
        toast.error("Escolha pelo menos um serviço.");
        return;
      }
      setStep("datetime");
      return;
    }
    if (step === "datetime") {
      if (!startTime) {
        toast.error("Escolha um horário.");
        return;
      }
      resetCustomer();
      setStep("confirm");
    }
  }

  async function handleConfirm() {
    const digits = normalizeWhatsapp(whatsapp);
    if (!firstName.trim() || !lastName.trim() || !digits || !startTime) {
      toast.error("Preencha nome, sobrenome e confirme o WhatsApp.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(withShopQuery("/api/v1/appointments", shopSlug), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          ...(anyPreference ? { anyProfessional: true } : { professionalId }),
          date,
          startTime,
          serviceIds,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          whatsapp: digits,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        toast.error(body.error ?? "Não foi possível confirmar.");
        setSaving(false);
        return;
      }

      const assignedId =
        (typeof body.professionalId === "string" && body.professionalId) ||
        professionalId;
      const assignedPro = catalog.professionals.find((p) => p.id === assignedId);
      const assignedName =
        (typeof body.professionalNickname === "string" &&
          body.professionalNickname) ||
        assignedPro?.nickname ||
        selectedProfessional?.nickname ||
        "Barbeiro";

      setConfirmation({
        professionalId: assignedId,
        professionalName: assignedName,
        professionalPhotoUrl: assignedPro?.photoUrl ?? null,
        date,
        startTime,
        serviceNames: selectedServices.map((s) => s.name),
        totalPriceCents: totalPrice,
        totalMinutes,
        customerName: [firstName.trim(), lastName.trim()]
          .filter(Boolean)
          .join(" "),
      });
      setSaving(false);
    } catch {
      toast.error("Não foi possível confirmar. Tente de novo.");
      setSaving(false);
    }
  }

  const primaryLabel =
    step === "professional"
      ? "Escolher serviço"
      : step === "services"
        ? "Escolher horário"
        : step === "datetime"
          ? "Informar meus dados"
          : saving
            ? "Confirmando..."
            : "Confirmar horário";

  const primaryDisabled =
    (step === "professional" && !professionalId) ||
    (step === "services" && serviceIds.length === 0) ||
    (step === "datetime" && !startTime) ||
    (step === "confirm" &&
      (saving ||
        !whatsappVerified ||
        lookupLoading ||
        !lookupDone ||
        !normalizeWhatsapp(whatsapp) ||
        !firstName.trim() ||
        !lastName.trim()));

  if (confirmation) {
    const confirmedProfessional = catalog.professionals.find(
      (p) => p.id === confirmation.professionalId
    );
    const professionalPhotoUrl =
      confirmedProfessional?.photoUrl?.trim() ||
      confirmation.professionalPhotoUrl?.trim() ||
      null;
    const professionalPhotoPosition = confirmedProfessional?.photoPosition;

    return (
      <div
        ref={rootRef}
        className="flex min-h-0 flex-1 flex-col overflow-hidden"
      >
        <div className="bg-primary px-5 py-10 text-center text-primary-foreground">
          <div className="mx-auto flex size-14 items-center justify-center rounded-full border border-primary-foreground/20 bg-primary-foreground/10">
            <CheckCircle2 className="size-7" strokeWidth={1.5} />
          </div>
          <h2 className="mt-4 text-xl font-semibold tracking-tight">
            Horário agendado
          </h2>
          <p className="mt-1.5 text-sm text-primary-foreground/70">
            {confirmation.customerName}, te esperamos!
          </p>
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-5">
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Data
                </p>
                <p className="mt-1 font-semibold capitalize">
                  {formatDateBR(confirmation.date)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Horário
                </p>
                <p className="mt-1 text-2xl font-semibold tabular-nums">
                  {confirmation.startTime}
                </p>
              </div>
            </div>
            <div className="my-4 h-px bg-white/10" />
            <div className="flex items-center gap-3">
              <ProfessionalAvatar
                photoUrl={professionalPhotoUrl}
                photoPosition={professionalPhotoPosition}
                name={confirmation.professionalName}
                size="lg"
              />
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Barbeiro</p>
                <p className="truncate font-semibold">
                  {confirmation.professionalName}
                </p>
              </div>
            </div>
            <div className="my-4 h-px bg-white/10" />
            <p className="text-xs text-muted-foreground">Serviços</p>
            <p className="mt-1 font-medium">
              {confirmation.serviceNames.join(", ")}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {formatDuration(confirmation.totalMinutes)} ·{" "}
              {formatPriceBRL(confirmation.totalPriceCents)}
            </p>
          </div>
          <p className="text-center text-xs text-muted-foreground">
            Precisa mudar? Use Horários no menu de baixo.
          </p>
        </div>
        <div className="relative shrink-0 px-5 pb-3 pt-1">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 -top-6 h-6 bg-gradient-to-t from-[#0e0f11] to-transparent"
          />
          <Button
            type="button"
            size="lg"
            onClick={restartBooking}
            className="h-12 w-full rounded-2xl text-[0.95rem] font-semibold shadow-none"
          >
            Voltar ao início
          </Button>
        </div>
      </div>
    );
  }

  if (professionals.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center px-5 py-8 text-center text-sm text-muted-foreground">
        A barbearia ainda não tem barbeiros disponíveis para agendamento online.
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      className="flex min-h-0 flex-1 flex-col overflow-hidden"
    >
      <div
        className={cn(
          "relative z-10 shrink-0 bg-[#0e0f11] px-5",
          step === "professional"
            ? "pb-2 pt-3"
            : step === "confirm" && !whatsappVerified
              ? "pb-2 pt-4"
              : "pb-2 pt-5"
        )}
      >
        <div className="flex items-center justify-between gap-3">
          <StepDots current={currentStep} total={stepOrder.length} />
          <span className="text-[11px] tabular-nums text-muted-foreground">
            {currentStep} de {stepOrder.length}
          </span>
        </div>
        <h2
          className={cn(
            "booking-display font-medium leading-tight tracking-tight",
            step === "professional"
              ? "mt-2.5 text-[1.45rem]"
              : step === "confirm" && !whatsappVerified
                ? "mt-3 text-[1.5rem]"
                : "mt-4 text-[1.75rem]"
          )}
        >
          {meta.title}
        </h2>
        <p
          className={cn(
            "text-muted-foreground",
            step === "professional"
              ? "mt-1 text-[13px]"
              : step === "confirm" && !whatsappVerified
                ? "mt-1 text-[13px]"
                : "mt-1.5 text-sm"
          )}
        >
          {meta.hint}
        </p>

        {(step === "services" || step === "datetime" || step === "confirm") &&
          (anyPreference || selectedProfessional) && (
            <div
              className={cn(
                "flex items-center gap-2.5 rounded-2xl bg-[#151618] px-3 py-2.5 ring-1 ring-white/8",
                step === "confirm" && !whatsappVerified ? "mt-3" : "mt-4"
              )}
            >
              {anyPreference ? (
                <div className="flex size-8 items-center justify-center rounded-full bg-white/10">
                  <Users className="size-3.5 text-muted-foreground" />
                </div>
              ) : (
                <ProfessionalAvatar
                  photoUrl={selectedProfessional!.photoUrl}
                  photoPosition={selectedProfessional!.photoPosition}
                  name={selectedProfessional!.nickname}
                  size="sm"
                />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {anyPreference
                    ? "Qualquer barbeiro"
                    : selectedProfessional!.nickname}
                  {selectedServices.length > 0
                    ? ` · ${selectedServices.map((s) => s.name).join(", ")}`
                    : ""}
                </p>
                {startTime && step === "confirm" ? (
                  <p className="text-xs text-muted-foreground">
                    {formatDateBR(date)} às {startTime} · {totalPriceLabel}
                  </p>
                ) : selectedServices.length > 0 ? (
                  <p className="text-xs text-muted-foreground">
                    {formatDuration(totalMinutes)} · {totalPriceLabel}
                  </p>
                ) : null}
              </div>
            </div>
          )}
      </div>

      <div
        ref={bodyRef}
        className={cn(
          "min-h-0 flex-1 px-5",
          step === "professional"
            ? "overflow-hidden pt-2 pb-2"
            : cn(
                "overflow-y-auto overscroll-y-contain [-webkit-overflow-scrolling:touch]",
                step === "confirm" && !whatsappVerified ? "pb-4 pt-1" : "pb-8"
              )
        )}
      >
        {step === "professional" && (
          <div className="grid auto-rows-fr grid-cols-2 content-start gap-2">
            <button
              type="button"
              onClick={() => selectProfessional(NO_PREFERENCE_ID)}
              className={cn(
                "flex h-full min-h-[8.25rem] flex-col items-center justify-center gap-1.5 rounded-2xl px-2 py-2.5 text-center transition-colors ring-1",
                anyPreference
                  ? "bg-primary/10 ring-primary/50"
                  : "bg-[#151618] ring-white/8"
              )}
            >
              <div
                className={cn(
                  "flex size-14 shrink-0 items-center justify-center rounded-full",
                  anyPreference
                    ? "bg-primary text-primary-foreground"
                    : "bg-white/10"
                )}
              >
                <Users className="size-6" strokeWidth={1.5} />
              </div>
              <span className="line-clamp-1 max-w-full px-0.5 text-[0.9375rem] font-semibold leading-tight">
                Qualquer
              </span>
              <span className="px-0.5 text-[10px] leading-tight text-muted-foreground">
                Melhor horário
              </span>
            </button>

            {professionals.map((pro) => {
              const selected = professionalId === pro.id;
              return (
                <button
                  key={pro.id}
                  type="button"
                  onClick={() => selectProfessional(pro.id)}
                  className={cn(
                    "flex h-full min-h-[8.25rem] flex-col items-center justify-center gap-1.5 rounded-2xl px-2 py-2.5 text-center transition-colors ring-1",
                    selected
                      ? "bg-primary/10 ring-primary/50"
                      : "bg-[#151618] ring-white/8"
                  )}
                >
                  <div className="relative shrink-0">
                    <ProfessionalAvatar
                      photoUrl={pro.photoUrl}
                      photoPosition={pro.photoPosition}
                      name={pro.nickname}
                      size="lg"
                      className="!size-14 border-white/10"
                    />
                    {selected ? (
                      <span className="absolute -bottom-0.5 -right-0.5 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground ring-2 ring-[#151618]">
                        <Check className="size-3" strokeWidth={2.5} />
                      </span>
                    ) : null}
                  </div>
                  <span className="line-clamp-1 max-w-full px-0.5 text-[0.9375rem] font-semibold leading-tight">
                    {pro.nickname}
                  </span>
                  <span
                    className="px-0.5 text-[10px] leading-tight text-transparent"
                    aria-hidden
                  >
                    Melhor horário
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {step === "services" && (
          <div className="flex flex-col gap-4">
            {availableServices.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Esse barbeiro ainda não tem serviços disponíveis.
              </p>
            ) : (
              <>
                <SelectedServiceChips
                  services={selectedServices}
                  onRemove={(id) => toggleService(id, false)}
                />

                {availableServices.length > 6 && (
                  <SearchInput
                    value={serviceSearch}
                    onChange={setServiceSearch}
                    placeholder="Buscar serviço..."
                  />
                )}

                {serviceGroups.popular.length > 0 && (
                  <section className="flex flex-col gap-2.5">
                    <p className="text-[11px] font-medium tracking-wide text-muted-foreground">
                      Mais pedidos
                    </p>
                    <div className="flex flex-col gap-2">
                      {serviceGroups.popular.map((svc) => (
                        <ServicePickerRow
                          key={svc.id}
                          service={svc}
                          checked={serviceIds.includes(svc.id)}
                          onToggle={(checked) => toggleService(svc.id, checked)}
                        />
                      ))}
                    </div>
                  </section>
                )}

                {serviceGroups.others.length > 0 && (
                  <section className="flex flex-col gap-2.5">
                    {serviceGroups.popular.length > 0 ? (
                      <p className="text-[11px] font-medium tracking-wide text-muted-foreground">
                        Todos os serviços
                      </p>
                    ) : null}
                    <div className="flex flex-col gap-2">
                      {serviceGroups.others.map((svc) => (
                        <ServicePickerRow
                          key={svc.id}
                          service={svc}
                          checked={serviceIds.includes(svc.id)}
                          onToggle={(checked) => toggleService(svc.id, checked)}
                        />
                      ))}
                    </div>
                  </section>
                )}

                {serviceSearch.trim() &&
                serviceGroups.popular.length === 0 &&
                serviceGroups.others.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    Nenhum serviço com esse nome.
                  </p>
                ) : null}
              </>
            )}
          </div>
        )}

        {step === "datetime" && (
          <div className="flex flex-col gap-4">
            <BookingDatePicker
              selectedDate={date}
              today={today}
              minDate={minDate}
              maxDate={maxDate}
              onSelectDate={(next) => {
                setDate(next);
                setStartTime(null);
              }}
            />

            {loadingSlots ? (
              <SlotGridSkeleton />
            ) : slotsError ? (
              <p className="rounded-2xl bg-white/[0.04] px-4 py-6 text-center text-sm text-muted-foreground">
                {slotsError}
              </p>
            ) : (
              <SlotGroups
                slots={availableSlots}
                selected={startTime}
                onSelect={setStartTime}
              />
            )}
          </div>
        )}

        {step === "confirm" && (
          <div className="flex flex-col gap-4">
            {!whatsappVerified ? (
              <ClientWhatsappAuth
              shopSlug={shopSlug}
                onAuthenticated={handleWhatsappAuthenticated}
                hint="Informe seu WhatsApp pra confirmar o horário. Se já tiver cadastro, usamos seus dados."
              />
            ) : (
              <>
                {lookupLoading ? (
                  <div className="rounded-2xl bg-[#151618] px-4 py-4 ring-1 ring-white/8">
                    <p className="text-sm text-muted-foreground">
                      Buscando seu cadastro...
                    </p>
                  </div>
                ) : null}

                {customerFound && firstName.trim() && lastName.trim() ? (
                  <div className="rounded-2xl bg-[#151618] px-4 py-4 ring-1 ring-white/8">
                    <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                      Cliente
                    </p>
                    <p className="mt-2 text-base font-semibold tracking-tight">
                      {[firstName, lastName].filter(Boolean).join(" ")}
                    </p>
                    <p className="mt-1 text-sm tabular-nums text-muted-foreground">
                      {formatWhatsapp(whatsapp)}
                    </p>
                    <div className="mt-4 border-t border-white/8 pt-3">
                      <p className="text-xs text-muted-foreground">
                        Não é você?{" "}
                        <button
                          type="button"
                          onClick={() => void handleNotMe()}
                          className="font-medium text-foreground/80 underline-offset-2 hover:text-foreground hover:underline"
                        >
                          Usar outro WhatsApp
                        </button>
                      </p>
                    </div>
                  </div>
                ) : null}

                {lookupDone &&
                !(customerFound && firstName.trim() && lastName.trim()) ? (
                  <div className="rounded-2xl bg-[#151618] px-4 py-4 ring-1 ring-white/8">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                          WhatsApp
                        </p>
                        <p className="mt-1.5 text-[0.95rem] font-semibold tabular-nums">
                          {formatWhatsapp(whatsapp)}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleNotMe()}
                        className="shrink-0 pt-0.5 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                      >
                        Trocar
                      </button>
                    </div>

                    <div className="my-4 h-px bg-white/8" />

                    <p className="text-xs leading-relaxed text-muted-foreground">
                      {customerFound
                        ? "Complete seu nome e sobrenome pra finalizar."
                        : "Primeiro agendamento neste número. Informe nome e sobrenome."}
                    </p>

                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="bookingFirstName" className="text-xs">
                          Nome
                        </Label>
                        <Input
                          id="bookingFirstName"
                          value={firstName}
                          onChange={(e) => setFirstName(e.target.value)}
                          autoComplete="given-name"
                          className="h-12 rounded-xl border-white/10 bg-[#0e0f11]"
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="bookingLastName" className="text-xs">
                          Sobrenome
                        </Label>
                        <Input
                          id="bookingLastName"
                          value={lastName}
                          onChange={(e) => setLastName(e.target.value)}
                          autoComplete="family-name"
                          className="h-12 rounded-xl border-white/10 bg-[#0e0f11]"
                        />
                      </div>
                    </div>
                  </div>
                ) : null}
              </>
            )}
          </div>
        )}
      </div>

      <div className="relative shrink-0 px-5 pb-3 pt-1">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 -top-6 h-6 bg-gradient-to-t from-[#0e0f11] to-transparent"
        />
        <div className="flex items-center gap-2">
          {step !== "professional" ? (
            <Button
              type="button"
              variant="ghost"
              size="lg"
              onClick={goBack}
              className="h-12 shrink-0 rounded-2xl px-3 text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="size-4" />
              Voltar
            </Button>
          ) : null}
          {step === "confirm" && !whatsappVerified ? null : (
            <Button
              type="button"
              size="lg"
              disabled={primaryDisabled}
              onClick={() => {
                if (step === "confirm") void handleConfirm();
                else goNext();
              }}
              className="h-12 min-w-0 flex-1 rounded-2xl text-[0.95rem] font-semibold shadow-none"
            >
              {primaryLabel}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
