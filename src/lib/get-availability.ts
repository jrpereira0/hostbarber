// Busca os dados no banco e calcula os horários livres de um
// profissional numa data, pra um conjunto de serviços.
// Usado pela API pública, pelo site do cliente e pela agenda do admin.
import { createAdminClient } from "@/lib/supabase/admin";
import {
  BOOKING_LEAD_MINUTES,
  SLOT_STEP_MINUTES,
  computeSlots,
  minutesToTime,
  nowMinutesInTimezone,
  resolveDayRanges,
  timeToMinutes,
  todayInTimezone,
  weekdayOf,
  type DayException,
  type MinuteRange,
} from "@/lib/availability";
import { ACTIVE_APPOINTMENT_STATUSES } from "@/lib/appointment-status";
import {
  sumDurationForServiceIds,
  uniqueServiceIds,
} from "@/lib/appointment-service-quantities";

export type UnavailableReason =
  | "shop_closed"
  | "professional_day_off"
  | "service_unavailable_on_date"
  | "no_slots"
  | null;

export type WorkingPeriod = { startTime: string; endTime: string };

export type AvailabilityOk = {
  ok: true;
  professionalId: string;
  date: string;
  durationMinutes: number;
  totalPriceCents: number;
  /** Horários de início disponíveis: ["09:00", "09:15", ...]. Vazio quando indisponível. */
  slots: string[];
  /** true quando há pelo menos um horário livre. */
  available: boolean;
  /** Motivo quando available = false; null quando há horários. */
  unavailableReason: UnavailableReason;
  /** Mensagem legível para exibir ao usuário ou enviar via IA. */
  message: string | null;
  /** O profissional está de folga nesta data (após aplicar exceções). */
  professionalDayOff: boolean;
  /** A barbearia está fechada nesta data (após aplicar exceções). */
  shopClosed: boolean;
  /** Faixas em que o profissional trabalha (antes de remover horários ocupados). */
  workingPeriods: WorkingPeriod[];
};

export type AvailabilityError = { ok: false; error: string; status: number };

export type AvailabilityResult = AvailabilityOk | AvailabilityError;

export const MAX_DAYS_AHEAD = 60;

export type GetAvailabilityOptions = {
  /** Edição no painel: ignora antecedência mínima e limite de data passada. */
  adminEdit?: boolean;
  /** Dono: qualquer horário do dia; só remove slots com outro agendamento (não encaixe). */
  ownerFreeSchedule?: boolean;
};

function toDayException(e: {
  kind: string;
  start_time: string | null;
  end_time: string | null;
}): DayException {
  return {
    kind: e.kind as "closed" | "custom",
    range:
      e.kind === "custom" && e.start_time && e.end_time
        ? {
            start: timeToMinutes(e.start_time),
            end: timeToMinutes(e.end_time),
          }
        : null,
  };
}

/** Retorna true se a barbearia está fechada nesta data (após exceções). */
function computeIsShopClosed(
  businessDay: { active: boolean; range: MinuteRange } | null,
  shopException: DayException | null
): boolean {
  if (shopException) return shopException.kind === "closed";
  return !(businessDay?.active);
}

/** Retorna true se o profissional está de folga (após exceções). Só chamar se a barbearia estiver aberta. */
function computeIsProfessionalDayOff(
  weeklyRanges: MinuteRange[],
  professionalException: DayException | null
): boolean {
  if (professionalException) {
    return professionalException.kind === "closed" || !professionalException.range;
  }
  return weeklyRanges.length === 0;
}

/** Monta um AvailabilityOk sem slots e com motivo de indisponibilidade. */
function unavailableResult(
  professionalId: string,
  date: string,
  durationMinutes: number,
  totalPriceCents: number,
  unavailableReason: NonNullable<UnavailableReason>,
  message: string,
  shopClosed: boolean,
  professionalDayOff: boolean
): AvailabilityOk {
  return {
    ok: true,
    professionalId,
    date,
    durationMinutes,
    totalPriceCents,
    slots: [],
    available: false,
    unavailableReason,
    message,
    professionalDayOff,
    shopClosed,
    workingPeriods: [],
  };
}

