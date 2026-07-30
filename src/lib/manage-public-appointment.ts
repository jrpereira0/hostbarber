import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  minutesToTime,
  nowMinutesInTimezone,
  timeToMinutes,
  todayInTimezone,
} from "@/lib/availability";
import { formatTime } from "@/lib/format";
import { getAvailability } from "@/lib/get-availability";
import { ACTIVE_APPOINTMENT_STATUSES } from "@/lib/appointment-status";
import {
  loadServicePricingContext,
  resolvePriceCentsOrFallback,
} from "@/lib/service-prices-for-date";
import {
  normalizeWhatsapp,
  WHATSAPP_INVALID_MESSAGE,
  whatsappLookupKeys,
  whatsappMatches,
  whatsappSchema,
} from "@/lib/whatsapp";

const updateSchema = z.object({
  whatsapp: whatsappSchema,
  professionalId: z.uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  serviceIds: z.array(z.uuid()).min(1, "Escolha pelo menos um serviço."),
});

export type PublicAppointmentItem = {
  id: string;
  professionalId: string;
  professionalName: string;
  professionalPhotoUrl: string | null;
  date: string;
  startTime: string;
  status: string;
  serviceIds: string[];
  serviceNames: string[];
  totalMinutes: number;
  totalPriceCents: number;
};

export const LIST_APPOINTMENTS_MODES = [
  "upcoming",
  "history",
  "all",
] as const;

export type ListAppointmentsMode = (typeof LIST_APPOINTMENTS_MODES)[number];

const LIST_ALL_DEFAULT_LIMIT = 50;

export type LastCompletedAppointment = {
  appointmentId: string;
  professionalId: string;
  professionalName: string;
  date: string;
  startTime: string;
  serviceIds: string[];
  serviceNames: string[];
};

type Result<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; status: number };

type AppointmentServiceLink = {
  service_id: string;
  services:
    | { name: string; duration_minutes: number; price_cents: number }
    | { name: string; duration_minutes: number; price_cents: number }[]
    | null;
};

function sumAppointmentServicesPrice(
  links: AppointmentServiceLink[],
  pricing: Awaited<ReturnType<typeof loadServicePricingContext>>
): number {
  let totalPriceCents = 0;

  for (const link of links) {
    const svc = link.services;
    const service = Array.isArray(svc) ? svc[0] : svc;
    if (!service) continue;
    totalPriceCents += resolvePriceCentsOrFallback(
      {
        id: link.service_id,
        name: service.name,
        price_cents: service.price_cents,
      },
      pricing
    );
  }

  return totalPriceCents;
}

function mapAppointmentServices(
  links: AppointmentServiceLink[],
  pricing: Awaited<ReturnType<typeof loadServicePricingContext>>
): {
  serviceIds: string[];
  serviceNames: string[];
  totalMinutes: number;
  totalPriceCents: number;
} {
  const serviceIds: string[] = [];
  const serviceNames: string[] = [];
  let totalMinutes = 0;

  for (const link of links) {
    serviceIds.push(link.service_id);
    const svc = link.services;
    const service = Array.isArray(svc) ? svc[0] : svc;
    if (!service) continue;
    serviceNames.push(service.name);
    totalMinutes += service.duration_minutes;
  }

  return {
    serviceIds,
    serviceNames,
    totalMinutes,
    totalPriceCents: sumAppointmentServicesPrice(links, pricing),
  };
}

function isUpcoming(date: string, startTime: string): boolean {
  const today = todayInTimezone();
  if (date > today) return true;
  if (date < today) return false;
  return timeToMinutes(startTime) > nowMinutesInTimezone();
}

async function loadOwnedAppointment(
  appointmentId: string,
  whatsapp: string,
  shopId: string
): Promise<
  | {
      id: string;
      professional_id: string;
      date: string;
      start_time: string;
      status: string;
      is_squeeze_in: boolean;
      customer_whatsapp: string;
    }
  | null
> {
  const admin = createAdminClient();
  if (!admin) return null;

  const { data } = await admin
    .from("appointments")
    .select(
      "id, professional_id, date, start_time, status, is_squeeze_in, customer_whatsapp"
    )
    .eq("id", appointmentId)
    .eq("shop_id", shopId)
    .maybeSingle();

  if (!data) return null;
  if (!whatsappMatches(data.customer_whatsapp, whatsapp)) return null;
  if (!(ACTIVE_APPOINTMENT_STATUSES as readonly string[]).includes(data.status)) {
    return null;
  }
  if (data.is_squeeze_in) return null;

  return data;
}

export async function listPublicAppointmentsByWhatsapp(
  rawWhatsapp: string,
  options: { mode?: ListAppointmentsMode; limit?: number; shopId: string }
): Promise<
  Result<{ mode: ListAppointmentsMode; appointments: PublicAppointmentItem[] }>
