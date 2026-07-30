import { z } from "zod";
import { expandServiceIdsFromRows } from "@/lib/appointment-service-quantities";
import { ACTIVE_APPOINTMENT_STATUSES } from "@/lib/appointment-status";
import { formatTime } from "@/lib/format";
import {
  getAvailability,
  validateAdminAppointmentSlot,
} from "@/lib/get-availability";
import { createAdminClient } from "@/lib/supabase/admin";

export const appointmentWorkflowStatusSchema = z.enum([
  "scheduled",
  "confirmed",
  "cancelled",
  "done",
]);

export type AppointmentWorkflowStatus = z.infer<
  typeof appointmentWorkflowStatusSchema
>;

const OCCUPIED_SLOT_MESSAGE =
  "Esse horário já está ocupado. Use encaixe ou serviço extra na comanda.";

export type ApplyAppointmentStatusResult =
  | { ok: true; unchanged?: boolean }
  | { ok: false; error: string; status: number };

type LoadedAppointment = {
  professionalId: string;
  status: string;
  isSqueezeIn: boolean;
  date: string;
  startTime: string;
  serviceIds: string[];
};

async function loadAppointmentForStatusUpdate(
  appointmentId: string,
  shopId: string
): Promise<
  | { ok: true; data: LoadedAppointment }
  | { ok: false; error: string; status: number }
> {
  const admin = createAdminClient();
  if (!admin) {
    return { ok: false, error: "Sistema indisponível no momento.", status: 503 };
  }

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
    .eq("shop_id", shopId)
    .maybeSingle();

  if (!appointment) {
    return { ok: false, error: "Agendamento não encontrado.", status: 404 };
  }

  return {
    ok: true,
    data: {
      professionalId: appointment.professional_id,
      status: appointment.status,
      isSqueezeIn: appointment.is_squeeze_in,
      date: appointment.date,
      startTime: formatTime(appointment.start_time),
      serviceIds: expandServiceIdsFromRows(
        appointment.appointment_services ?? []
      ),
    },
  };
}

async function ensureSlotForActiveStatus(
  check: LoadedAppointment,
  appointmentId: string,
  asOwner: boolean
): Promise<ApplyAppointmentStatusResult | null> {
  if (check.isSqueezeIn || check.serviceIds.length === 0) {
    return null;
  }

  const availability = await getAvailability(
    check.professionalId,
    check.date,
    check.serviceIds,
    undefined,
    { adminEdit: true, ownerFreeSchedule: asOwner }
  );

  if (!availability.ok) {
    return { ok: false, error: availability.error, status: 400 };
  }

  if (!asOwner && !availability.slots.includes(check.startTime)) {
    return {
      ok: false,
      error: "Esse horário não está mais disponível.",
      status: 409,
    };
  }

  const slotCheck = await validateAdminAppointmentSlot(
    check.professionalId,
    check.date,
    check.startTime,
    availability.durationMinutes,
    appointmentId,
    { skipScheduleBlocks: asOwner }
  );

  if (!slotCheck.ok) {
    return {
      ok: false,
      error: asOwner ? OCCUPIED_SLOT_MESSAGE : slotCheck.error,
      status: 409,
    };
  }

  return null;
}

/**
 * Atualiza o status de um agendamento (mesma regra do painel).
 * `asOwner`: ao reativar cancelled/done, aplica regras de dono no slot.
 * `restrictToProfessionalId`: se informado, só permite o barbeiro dono do horário.
 */
export async function applyAppointmentStatusUpdate(input: {
  appointmentId: string;
  status: AppointmentWorkflowStatus;
  asOwner: boolean;
  shopId: string;
  restrictToProfessionalId?: string | null;
}): Promise<ApplyAppointmentStatusResult> {
  const parsed = appointmentWorkflowStatusSchema.safeParse(input.status);
  if (!parsed.success) {
    return { ok: false, error: "Status inválido.", status: 400 };
  }

  const loaded = await loadAppointmentForStatusUpdate(
    input.appointmentId,
    input.shopId
  );
  if (!loaded.ok) return loaded;

  const check = loaded.data;

  if (
    input.restrictToProfessionalId &&
    check.professionalId !== input.restrictToProfessionalId
  ) {
    return {
      ok: false,
      error: "Você não pode alterar este agendamento.",
      status: 403,
    };
  }

  if (parsed.data === check.status) {
    return { ok: true, unchanged: true };
  }

  const becomingActive = (
    ACTIVE_APPOINTMENT_STATUSES as readonly string[]
  ).includes(parsed.data);

  const wasInactive =
    check.status === "cancelled" || check.status === "done";

  if (becomingActive && wasInactive) {
    const slotError = await ensureSlotForActiveStatus(
      check,
      input.appointmentId,
      input.asOwner
    );
    if (slotError) return slotError;
  }

  const admin = createAdminClient();
  if (!admin) {
    return { ok: false, error: "Sistema indisponível no momento.", status: 503 };
  }

  const { error } = await admin
    .from("appointments")
    .update({ status: parsed.data })
    .eq("id", input.appointmentId)
    .eq("shop_id", input.shopId);

  if (error) {
    if (error.code === "23P01") {
      return { ok: false, error: "Esse horário já está ocupado.", status: 409 };
    }
    if (error.code === "23514") {
      return {
        ok: false,
        error:
          "O banco ainda não foi atualizado. Rode npm run db:migrate e tente de novo.",
        status: 500,
      };
    }
    return {
      ok: false,
      error: error.message || "Não foi possível atualizar o status.",
      status: 500,
    };
  }

  return { ok: true };
}
