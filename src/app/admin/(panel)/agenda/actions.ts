"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdminClient } from "@/lib/supabase/admin";
import { isActionResult } from "@/lib/is-action-result";
import { minutesToTime, nowMinutesInTimezone, timeToMinutes, todayInTimezone, weekdayOf } from "@/lib/availability";
import { formatTime } from "@/lib/format";
import {
  getAvailability,
  validateAdminAppointmentSlot,
} from "@/lib/get-availability";
import { requireAdmin, canViewAllAgendas, type AdminSession } from "@/lib/require-admin";
import type { ActionResult } from "@/lib/require-owner";
import { assertPermission } from "@/lib/professional-permissions";
import { upsertCustomer } from "@/lib/upsert-customer";
import {
  normalizeWhatsapp,
  WHATSAPP_INVALID_MESSAGE,
  whatsappSchema,
} from "@/lib/whatsapp";
import {
  ACTIVE_APPOINTMENT_STATUSES,
  type AppointmentStatus,
} from "@/lib/appointment-status";
import {
  applyAppointmentStatusUpdate,
  appointmentWorkflowStatusSchema,
  type AppointmentWorkflowStatus,
} from "@/lib/update-appointment-status";
import {
  detachEncaixeFromOpenComandas,
  finalizeOpenComandaAfterAppointmentRemoved,
  syncOpenComandaAfterAppointmentEdit,
} from "@/lib/comanda-service";
import {
  appointmentServiceRowsFromIds,
  expandServiceIdsFromRows,
  sumDurationForServiceIds,
  uniqueServiceIds,
} from "@/lib/appointment-service-quantities";

/** Revalida a agenda depois de responder ao navegador (mais rápido na Vercel). */
function revalidateAdminAgendaSoon() {
  after(() => {
    revalidatePath("/admin");
  });
}

function revalidateAdminAndPublicAgendaSoon() {
  after(() => {
    revalidatePath("/admin");
    revalidatePath("/agenda");
  });
}

const createSchema = z.object({
  professionalId: z.uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  serviceIds: z.array(z.uuid()).min(1, "Escolha pelo menos um serviço."),
  firstName: z.string().trim().min(1, "Informe o nome."),
  lastName: z.string().trim().optional().default(""),
  whatsapp: whatsappSchema,
});

const OCCUPIED_SLOT_MESSAGE =
  "Esse horário já está ocupado. Use encaixe ou serviço extra na comanda.";

function rejectPastBookingForBarber(
  session: AdminSession,
  date: string,
  startTime: string
): ActionResult | null {
  if (canViewAllAgendas(session)) return null;

  const today = todayInTimezone();
  if (date < today) {
    return {
      ok: false,
      error: "Só o dono ou a recepção podem agendar em datas passadas.",
    };
  }

  if (date === today && timeToMinutes(startTime) < nowMinutesInTimezone()) {
    return {
      ok: false,
      error: "Só o dono ou a recepção podem agendar em horários que já passaram.",
    };
  }

  return null;
}

async function assertCanManageAppointment(
  appointmentId: string,
  session: Awaited<ReturnType<typeof requireAdmin>>,
  allowedStatuses: AppointmentStatus[] = [...ACTIVE_APPOINTMENT_STATUSES]
): Promise<ActionResult | { professionalId: string }> {
  if (!("userId" in session)) return session;

  const admin = requireAdminClient();
  if (isActionResult(admin)) return admin;
  const { data: appointment } = await admin
    .from("appointments")
    .select("professional_id, status")
    .eq("id", appointmentId)
    .eq("shop_id", session.shopId)
    .maybeSingle();

  if (!appointment) {
    return { ok: false, error: "Agendamento não encontrado." };
  }

  if (
    !canViewAllAgendas(session) &&
    appointment.professional_id !== session.professionalId
  ) {
    return { ok: false, error: "Você não pode alterar este agendamento." };
  }

  if (
    !allowedStatuses.includes(
      appointment.status as (typeof allowedStatuses)[number]
    )
  ) {
    if (appointment.status === "done") {
      return { ok: false, error: "Este agendamento já foi atendido." };
    }
    if (appointment.status === "cancelled") {
      return { ok: false, error: "Agendamento cancelado não pode ser alterado." };
    }
    return { ok: false, error: "Este agendamento não pode ser alterado agora." };
  }

  return { professionalId: appointment.professional_id };
}

async function assertOwnsAppointment(
  appointmentId: string,
  session: Awaited<ReturnType<typeof requireAdmin>>
): Promise<ActionResult | { professionalId: string; status: string; isSqueezeIn: boolean; date: string; startTime: string; serviceIds: string[] }> {
  if (!("userId" in session)) return session;

  const admin = requireAdminClient();
  if (isActionResult(admin)) return admin;

  const { data: appointment } = await admin
    .from("appointments")
    .select(
      `
      professional_id,
      status,
      is_squeeze_in,
      date,
      start_time,
      appointment_services ( service_id, quantity )
    `
    )
    .eq("id", appointmentId)
    .eq("shop_id", session.shopId)
    .maybeSingle();

  if (!appointment) {
    return { ok: false, error: "Agendamento não encontrado." };
  }

  if (
    !canViewAllAgendas(session) &&
    appointment.professional_id !== session.professionalId
  ) {
    return { ok: false, error: "Você não pode alterar este agendamento." };
  }

  return {
    professionalId: appointment.professional_id,
    status: appointment.status,
    isSqueezeIn: appointment.is_squeeze_in,
    date: appointment.date,
    startTime: formatTime(appointment.start_time),
    serviceIds: expandServiceIdsFromRows(
      appointment.appointment_services ?? []
    ),
  };
}