export async function getAvailability(
  professionalId: string,
  date: string,
  serviceIds: string[],
  excludeAppointmentId?: string,
  options: GetAvailabilityOptions = {}
): Promise<AvailabilityResult> {
  const { adminEdit = false, ownerFreeSchedule = false } = options;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { ok: false, error: "Data inválida. Use o formato AAAA-MM-DD.", status: 400 };
  }
  if (serviceIds.length === 0) {
    return { ok: false, error: "Escolha pelo menos um serviço.", status: 400 };
  }

  const today = todayInTimezone();
  if (!adminEdit && date < today) {
    return { ok: false, error: "Essa data já passou.", status: 400 };
  }

  if (!adminEdit) {
    const maxDate = new Date(`${today}T00:00:00Z`);
    maxDate.setUTCDate(maxDate.getUTCDate() + MAX_DAYS_AHEAD);
    if (date > maxDate.toISOString().slice(0, 10)) {
      return {
        ok: false,
        error: `Só é possível agendar até ${MAX_DAYS_AHEAD} dias pra frente.`,
        status: 400,
      };
    }
  }

  const weekday = weekdayOf(date);
  const uniqueIds = uniqueServiceIds(serviceIds);
  const admin = createAdminClient();
  if (!admin) {
    return { ok: false, error: "Sistema indisponível no momento.", status: 503 };
  }

  const { data: professional } = await admin
    .from("professionals")
    .select("id, active, shop_id")
    .eq("id", professionalId)
    .maybeSingle();

  if (!professional || !professional.active || !professional.shop_id) {
    return { ok: false, error: "Profissional não encontrado.", status: 404 };
  }

  const shopId = professional.shop_id as string;

  const [
    { data: services },
    { data: weekdayPriceRows },
    { data: links },
    { data: businessDay },
    { data: workingHours },
    { data: exceptions },
    { data: appointments },
    { data: scheduleBlocks },
    { data: settings },
  ] = await Promise.all([
    admin
      .from("services")
      .select("id, name, active, duration_minutes, price_cents")
      .eq("shop_id", shopId)
      .in("id", uniqueIds),
    admin
      .from("service_weekday_prices")
      .select("service_id, weekday, price_cents")
      .in("service_id", uniqueIds)
      .eq("weekday", weekday),
    admin
      .from("professional_services")
      .select("service_id")
      .eq("professional_id", professionalId)
      .in("service_id", uniqueIds),
    admin
      .from("business_hours")
      .select("active, open_time, close_time")
      .eq("shop_id", shopId)
      .eq("weekday", weekday)
      .maybeSingle(),
    admin
      .from("working_hours")
      .select("start_time, end_time")
      .eq("professional_id", professionalId)
      .eq("weekday", weekday),
    admin
      .from("schedule_exceptions")
      .select("professional_id, kind, start_time, end_time")
      .eq("shop_id", shopId)
      .eq("date", date),
    admin
      .from("appointments")
      .select("id, start_time, end_time")
      .eq("shop_id", shopId)
      .eq("professional_id", professionalId)
      .eq("date", date)
      .in("status", [...ACTIVE_APPOINTMENT_STATUSES])
      .eq("is_squeeze_in", false),
    admin
      .from("schedule_blocks")
      .select("start_time, end_time")
      .eq("shop_id", shopId)
      .eq("professional_id", professionalId)
      .eq("date", date),
    admin
      .from("shops")
      .select("slot_step_minutes")
      .eq("id", shopId)
      .maybeSingle(),
  ]);

  const foundServices = services ?? [];
  if (
    foundServices.length !== uniqueIds.length ||
    foundServices.some((s) => !s.active)
  ) {
    return { ok: false, error: "Serviço não encontrado.", status: 404 };
  }

  const linkedIds = new Set((links ?? []).map((l) => l.service_id));
  if (!serviceIds.every((id) => linkedIds.has(id))) {
    return {
      ok: false,
      error: "Esse profissional não faz um dos serviços escolhidos.",
      status: 400,
    };
  }

  // Resolve exceções e calcula shopClosed / professionalDayOff antes dos slots.
  // Isso garante que "folga" e "barbearia fechada" não sejam confundidos com
  // "agenda cheia" mais tarde.
  const shopExceptionRaw =
    (exceptions ?? []).find((e) => e.professional_id === null) ?? null;
  const professionalExceptionRaw =
    (exceptions ?? []).find((e) => e.professional_id === professionalId) ??
    null;
  const shopException = shopExceptionRaw
    ? toDayException(shopExceptionRaw)
    : null;
  const professionalException = professionalExceptionRaw
    ? toDayException(professionalExceptionRaw)
    : null;

  const businessDayResolved = businessDay
    ? {
        active: businessDay.active,
        range: {
          start: timeToMinutes(businessDay.open_time),
          end: timeToMinutes(businessDay.close_time),
        },
      }
    : null;

  const weeklyRanges = (workingHours ?? []).map((w) => ({
    start: timeToMinutes(w.start_time),
    end: timeToMinutes(w.end_time),
  }));

  const isShopClosed = computeIsShopClosed(businessDayResolved, shopException);
  const isProfessionalDayOff =
    !isShopClosed &&
    computeIsProfessionalDayOff(weeklyRanges, professionalException);

  const durationById = new Map(
    foundServices.map((s) => [s.id, s.duration_minutes])
  );
  const durationMinutes = sumDurationForServiceIds(serviceIds, durationById);

  // Verifica disponibilidade por dia da semana ANTES de calcular preços totais,
  // pois alguns serviços podem não ter preço configurado nesse dia.
  const priceByServiceId = new Map(
    (weekdayPriceRows ?? []).map((row) => [row.service_id, row.price_cents])
  );

  for (const service of foundServices) {
    if (!priceByServiceId.has(service.id)) {
      return unavailableResult(
        professionalId,
        date,
        durationMinutes,
        0,
        "service_unavailable_on_date",
        `"${service.name}" não está disponível neste dia da semana.`,
        isShopClosed,
        isProfessionalDayOff
      );
    }
  }

  const totalPriceCents = serviceIds.reduce((sum, id) => {
    const service = foundServices.find((s) => s.id === id);
    if (!service) return sum;
    return sum + (priceByServiceId.get(id) ?? service.price_cents);
  }, 0);

  const ranges = ownerFreeSchedule
    ? [{ start: 0, end: 24 * 60 }]
    : resolveDayRanges({
        businessDay: businessDayResolved,
        shopException,
        weeklyRanges,
        professionalException,
      });

  const workingPeriods: WorkingPeriod[] = ranges.map((r) => ({
    startTime: minutesToTime(r.start),
    endTime: minutesToTime(r.end),
  }));

  const busy: MinuteRange[] = [
    ...(appointments ?? [])
      .filter((a) => a.id !== excludeAppointmentId)
      .map((a) => ({
        start: timeToMinutes(a.start_time),
        end: timeToMinutes(a.end_time),
      })),
    ...(ownerFreeSchedule
      ? []
      : (scheduleBlocks ?? []).map((b) => ({
          start: timeToMinutes(b.start_time),
          end: timeToMinutes(b.end_time),
        }))),
  ];

  const stepMinutes = settings?.slot_step_minutes ?? SLOT_STEP_MINUTES;

  // Reserva online: hoje só a partir de agora + antecedência mínima.
  let minStart: number | null = null;
  if (!adminEdit && date === today) {
    const earliest = nowMinutesInTimezone() + BOOKING_LEAD_MINUTES;
    minStart = Math.ceil(earliest / stepMinutes) * stepMinutes;
  }

  const slotMinutes = computeSlots({
    ranges,
    busy,
    durationMinutes,
    stepMinutes,
    minStart,
  });

  const slots = slotMinutes.map(minutesToTime);

  // Determina o motivo de indisponibilidade, na ordem de prioridade certa:
  // 1. barbearia fechada  2. profissional de folga  3. sem horários livres
  let unavailableReason: UnavailableReason = null;
  let message: string | null = null;
  if (isShopClosed) {
    unavailableReason = "shop_closed";
    message = "A barbearia está fechada nessa data.";
  } else if (isProfessionalDayOff) {
    unavailableReason = "professional_day_off";
    message = "Profissional de folga nessa data.";
  } else if (slots.length === 0) {
    unavailableReason = "no_slots";
    message = "Não há horários disponíveis para esse profissional nessa data.";
  }

  return {
    ok: true,
    professionalId,
    date,
    durationMinutes,
    totalPriceCents,
    slots,
    available: slots.length > 0,
    unavailableReason,
    message,
    professionalDayOff: isProfessionalDayOff,
    shopClosed: isShopClosed,
    workingPeriods,
  };
}