> {
  const mode = options?.mode ?? "upcoming";
  const limit = Math.min(
    Math.max(options?.limit ?? LIST_ALL_DEFAULT_LIMIT, 1),
    100
  );

  const whatsapp = normalizeWhatsapp(rawWhatsapp);
  if (!whatsapp) {
    return { ok: false, error: WHATSAPP_INVALID_MESSAGE, status: 400 };
  }
  if (!options.shopId.trim()) {
    return { ok: false, error: "Barbearia não encontrada.", status: 400 };
  }

  const admin = createAdminClient();
  if (!admin) {
    return { ok: false, error: "Sistema indisponível no momento.", status: 503 };
  }

  const today = todayInTimezone();

  let query = admin
    .from("appointments")
    .select(
      `
      id,
      professional_id,
      date,
      start_time,
      status,
      is_squeeze_in,
      professionals (nickname, photo_url),
      appointment_services (
        service_id,
        services (name, duration_minutes, price_cents)
      )
    `
    )
    .eq("shop_id", options.shopId)
    .in("customer_whatsapp", whatsappLookupKeys(whatsapp))
    .eq("is_squeeze_in", false);

  if (mode === "upcoming") {
    query = query
      .in("status", [...ACTIVE_APPOINTMENT_STATUSES])
      .gte("date", today)
      .order("date")
      .order("start_time");
  } else if (mode === "history") {
    query = query
      .order("date", { ascending: false })
      .order("start_time", { ascending: false })
      .limit(limit);
  } else {
    query = query
      .order("date", { ascending: false })
      .order("start_time", { ascending: false })
      .limit(limit);
  }

  const { data: rows, error } = await query;

  if (error) {
    return {
      ok: false,
      error: "Não foi possível buscar seus agendamentos.",
      status: 500,
    };
  }

  const pricingByDate = new Map<
    string,
    Awaited<ReturnType<typeof loadServicePricingContext>>
  >();
  const uniqueDates = [...new Set((rows ?? []).map((row) => row.date))];
  const serviceIds = [
    ...new Set(
      (rows ?? []).flatMap((row) =>
        ((row.appointment_services ?? []) as AppointmentServiceLink[]).map(
          (link) => link.service_id
        )
      )
    ),
  ];

  for (const appointmentDate of uniqueDates) {
    pricingByDate.set(
      appointmentDate,
      await loadServicePricingContext(admin, appointmentDate, serviceIds)
    );
  }

  const appointments = (rows ?? [])
    .map((row) => {
      const startTime = formatTime(row.start_time);
      const upcoming = isUpcoming(row.date, startTime);
      const active = (ACTIVE_APPOINTMENT_STATUSES as readonly string[]).includes(
        row.status
      );

      if (mode === "upcoming") {
        if (!upcoming || !active) return null;
      } else if (mode === "history") {
        // Passados, cancelados ou concluídos — não lista futuros ativos.
        if (upcoming && active) return null;
      }

      const pro = row.professionals as
        | {
            nickname: string;
            photo_url: string | null;
          }
        | {
            nickname: string;
            photo_url: string | null;
          }[]
        | null;
      const professional = Array.isArray(pro) ? pro[0] : pro;

      const links = (row.appointment_services ?? []) as AppointmentServiceLink[];
      const pricing = pricingByDate.get(row.date);
      if (!pricing) return null;

      const mapped = mapAppointmentServices(links, pricing);

      return {
        id: row.id,
        professionalId: row.professional_id,
        professionalName: professional?.nickname ?? "Barbeiro",
        professionalPhotoUrl: professional?.photo_url ?? null,
        date: row.date,
        startTime,
        status: row.status,
        serviceIds: mapped.serviceIds,
        serviceNames: mapped.serviceNames,
        totalMinutes: mapped.totalMinutes,
        totalPriceCents: mapped.totalPriceCents,
      };
    })
    .filter((item): item is PublicAppointmentItem => item !== null);

  return { ok: true, data: { mode, appointments } };
}

export async function getLastCompletedAppointmentByWhatsapp(
  rawWhatsapp: string,
  shopId: string
): Promise<Result<LastCompletedAppointment | null>> {
  const whatsapp = normalizeWhatsapp(rawWhatsapp);
  if (!whatsapp) {
    return { ok: false, error: WHATSAPP_INVALID_MESSAGE, status: 400 };
  }
  if (!shopId.trim()) {
    return { ok: false, error: "Barbearia não encontrada.", status: 400 };
  }

  const admin = createAdminClient();
  if (!admin) {
    return { ok: false, error: "Sistema indisponível no momento.", status: 503 };
  }

  const { data: row, error } = await admin
    .from("appointments")
    .select(
      `
      id,
      professional_id,
      date,
      start_time,
      professionals (nickname),
      appointment_services (
        service_id,
        services (name, duration_minutes, price_cents)
      )
    `
    )
    .eq("shop_id", shopId)
    .in("customer_whatsapp", whatsappLookupKeys(whatsapp))
    .eq("status", "done")
    .order("date", { ascending: false })
    .order("start_time", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return {
      ok: false,
      error: "Não foi possível buscar o histórico.",
      status: 500,
    };
  }

  if (!row) {
    return { ok: true, data: null };
  }

  const pro = row.professionals as
    | { nickname: string }
    | { nickname: string }[]
    | null;
  const professional = Array.isArray(pro) ? pro[0] : pro;
  const links = (row.appointment_services ?? []) as AppointmentServiceLink[];
  const pricing = await loadServicePricingContext(
    admin,
    row.date,
    links.map((link) => link.service_id)
  );
  const { serviceIds, serviceNames } = mapAppointmentServices(links, pricing);

  return {
    ok: true,
    data: {
      appointmentId: row.id,
      professionalId: row.professional_id,
      professionalName: professional?.nickname ?? "Barbeiro",
      date: row.date,
      startTime: formatTime(row.start_time),
      serviceIds,
      serviceNames,
    },
  };
}