type InsertAppointmentResult =
  | ActionResult
  | { ok: true; appointmentId: string };

async function insertAppointment(
  data: z.infer<typeof createSchema>,
  durationMinutes: number,
  isSqueezeIn: boolean,
  shopId: string
): Promise<InsertAppointmentResult> {
  console.log("[admin-appointment-create] iniciou criação admin", {
    isSqueezeIn,
  });

  const admin = requireAdminClient();
  if (isActionResult(admin)) return admin;
  const startMinutes = timeToMinutes(data.startTime);
  const endMinutes = startMinutes + durationMinutes;

  if (endMinutes > 24 * 60) {
    return {
      ok: false,
      error: "O horário de término passa da meia-noite. Escolha um início mais cedo.",
    };
  }

  const endTime = minutesToTime(endMinutes);

  const customer = await upsertCustomer({
    firstName: data.firstName,
    lastName: data.lastName,
    whatsapp: data.whatsapp,
    shopId,
  });

  if (!customer.ok) {
    return { ok: false, error: customer.error };
  }

  const { data: appointment, error } = await admin
    .from("appointments")
    .insert({
      shop_id: shopId,
      professional_id: data.professionalId,
      customer_id: customer.customerId,
      customer_first_name: customer.firstName,
      customer_last_name: customer.lastName,
      customer_whatsapp: data.whatsapp,
      date: data.date,
      start_time: data.startTime,
      end_time: endTime,
      status: "scheduled",
      is_squeeze_in: isSqueezeIn,
      booking_source: "admin",
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23P01") {
      return {
        ok: false,
        error: "Esse horário já está ocupado.",
      };
    }
    return { ok: false, error: "Não foi possível criar o agendamento." };
  }

  const { error: linkError } = await admin.from("appointment_services").insert(
    appointmentServiceRowsFromIds(appointment.id, data.serviceIds)
  );

  if (linkError) {
    await admin
      .from("appointments")
      .delete()
      .eq("id", appointment.id)
      .eq("shop_id", shopId);
    return { ok: false, error: "Não foi possível salvar os serviços." };
  }

  console.log("[admin-appointment-create] appointment criado:", appointment.id);

  revalidateAdminAgendaSoon();
  return { ok: true, appointmentId: appointment.id };
}

async function validateCreateInput(
  input: { professionalId: string; date: string; serviceIds: string[] },
  session: AdminSession
): Promise<ActionResult | { durationMinutes: number }> {
  if (
    !canViewAllAgendas(session) &&
    input.professionalId !== session.professionalId
  ) {
    return { ok: false, error: "Você só pode agendar na sua própria agenda." };
  }

  const admin = requireAdminClient();
  if (isActionResult(admin)) return admin;

  const uniqueIds = uniqueServiceIds(input.serviceIds);

  const [{ data: professional }, { data: foundServices }, { data: links }, { data: weekdayPrices }] =
    await Promise.all([
      admin
        .from("professionals")
        .select("id, active")
        .eq("id", input.professionalId)
        .eq("shop_id", session.shopId)
        .maybeSingle(),
      admin
        .from("services")
        .select("id, name, active, duration_minutes")
        .eq("shop_id", session.shopId)
        .in("id", uniqueIds),
      admin
        .from("professional_services")
        .select("service_id")
        .eq("professional_id", input.professionalId)
        .in("service_id", uniqueIds),
      admin
        .from("service_weekday_prices")
        .select("service_id")
        .in("service_id", uniqueIds)
        .eq("weekday", weekdayOf(input.date)),
    ]);

  if (!professional?.active) {
    return { ok: false, error: "Profissional não encontrado." };
  }

  if (!foundServices || foundServices.length !== uniqueIds.length) {
    return { ok: false, error: "Serviço não encontrado." };
  }

  if (foundServices.some((s) => !s.active)) {
    return { ok: false, error: "Serviço não encontrado." };
  }

  const linkedIds = new Set((links ?? []).map((l) => l.service_id));
  if (!input.serviceIds.every((id) => linkedIds.has(id))) {
    return {
      ok: false,
      error: "Esse profissional não faz um dos serviços escolhidos.",
    };
  }

  const pricedIds = new Set((weekdayPrices ?? []).map((row) => row.service_id));
  const unavailable = foundServices.find((service) => !pricedIds.has(service.id));
  if (unavailable) {
    return {
      ok: false,
      error: `"${unavailable.name}" não está disponível neste dia da semana.`,
    };
  }

  const durationById = new Map(
    foundServices.map((s) => [s.id, s.duration_minutes])
  );
  const durationMinutes = sumDurationForServiceIds(
    input.serviceIds,
    durationById
  );

  return { durationMinutes };
}

