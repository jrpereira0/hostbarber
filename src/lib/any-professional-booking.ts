import { createAdminClient } from "@/lib/supabase/admin";
import { ACTIVE_APPOINTMENT_STATUSES } from "@/lib/appointment-status";
import {
  getAvailability,
  type AvailabilityResult,
} from "@/lib/get-availability";

export type EligibleProfessional = {
  id: string;
  nickname: string;
};

/** Profissionais ativos que fazem todos os serviços pedidos. */
export async function listEligibleProfessionals(
  serviceIds: string[],
  shopId: string
): Promise<
  | { ok: true; professionals: EligibleProfessional[] }
  | { ok: false; error: string; status: number }
> {
  if (serviceIds.length === 0) {
    return {
      ok: false,
      error: "Escolha pelo menos um serviço.",
      status: 400,
    };
  }
  if (!shopId.trim()) {
    return {
      ok: false,
      error: "Barbearia não encontrada.",
      status: 400,
    };
  }

  const admin = createAdminClient();
  if (!admin) {
    return { ok: false, error: "Sistema indisponível no momento.", status: 503 };
  }

  const { data: pros, error } = await admin
    .from("professionals")
    .select("id, nickname, professional_services ( service_id )")
    .eq("shop_id", shopId)
    .eq("active", true)
    .order("nickname");

  if (error) {
    return {
      ok: false,
      error: "Não foi possível carregar os barbeiros.",
      status: 500,
    };
  }

  const needed = new Set(serviceIds);
  const professionals: EligibleProfessional[] = [];

  for (const pro of pros ?? []) {
    const links = Array.isArray(pro.professional_services)
      ? pro.professional_services
      : pro.professional_services
        ? [pro.professional_services]
        : [];
    const offered = new Set(
      links.map((link: { service_id: string }) => link.service_id)
    );
    if (![...needed].every((id) => offered.has(id))) continue;
    professionals.push({
      id: pro.id as string,
      nickname: (pro.nickname as string) ?? "—",
    });
  }

  return { ok: true, professionals };
}

/** Quantidade de horários ativos (não encaixe) por barbeiro no dia. */
export async function countDayAppointmentsByProfessional(
  date: string,
  professionalIds: string[]
): Promise<Map<string, number>> {
  const counts = new Map(professionalIds.map((id) => [id, 0]));
  if (professionalIds.length === 0) return counts;

  const admin = createAdminClient();
  if (!admin) return counts;

  const { data } = await admin
    .from("appointments")
    .select("professional_id")
    .eq("date", date)
    .eq("is_squeeze_in", false)
    .in("status", [...ACTIVE_APPOINTMENT_STATUSES])
    .in("professional_id", professionalIds);

  for (const row of data ?? []) {
    const id = row.professional_id as string;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }

  return counts;
}

/**
 * União dos horários livres de todos os barbeiros que fazem os serviços.
 * Usado quando o cliente escolhe "Sem preferência".
 */
export async function getAnyProfessionalAvailability(
  date: string,
  serviceIds: string[],
  options?: { excludeAppointmentId?: string; shopId: string }
): Promise<AvailabilityResult> {
  const shopId = options?.shopId ?? "";
  const eligible = await listEligibleProfessionals(serviceIds, shopId);
  if (!eligible.ok) return eligible;

  if (eligible.professionals.length === 0) {
    return {
      ok: false,
      error: "Nenhum barbeiro faz todos os serviços escolhidos.",
      status: 400,
    };
  }

  const results = await Promise.all(
    eligible.professionals.map((pro) =>
      getAvailability(
        pro.id,
        date,
        serviceIds,
        options?.excludeAppointmentId
      )
    )
  );

  const okResults = results.filter((r): r is Extract<AvailabilityResult, { ok: true }> => r.ok);

  if (okResults.length === 0) {
    const firstError = results.find((r) => !r.ok);
    if (firstError && !firstError.ok) return firstError;
    return {
      ok: false,
      error: "Não foi possível carregar os horários.",
      status: 500,
    };
  }

  const slotSet = new Set<string>();
  for (const result of okResults) {
    for (const slot of result.slots) slotSet.add(slot);
  }
  const slots = [...slotSet].sort();

  const sample = okResults[0];
  const shopClosed = okResults.every((r) => r.shopClosed);
  const allDayOff = okResults.every((r) => r.professionalDayOff || r.shopClosed);

  let unavailableReason = sample.unavailableReason;
  let message = sample.message;

  if (slots.length > 0) {
    unavailableReason = null;
    message = null;
  } else if (shopClosed) {
    unavailableReason = "shop_closed";
    message = "A barbearia está fechada neste dia.";
  } else if (allDayOff) {
    unavailableReason = "professional_day_off";
    message = "Nenhum barbeiro disponível neste dia para esses serviços.";
  } else {
    unavailableReason = "no_slots";
    message = "Nenhum horário livre neste dia para esses serviços.";
  }

  return {
    ok: true,
    professionalId: sample.professionalId,
    date,
    durationMinutes: sample.durationMinutes,
    totalPriceCents: sample.totalPriceCents,
    slots,
    available: slots.length > 0,
    unavailableReason,
    message,
    professionalDayOff: allDayOff && !shopClosed,
    shopClosed,
    workingPeriods: sample.workingPeriods,
  };
}

/**
 * Entre os barbeiros livres no horário, escolhe o com menos agendamentos no dia.
 * Empate: ordem alfabética do apelido (estável).
 */
export async function pickLeastBusyProfessionalForSlot(
  date: string,
  startTime: string,
  serviceIds: string[],
  options: { excludeProfessionalIds?: string[]; shopId: string }
): Promise<
  | {
      ok: true;
      professionalId: string;
      nickname: string;
      durationMinutes: number;
    }
  | { ok: false; error: string; status: number }
> {
  const eligible = await listEligibleProfessionals(serviceIds, options.shopId);
  if (!eligible.ok) return eligible;

  const excluded = new Set(options.excludeProfessionalIds ?? []);
  const candidates = eligible.professionals.filter((p) => !excluded.has(p.id));

  if (candidates.length === 0) {
    return {
      ok: false,
      error: "Nenhum barbeiro disponível para esses serviços.",
      status: 409,
    };
  }

  const availabilities = await Promise.all(
    candidates.map(async (pro) => {
      const result = await getAvailability(pro.id, date, serviceIds);
      return { pro, result };
    })
  );

  const free = availabilities.filter(
    ({ result }) => result.ok && result.slots.includes(startTime)
  );

  if (free.length === 0) {
    return {
      ok: false,
      error: "Esse horário não está mais disponível. Escolha outro.",
      status: 409,
    };
  }

  const counts = await countDayAppointmentsByProfessional(
    date,
    free.map(({ pro }) => pro.id)
  );

  free.sort((a, b) => {
    const countDiff =
      (counts.get(a.pro.id) ?? 0) - (counts.get(b.pro.id) ?? 0);
    if (countDiff !== 0) return countDiff;
    return a.pro.nickname.localeCompare(b.pro.nickname, "pt-BR");
  });

  const winner = free[0];
  if (!winner.result.ok) {
    return {
      ok: false,
      error: "Não foi possível confirmar o horário.",
      status: 500,
    };
  }

  return {
    ok: true,
    professionalId: winner.pro.id,
    nickname: winner.pro.nickname,
    durationMinutes: winner.result.durationMinutes,
  };
}