export type ValidateAdminSlotOptions = {
  /** Dono: ignora bloqueios manuais na agenda. */
  skipScheduleBlocks?: boolean;
  excludeAppointmentId?: string;
};

/** Valida horário na edição do painel: conflito com outro agendamento (e bloqueio, se aplicável). */
export async function validateAdminAppointmentSlot(
  professionalId: string,
  date: string,
  startTime: string,
  durationMinutes: number,
  excludeAppointmentId = "",
  options: ValidateAdminSlotOptions = {}
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { skipScheduleBlocks = false } = options;
  const start = timeToMinutes(startTime);
  const end = start + durationMinutes;

  if (end > 24 * 60) {
    return {
      ok: false,
      error:
        "O horário de término passa da meia-noite. Escolha um início mais cedo.",
    };
  }

  const admin = createAdminClient();
  if (!admin) {
    return { ok: false, error: "Horário indisponível no momento." };
  }

  const [{ data: appointments }, { data: scheduleBlocks }] = await Promise.all([
    admin
      .from("appointments")
      .select("id, start_time, end_time")
      .eq("professional_id", professionalId)
      .eq("date", date)
      .in("status", [...ACTIVE_APPOINTMENT_STATUSES])
      .eq("is_squeeze_in", false),
    admin
      .from("schedule_blocks")
      .select("start_time, end_time")
      .eq("professional_id", professionalId)
      .eq("date", date),
  ]);

  for (const appointment of appointments ?? []) {
    if (appointment.id === excludeAppointmentId) continue;
    const aStart = timeToMinutes(appointment.start_time);
    const aEnd = timeToMinutes(appointment.end_time);
    if (start < aEnd && end > aStart) {
      return {
        ok: false,
        error: "Esse horário já está ocupado por outro agendamento.",
      };
    }
  }

  if (!skipScheduleBlocks) {
    for (const block of scheduleBlocks ?? []) {
      const bStart = timeToMinutes(block.start_time);
      const bEnd = timeToMinutes(block.end_time);
      if (start < bEnd && end > bStart) {
        return {
          ok: false,
          error: "Esse horário está bloqueado na agenda desse barbeiro.",
        };
      }
    }
  }

  return { ok: true };
}