export async function createNormalAppointment(input: {
  professionalId: string;
  date: string;
  startTime: string;
  serviceIds: string[];
  firstName: string;
  lastName: string;
  whatsapp: string;
}): Promise<InsertAppointmentResult> {
  const session = await requireAdmin();
  if (!("userId" in session)) return session;

  const denied = assertPermission(session, "canBookClients");
  if (denied) return denied;

  const whatsapp = normalizeWhatsapp(input.whatsapp);
  if (!whatsapp) {
    return { ok: false, error: WHATSAPP_INVALID_MESSAGE };
  }

  const parsed = createSchema.safeParse({
    ...input,
    whatsapp,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const validated = await validateCreateInput(parsed.data, session);
  if (!("durationMinutes" in validated)) return validated;

  const pastError = rejectPastBookingForBarber(
    session,
    parsed.data.date,
    parsed.data.startTime
  );
  if (pastError) return pastError;

  if (canViewAllAgendas(session)) {
    const slotCheck = await validateAdminAppointmentSlot(
      parsed.data.professionalId,
      parsed.data.date,
      parsed.data.startTime,
      validated.durationMinutes,
      "",
      { skipScheduleBlocks: true }
    );

    if (!slotCheck.ok) {
      return { ok: false, error: OCCUPIED_SLOT_MESSAGE };
    }

    return insertAppointment(
      parsed.data,
      validated.durationMinutes,
      false,
      session.shopId
    );
  }

  const availability = await getAvailability(
    parsed.data.professionalId,
    parsed.data.date,
    parsed.data.serviceIds
  );

  if (!availability.ok) {
    return { ok: false, error: availability.error };
  }

  if (!availability.slots.includes(parsed.data.startTime)) {
    return { ok: false, error: "Esse horário não está mais disponível." };
  }

  return insertAppointment(
    parsed.data,
    validated.durationMinutes,
    false,
    session.shopId
  );
}

// Encaixe manual: ignora horários livres e pode sobrepor outros agendamentos.
export async function createSqueezeInAppointment(input: {
  professionalId: string;
  date: string;
  startTime: string;
  serviceIds: string[];
  firstName: string;
  lastName: string;
  whatsapp: string;
}): Promise<InsertAppointmentResult> {
  const session = await requireAdmin();
  if (!("userId" in session)) return session;

  const denied = assertPermission(session, "canCreateSqueezeIn");
  if (denied) return denied;

  const whatsapp = normalizeWhatsapp(input.whatsapp);
  if (!whatsapp) {
    return { ok: false, error: WHATSAPP_INVALID_MESSAGE };
  }

  const parsed = createSchema.safeParse({
    ...input,
    whatsapp,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const validated = await validateCreateInput(parsed.data, session);
  if (!("durationMinutes" in validated)) return validated;

  const pastError = rejectPastBookingForBarber(
    session,
    parsed.data.date,
    parsed.data.startTime
  );
  if (pastError) return pastError;

  return insertAppointment(
    parsed.data,
    validated.durationMinutes,
    true,
    session.shopId
  );
}

const updateSchema = z.object({
  appointmentId: z.uuid(),
  professionalId: z.uuid(),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  serviceIds: z.array(z.uuid()).min(1, "Escolha pelo menos um serviço."),
  firstName: z.string().trim().min(1, "Informe o nome."),
  lastName: z.string().trim().optional().default(""),
  whatsapp: whatsappSchema,
});

export async function updateAppointment(input: {
  appointmentId: string;
  professionalId: string;
  startTime: string;
  serviceIds: string[];
  firstName: string;
  lastName: string;
  whatsapp: string;
}): Promise<ActionResult> {
  const session = await requireAdmin();
  if (!("userId" in session)) return session;

  const denied = assertPermission(session, "canEditAppointments");
  if (denied) return denied;

  const whatsapp = normalizeWhatsapp(input.whatsapp);
  if (!whatsapp) {
    return { ok: false, error: WHATSAPP_INVALID_MESSAGE };
  }

  const parsed = updateSchema.safeParse({
    ...input,
    whatsapp,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const check = await assertCanManageAppointment(
    parsed.data.appointmentId,
    session,
    [...ACTIVE_APPOINTMENT_STATUSES, "done"]
  );
  if (!("professionalId" in check)) return check;

  const admin = requireAdminClient();
  if (isActionResult(admin)) return admin;
  const { data: existing } = await admin
    .from("appointments")
    .select("date, is_squeeze_in")
    .eq("id", parsed.data.appointmentId).eq("shop_id", session.shopId)
    .maybeSingle();

  if (!existing) {
    return { ok: false, error: "Agendamento não encontrado." };
  }

  const createInput = {
    professionalId: parsed.data.professionalId,
    date: existing.date,
    startTime: parsed.data.startTime,
    serviceIds: parsed.data.serviceIds,
    firstName: parsed.data.firstName,
    lastName: parsed.data.lastName,
    whatsapp: parsed.data.whatsapp,
  };

  const validated = await validateCreateInput(createInput, session);
  if (!("durationMinutes" in validated)) return validated;

  const pastError = rejectPastBookingForBarber(
    session,
    existing.date,
    parsed.data.startTime
  );
  if (pastError) return pastError;

  if (!existing.is_squeeze_in) {
    const slotCheck = await validateAdminAppointmentSlot(
      parsed.data.professionalId,
      existing.date,
      parsed.data.startTime,
      validated.durationMinutes,
      parsed.data.appointmentId,
      { skipScheduleBlocks: canViewAllAgendas(session) }
    );

    if (!slotCheck.ok) {
      return {
        ok: false,
        error: canViewAllAgendas(session)
          ? OCCUPIED_SLOT_MESSAGE
          : slotCheck.error,
      };
    }
  }

  const startMinutes = timeToMinutes(parsed.data.startTime);
  const endMinutes = startMinutes + validated.durationMinutes;

  if (endMinutes > 24 * 60) {
    return {
      ok: false,
      error: "O horário de término passa da meia-noite. Escolha um início mais cedo.",
    };
  }

  const endTime = minutesToTime(endMinutes);

  const customer = await upsertCustomer({
    firstName: parsed.data.firstName,
    lastName: parsed.data.lastName,
    whatsapp: parsed.data.whatsapp,
    shopId: session.shopId,
  });

  if (!customer.ok) {
    return { ok: false, error: customer.error };
  }

  const { error } = await admin
    .from("appointments")
    .update({
      professional_id: parsed.data.professionalId,
      customer_id: customer.customerId,
      customer_first_name: customer.firstName,
      customer_last_name: customer.lastName,
      customer_whatsapp: parsed.data.whatsapp,
      start_time: parsed.data.startTime,
      end_time: endTime,
    })
    .eq("id", parsed.data.appointmentId).eq("shop_id", session.shopId);

  if (error) {
    if (error.code === "23P01") {
      return { ok: false, error: "Esse horário já está ocupado." };
    }
    return { ok: false, error: "Não foi possível atualizar o agendamento." };
  }

  const { error: deleteError } = await admin
    .from("appointment_services")
    .delete()
    .eq("appointment_id", parsed.data.appointmentId);

  if (deleteError) {
    return { ok: false, error: "Não foi possível atualizar os serviços." };
  }

  const { error: linkError } = await admin.from("appointment_services").insert(
    appointmentServiceRowsFromIds(
      parsed.data.appointmentId,
      parsed.data.serviceIds
    )
  );

  if (linkError) {
    return { ok: false, error: "Não foi possível salvar os serviços." };
  }

  // Sync da comanda precisa terminar antes da resposta (abrir comanda em seguida).
  try {
    await syncOpenComandaAfterAppointmentEdit(
      admin,
      parsed.data.appointmentId
    );
  } catch (syncError) {
    console.error("[comanda-sync] erro ao alinhar comanda após edição:", {
      appointmentId: parsed.data.appointmentId,
      error: syncError,
    });
  }

  revalidateAdminAgendaSoon();
  return { ok: true };
}

const moveSchema = z.object({
  appointmentId: z.uuid(),
  professionalId: z.uuid(),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
});

/**
 * Arraste do card na grade: troca barbeiro e/ou horário mantendo cliente,
 * serviços e duração. Mais leve que `updateAppointment` porque não mexe
 * nos vínculos de serviço nem no cadastro do cliente.
 */
export async function moveAppointment(input: {
  appointmentId: string;
  professionalId: string;
  startTime: string;
}): Promise<ActionResult> {
  const session = await requireAdmin();
  if (!("userId" in session)) return session;

  const denied = assertPermission(session, "canEditAppointments");
  if (denied) return denied;

  const parsed = moveSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const check = await assertCanManageAppointment(
    parsed.data.appointmentId,
    session
  );
  if (!("professionalId" in check)) return check;

  const admin = requireAdminClient();
  if (isActionResult(admin)) return admin;

  const { data: existing } = await admin
    .from("appointments")
    .select(
      `
      date,
      start_time,
      professional_id,
      is_squeeze_in,
      is_comanda_extra,
      appointment_services ( service_id, quantity )
      `
    )
    .eq("id", parsed.data.appointmentId).eq("shop_id", session.shopId)
    .maybeSingle();

  if (!existing) {
    return { ok: false, error: "Agendamento não encontrado." };
  }

  if (existing.is_comanda_extra) {
    return {
      ok: false,
      error: "Serviço extra da comanda não pode ser movido na grade.",
    };
  }

  if (
    existing.professional_id === parsed.data.professionalId &&
    formatTime(existing.start_time) === parsed.data.startTime
  ) {
    return { ok: true };
  }

  const serviceIds = expandServiceIdsFromRows(
    existing.appointment_services ?? []
  );
  if (serviceIds.length === 0) {
    return { ok: false, error: "Este agendamento não tem serviços." };
  }

  const validated = await validateCreateInput(
    {
      professionalId: parsed.data.professionalId,
      date: existing.date,
      serviceIds,
    },
    session
  );
  if (!("durationMinutes" in validated)) return validated;

  const pastError = rejectPastBookingForBarber(
    session,
    existing.date,
    parsed.data.startTime
  );
  if (pastError) return pastError;

  if (!existing.is_squeeze_in) {
    const slotCheck = await validateAdminAppointmentSlot(
      parsed.data.professionalId,
      existing.date,
      parsed.data.startTime,
      validated.durationMinutes,
      parsed.data.appointmentId,
      { skipScheduleBlocks: canViewAllAgendas(session) }
    );

    if (!slotCheck.ok) {
      return {
        ok: false,
        error: canViewAllAgendas(session) ? OCCUPIED_SLOT_MESSAGE : slotCheck.error,
      };
    }
  }

  const endMinutes =
    timeToMinutes(parsed.data.startTime) + validated.durationMinutes;
  if (endMinutes > 24 * 60) {
    return {
      ok: false,
      error:
        "O horário de término passa da meia-noite. Escolha um início mais cedo.",
    };
  }

  const { error } = await admin
    .from("appointments")
    .update({
      professional_id: parsed.data.professionalId,
      start_time: parsed.data.startTime,
      end_time: minutesToTime(endMinutes),
    })
    .eq("id", parsed.data.appointmentId).eq("shop_id", session.shopId);

  if (error) {
    if (error.code === "23P01") {
      return { ok: false, error: "Esse horário já está ocupado." };
    }
    return { ok: false, error: "Não foi possível mover o agendamento." };
  }

  try {
    await syncOpenComandaAfterAppointmentEdit(
      admin,
      parsed.data.appointmentId
    );
  } catch (syncError) {
    console.error("[comanda-sync] erro ao alinhar comanda após mover card:", {
      appointmentId: parsed.data.appointmentId,
      error: syncError,
    });
  }

  revalidateAdminAndPublicAgendaSoon();
  return { ok: true };
}

const blockSchema = z.object({
  professionalId: z.uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  note: z.string().max(200).optional(),
});

export async function createScheduleBlock(input: {
  professionalId: string;
  date: string;
  startTime: string;
  endTime: string;
  note?: string;
}): Promise<ActionResult> {
  const session = await requireAdmin();
  if (!("userId" in session)) return session;

  const denied = assertPermission(session, "canManageScheduleBlocks");
  if (denied) return denied;

  const parsed = blockSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  if (
    !canViewAllAgendas(session) &&
    parsed.data.professionalId !== session.professionalId
  ) {
    return { ok: false, error: "Você só pode bloquear a sua própria agenda." };
  }

  if (timeToMinutes(parsed.data.startTime) >= timeToMinutes(parsed.data.endTime)) {
    return {
      ok: false,
      error: "O horário de fim precisa ser depois do início.",
    };
  }

  const admin = requireAdminClient();
  if (isActionResult(admin)) return admin;
  const { data: professional } = await admin
    .from("professionals")
    .select("id, active")
    .eq("id", parsed.data.professionalId)
    .eq("shop_id", session.shopId)
    .maybeSingle();

  if (!professional?.active) {
    return { ok: false, error: "Profissional não encontrado." };
  }

  const { error } = await admin.from("schedule_blocks").insert({
    shop_id: session.shopId,
    professional_id: parsed.data.professionalId,
    date: parsed.data.date,
    start_time: parsed.data.startTime,
    end_time: parsed.data.endTime,
    note: parsed.data.note?.trim() ?? "",
  });

  if (error) {
    return { ok: false, error: "Não foi possível bloquear o horário." };
  }

  revalidateAdminAgendaSoon();
  return { ok: true };
}

export async function deleteScheduleBlock(
  blockId: string
): Promise<ActionResult> {
  const session = await requireAdmin();
  if (!("userId" in session)) return session;

  const denied = assertPermission(session, "canManageScheduleBlocks");
  if (denied) return denied;

  const admin = requireAdminClient();
  if (isActionResult(admin)) return admin;
  const { data: block } = await admin
    .from("schedule_blocks")
    .select("professional_id")
    .eq("id", blockId)
    .eq("shop_id", session.shopId)
    .maybeSingle();

  if (!block) {
    return { ok: false, error: "Bloqueio não encontrado." };
  }

  if (!canViewAllAgendas(session) && block.professional_id !== session.professionalId) {
    return { ok: false, error: "Você não pode remover este bloqueio." };
  }

  const { error } = await admin
    .from("schedule_blocks")
    .delete()
    .eq("id", blockId)
    .eq("shop_id", session.shopId);

  if (error) {
    return { ok: false, error: "Não foi possível remover o bloqueio." };
  }

  revalidateAdminAgendaSoon();
  return { ok: true };
}

const cancelAppointmentSchema = z.object({
  appointmentId: z.uuid(),
  reason: z
    .string()
    .trim()
    .min(3, "Informe o motivo do cancelamento (mínimo 3 caracteres)."),
});

export async function cancelAppointment(input: {
  appointmentId: string;
  reason: string;
}): Promise<ActionResult> {
  const session = await requireAdmin();
  if (!("userId" in session)) return session;

  const denied = assertPermission(session, "canCancelAppointments");
  if (denied) return denied;

  const parsed = cancelAppointmentSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const { appointmentId, reason } = parsed.data;

  console.log("[admin-appointment-cancel] iniciou cancelamento admin", {
    appointmentId,
  });

  const check = await assertCanManageAppointment(appointmentId, session, [
    ...ACTIVE_APPOINTMENT_STATUSES,
    "done",
  ]);
  if (!("professionalId" in check)) return check;

  const admin = requireAdminClient();
  if (isActionResult(admin)) return admin;

  const { data: aptInfo } = await admin
    .from("appointments")
    .select("is_squeeze_in")
    .eq("id", appointmentId).eq("shop_id", session.shopId)
    .maybeSingle();

  if (aptInfo?.is_squeeze_in) {
    const { data: squeezeItemLink } = await admin
      .from("comanda_items")
      .select("comandas ( status )")
      .eq("squeeze_appointment_id", appointmentId)
      .limit(1)
      .maybeSingle();

    const squeezeComanda = Array.isArray(squeezeItemLink?.comandas)
      ? squeezeItemLink?.comandas[0]
      : squeezeItemLink?.comandas;

    if (squeezeComanda?.status === "closed") {
      return {
        ok: false,
        error:
          "Esta comanda está fechada. Reabra a comanda antes de cancelar o horário.",
      };
    }

    const cancelledAt = new Date().toISOString();
    const { error } = await admin
      .from("appointments")
      .update({
        status: "cancelled",
        cancellation_reason: reason,
        cancelled_at: cancelledAt,
      })
      .eq("id", appointmentId).eq("shop_id", session.shopId);

    if (error) {
      return { ok: false, error: "Não foi possível cancelar o agendamento." };
    }

    console.log("[admin-appointment-cancel] appointment cancelado:", appointmentId);

    await detachEncaixeFromOpenComandas(admin, appointmentId);

    revalidateAdminAndPublicAgendaSoon();
    return { ok: true };
  }

  const { data: link } = await admin
    .from("comanda_appointments")
    .select("comanda_id, comandas ( id, status )")
    .eq("appointment_id", appointmentId)
    .maybeSingle();

  const comanda = Array.isArray(link?.comandas)
    ? link?.comandas[0]
    : link?.comandas;

  if (comanda?.status === "closed") {
    return {
      ok: false,
      error:
        "Esta comanda está fechada. Reabra a comanda antes de cancelar o horário.",
    };
  }

  const { data: items } = await admin
    .from("comanda_items")
    .select("squeeze_appointment_id")
    .eq("appointment_id", appointmentId);

  const squeezeIds = (items ?? [])
    .map((row) => row.squeeze_appointment_id)
    .filter((id): id is string => Boolean(id));

  const cancelledAt = new Date().toISOString();

  const { error } = await admin
    .from("appointments")
    .update({
      status: "cancelled",
      cancellation_reason: reason,
      cancelled_at: cancelledAt,
    })
    .eq("id", appointmentId).eq("shop_id", session.shopId);

  if (error) {
    return { ok: false, error: "Não foi possível cancelar o agendamento." };
  }

  console.log("[admin-appointment-cancel] appointment cancelado:", appointmentId);

  if (squeezeIds.length > 0) {
    await admin
      .from("appointments")
      .update({
        status: "cancelled",
        cancellation_reason: reason,
        cancelled_at: cancelledAt,
      })
      .in("id", squeezeIds)
      .eq("shop_id", session.shopId)
      .eq("is_squeeze_in", true);
  }

  await admin.from("comanda_items").delete().eq("appointment_id", appointmentId);
  await admin
    .from("comanda_appointments")
    .delete()
    .eq("appointment_id", appointmentId);

  if (comanda?.id) {
    await finalizeOpenComandaAfterAppointmentRemoved(admin, comanda.id);
  }

  revalidateAdminAndPublicAgendaSoon();
  return { ok: true };
}

const cancelAppointmentServiceSchema = z.object({
  appointmentId: z.uuid(),
  serviceIndex: z.number().int().min(0),
  reason: z
    .string()
    .trim()
    .min(3, "Informe o motivo do cancelamento (mínimo 3 caracteres)."),
});

/**
 * Cancela só um serviço do card (ex.: 2 cortes → remove 1).
 * Se for o último serviço, cancela o agendamento inteiro.
 */
export async function cancelAppointmentService(input: {
  appointmentId: string;
  serviceIndex: number;
  reason: string;
}): Promise<ActionResult> {
  const session = await requireAdmin();
  if (!("userId" in session)) return session;

  const denied = assertPermission(session, "canCancelAppointments");
  if (denied) return denied;

  const parsed = cancelAppointmentServiceSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const { appointmentId, serviceIndex, reason } = parsed.data;

  const check = await assertCanManageAppointment(appointmentId, session, [
    ...ACTIVE_APPOINTMENT_STATUSES,
    "done",
  ]);
  if (!("professionalId" in check)) return check;

  const admin = requireAdminClient();
  if (isActionResult(admin)) return admin;

  const { data: appointment } = await admin
    .from("appointments")
    .select(
      `
      id,
      start_time,
      is_squeeze_in,
      appointment_services ( service_id, quantity )
    `
    )
    .eq("id", appointmentId).eq("shop_id", session.shopId)
    .maybeSingle();

  if (!appointment) {
    return { ok: false, error: "Agendamento não encontrado." };
  }

  const expandedIds = expandServiceIdsFromRows(
    appointment.appointment_services ?? []
  );

  if (expandedIds.length <= 1) {
    return cancelAppointment({ appointmentId, reason });
  }

  if (serviceIndex < 0 || serviceIndex >= expandedIds.length) {
    return { ok: false, error: "Serviço não encontrado neste agendamento." };
  }

  const { data: link } = await admin
    .from("comanda_appointments")
    .select("comanda_id, comandas ( id, status )")
    .eq("appointment_id", appointmentId)
    .maybeSingle();

  const comanda = Array.isArray(link?.comandas)
    ? link?.comandas[0]
    : link?.comandas;

  if (comanda?.status === "closed") {
    return {
      ok: false,
      error:
        "Esta comanda está fechada. Reabra a comanda antes de cancelar o horário.",
    };
  }

  if (appointment.is_squeeze_in) {
    const { data: squeezeItemLink } = await admin
      .from("comanda_items")
      .select("comandas ( status )")
      .eq("squeeze_appointment_id", appointmentId)
      .limit(1)
      .maybeSingle();

    const squeezeComanda = Array.isArray(squeezeItemLink?.comandas)
      ? squeezeItemLink?.comandas[0]
      : squeezeItemLink?.comandas;

    if (squeezeComanda?.status === "closed") {
      return {
        ok: false,
        error:
          "Esta comanda está fechada. Reabra a comanda antes de cancelar o horário.",
      };
    }
  }

  const remainingIds = expandedIds.filter((_, index) => index !== serviceIndex);
  const uniqueIds = uniqueServiceIds(remainingIds);

  const { data: foundServices } = await admin
    .from("services")
    .select("id, duration_minutes")
    .eq("shop_id", session.shopId)
    .in("id", uniqueIds);

  if (!foundServices || foundServices.length !== uniqueIds.length) {
    return { ok: false, error: "Não foi possível recalcular o horário." };
  }

  const durationById = new Map(
    foundServices.map((row) => [row.id, row.duration_minutes])
  );
  const durationMinutes = sumDurationForServiceIds(remainingIds, durationById);
  const startMinutes = timeToMinutes(formatTime(appointment.start_time));
  const endTime = minutesToTime(startMinutes + durationMinutes);

  await admin
    .from("appointment_services")
    .delete()
    .eq("appointment_id", appointmentId);

  const { error: linkError } = await admin.from("appointment_services").insert(
    appointmentServiceRowsFromIds(appointmentId, remainingIds)
  );

  if (linkError) {
    return { ok: false, error: "Não foi possível remover o serviço." };
  }

  const { error: updateError } = await admin
    .from("appointments")
    .update({ end_time: endTime })
    .eq("id", appointmentId).eq("shop_id", session.shopId);

  if (updateError) {
    return { ok: false, error: "Não foi possível atualizar o horário." };
  }

  try {
    await syncOpenComandaAfterAppointmentEdit(admin, appointmentId);
  } catch (error) {
    console.error(
      "[admin-appointment-cancel-service] erro ao sincronizar comanda:",
      { appointmentId, error }
    );
  }

  revalidateAdminAndPublicAgendaSoon();
  return { ok: true };
}

export async function deleteAppointment(
  appointmentId: string
): Promise<ActionResult> {
  const session = await requireAdmin();
  if (!("userId" in session)) return session;

  if (!session.isOwner) {
    return { ok: false, error: "Apenas o dono pode excluir agendamentos." };
  }

  const check = await assertOwnsAppointment(appointmentId, session);
  if (!("professionalId" in check)) return check;

  const admin = requireAdminClient();
  if (isActionResult(admin)) return admin;

  const { data: aptInfo } = await admin
    .from("appointments")
    .select("is_squeeze_in")
    .eq("id", appointmentId).eq("shop_id", session.shopId)
    .maybeSingle();

  if (aptInfo?.is_squeeze_in) {
    const { data: squeezeItemLink } = await admin
      .from("comanda_items")
      .select("comandas ( status )")
      .eq("squeeze_appointment_id", appointmentId)
      .limit(1)
      .maybeSingle();

    const squeezeComanda = Array.isArray(squeezeItemLink?.comandas)
      ? squeezeItemLink?.comandas[0]
      : squeezeItemLink?.comandas;

    if (squeezeComanda?.status === "closed") {
      return {
        ok: false,
        error:
          "Esta comanda está fechada. Reabra antes de excluir o agendamento.",
      };
    }

    await detachEncaixeFromOpenComandas(admin, appointmentId);

    const { error } = await admin
      .from("appointments")
      .delete()
      .eq("id", appointmentId).eq("shop_id", session.shopId);

    if (error) {
      return { ok: false, error: "Não foi possível excluir o agendamento." };
    }

    revalidateAdminAndPublicAgendaSoon();
    return { ok: true };
  }

  const { data: link } = await admin
    .from("comanda_appointments")
    .select("comanda_id, comandas ( id, status )")
    .eq("appointment_id", appointmentId)
    .maybeSingle();

  const comanda = Array.isArray(link?.comandas)
    ? link?.comandas[0]
    : link?.comandas;

  if (comanda?.status === "closed") {
    return {
      ok: false,
      error:
        "Esta comanda está fechada. Reabra antes de excluir o agendamento.",
    };
  }

  const { data: items } = await admin
    .from("comanda_items")
    .select("squeeze_appointment_id")
    .eq("appointment_id", appointmentId);

  const squeezeIds = (items ?? [])
    .map((item) => item.squeeze_appointment_id)
    .filter((id): id is string => Boolean(id));

  await admin.from("comanda_items").delete().eq("appointment_id", appointmentId);
  await admin
    .from("comanda_appointments")
    .delete()
    .eq("appointment_id", appointmentId);

  if (squeezeIds.length > 0) {
    await admin
      .from("appointments")
      .delete()
      .in("id", squeezeIds)
      .eq("shop_id", session.shopId);
  }

  const openComandaId = comanda?.id ?? link?.comanda_id;
  if (openComandaId) {
    await finalizeOpenComandaAfterAppointmentRemoved(admin, openComandaId);
  }

  const { error } = await admin
    .from("appointments")
    .delete()
    .eq("id", appointmentId).eq("shop_id", session.shopId);

  if (error) {
    return { ok: false, error: "Não foi possível excluir o agendamento." };
  }

  revalidateAdminAndPublicAgendaSoon();
  return { ok: true };
}

const moveDateSchema = z.object({
  appointmentId: z.uuid(),
  newDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function moveAppointmentToDate(input: {
  appointmentId: string;
  newDate: string;
}): Promise<ActionResult> {
  const session = await requireAdmin();
  if (!("userId" in session)) return session;
  if (!session.isOwner) {
    return { ok: false, error: "Apenas o dono pode mudar a data." };
  }

  const parsed = moveDateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const admin = requireAdminClient();
  if (isActionResult(admin)) return admin;

  const { data: appointment } = await admin
    .from("appointments")
    .select("id, date")
    .eq("id", parsed.data.appointmentId)
    .eq("shop_id", session.shopId)
    .maybeSingle();

  if (!appointment) {
    return { ok: false, error: "Agendamento não encontrado." };
  }

  if (appointment.date === parsed.data.newDate) {
    return { ok: true };
  }

  const { data: link } = await admin
    .from("comanda_appointments")
    .select("comandas ( status )")
    .eq("appointment_id", parsed.data.appointmentId)
    .maybeSingle();

  const comanda = Array.isArray(link?.comandas)
    ? link?.comandas[0]
    : link?.comandas;

  if (comanda?.status === "closed") {
    return {
      ok: false,
      error: "Comanda fechada. Reabra antes de mudar a data.",
    };
  }

  const { data: items } = await admin
    .from("comanda_items")
    .select("squeeze_appointment_id")
    .eq("appointment_id", parsed.data.appointmentId);

  const squeezeIds = (items ?? [])
    .map((item) => item.squeeze_appointment_id)
    .filter((id): id is string => Boolean(id));

  await admin.from("comanda_items").delete().eq("appointment_id", parsed.data.appointmentId);
  await admin
    .from("comanda_appointments")
    .delete()
    .eq("appointment_id", parsed.data.appointmentId);

  if (squeezeIds.length > 0) {
    await admin
      .from("appointments")
      .delete()
      .in("id", squeezeIds)
      .eq("shop_id", session.shopId);
  }

  const { error } = await admin
    .from("appointments")
    .update({ date: parsed.data.newDate })
    .eq("id", parsed.data.appointmentId).eq("shop_id", session.shopId);

  if (error) {
    return { ok: false, error: "Não foi possível mudar a data do agendamento." };
  }

  revalidateAdminAgendaSoon();
  return { ok: true };
}

export async function updateAppointmentStatus(
  appointmentId: string,
  status: AppointmentWorkflowStatus
): Promise<ActionResult> {
  const session = await requireAdmin();
  if (!("userId" in session)) return session;

  const denied = assertPermission(session, "canEditAppointments");
  if (denied) return denied;

  const parsed = appointmentWorkflowStatusSchema.safeParse(status);
  if (!parsed.success) {
    return { ok: false, error: "Status inválido." };
  }

  const result = await applyAppointmentStatusUpdate({
    appointmentId,
    status: parsed.data,
    asOwner: canViewAllAgendas(session),
    shopId: session.shopId,
    restrictToProfessionalId: canViewAllAgendas(session)
      ? null
      : session.professionalId,
  });

  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  revalidateAdminAndPublicAgendaSoon();
  return { ok: true };
}

export async function getEditAvailabilitySlots(input: {
  professionalId: string;
  date: string;
  serviceIds: string[];
  excludeAppointmentId: string;
}): Promise<{ ok: true; slots: string[] } | { ok: false; error: string }> {
  const session = await requireAdmin();
  if (!("userId" in session)) {
    return session.ok === false
      ? { ok: false, error: session.error }
      : { ok: false, error: "Sessão inválida." };
  }

  if (
    !canViewAllAgendas(session) &&
    input.professionalId !== session.professionalId
  ) {
    return {
      ok: false,
      error: "Você só pode editar agendamentos na sua própria agenda.",
    };
  }

  const admin = requireAdminClient();
  if (isActionResult(admin)) return admin;
  const { data: professional } = await admin
    .from("professionals")
    .select("id")
    .eq("id", input.professionalId)
    .eq("shop_id", session.shopId)
    .maybeSingle();
  if (!professional) {
    return { ok: false, error: "Profissional não encontrado." };
  }

  const result = await getAvailability(
    input.professionalId,
    input.date,
    input.serviceIds,
    input.excludeAppointmentId,
    {
      adminEdit: true,
      ownerFreeSchedule: canViewAllAgendas(session),
    }
  );

  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  return { ok: true, slots: result.slots };
}