export async function cancelPublicAppointment(
  appointmentId: string,
  rawWhatsapp: string,
  shopId: string
): Promise<Result<{ id: string }>> {
  const whatsapp = normalizeWhatsapp(rawWhatsapp);
  if (!whatsapp) {
    return { ok: false, error: WHATSAPP_INVALID_MESSAGE, status: 400 };
  }

  const existing = await loadOwnedAppointment(appointmentId, whatsapp, shopId);
  if (!existing) {
    return {
      ok: false,
      error: "Agendamento não encontrado ou não pode ser cancelado.",
      status: 404,
    };
  }

  if (!isUpcoming(existing.date, formatTime(existing.start_time))) {
    return {
      ok: false,
      error: "Esse horário já passou e não pode mais ser cancelado.",
      status: 409,
    };
  }

  const admin = createAdminClient();
  if (!admin) {
    return { ok: false, error: "Sistema indisponível no momento.", status: 503 };
  }

  const { error } = await admin
    .from("appointments")
    .update({ status: "cancelled" })
    .eq("id", appointmentId)
    .eq("shop_id", shopId);

  if (error) {
    return {
      ok: false,
      error: "Não foi possível cancelar o agendamento.",
      status: 500,
    };
  }

  return { ok: true, data: { id: appointmentId } };
}

export type UpdatePublicAppointmentInput = z.infer<typeof updateSchema>;

export async function updatePublicAppointment(
  appointmentId: string,
  input: UpdatePublicAppointmentInput,
  shopId: string
): Promise<Result<{ id: string }>> {
  const whatsapp = normalizeWhatsapp(input.whatsapp);
  if (!whatsapp) {
    return { ok: false, error: WHATSAPP_INVALID_MESSAGE, status: 400 };
  }

  const parsed = updateSchema.safeParse({ ...input, whatsapp });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message, status: 400 };
  }

  const existing = await loadOwnedAppointment(
    appointmentId,
    parsed.data.whatsapp,
    shopId
  );
  if (!existing) {
    return {
      ok: false,
      error: "Agendamento não encontrado ou não pode ser alterado.",
      status: 404,
    };
  }

  const admin = createAdminClient();
  if (!admin) {
    return { ok: false, error: "Sistema indisponível no momento.", status: 503 };
  }

  const { data: professional } = await admin
    .from("professionals")
    .select("id")
    .eq("id", parsed.data.professionalId)
    .eq("shop_id", shopId)
    .maybeSingle();

  if (!professional) {
    return { ok: false, error: "Profissional não encontrado.", status: 404 };
  }

  const availability = await getAvailability(
    parsed.data.professionalId,
    parsed.data.date,
    parsed.data.serviceIds,
    appointmentId
  );

  if (!availability.ok) {
    return {
      ok: false,
      error: availability.error,
      status: availability.status,
    };
  }

  if (!availability.slots.includes(parsed.data.startTime)) {
    return {
      ok: false,
      error: "Esse horário não está mais disponível. Escolha outro.",
      status: 409,
    };
  }

  const startMinutes = timeToMinutes(parsed.data.startTime);
  const endMinutes = startMinutes + availability.durationMinutes;

  if (endMinutes > 24 * 60) {
    return {
      ok: false,
      error:
        "O horário de término passa da meia-noite. Escolha um início mais cedo.",
      status: 400,
    };
  }

  const endTime = minutesToTime(endMinutes);

  const { error } = await admin
    .from("appointments")
    .update({
      professional_id: parsed.data.professionalId,
      date: parsed.data.date,
      start_time: parsed.data.startTime,
      end_time: endTime,
    })
    .eq("id", appointmentId)
    .eq("shop_id", shopId);

  if (error) {
    if (error.code === "23P01") {
      return {
        ok: false,
        error: "Esse horário acabou de ser ocupado. Escolha outro.",
        status: 409,
      };
    }
    return {
      ok: false,
      error: "Não foi possível atualizar o agendamento.",
      status: 500,
    };
  }

  const { error: deleteError } = await admin
    .from("appointment_services")
    .delete()
    .eq("appointment_id", appointmentId);

  if (deleteError) {
    return {
      ok: false,
      error: "Não foi possível atualizar os serviços.",
      status: 500,
    };
  }

  const { error: linkError } = await admin.from("appointment_services").insert(
    parsed.data.serviceIds.map((serviceId) => ({
      appointment_id: appointmentId,
      service_id: serviceId,
    }))
  );

  if (linkError) {
    return {
      ok: false,
      error: "Não foi possível salvar os serviços.",
      status: 500,
    };
  }

  return { ok: true, data: { id: appointmentId } };
}
