import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { minutesToTime, timeToMinutes } from "@/lib/availability";
import { pickLeastBusyProfessionalForSlot } from "@/lib/any-professional-booking";
import { getAvailability } from "@/lib/get-availability";
import { upsertCustomer } from "@/lib/upsert-customer";
import {
  normalizeWhatsapp,
  WHATSAPP_INVALID_MESSAGE,
  whatsappSchema,
} from "@/lib/whatsapp";
import type { BookingSource } from "@/lib/booking-source";
import { appointmentServiceRowsFromIds } from "@/lib/appointment-service-quantities";

const createSchema = z
  .object({
    professionalId: z.uuid().optional(),
    anyProfessional: z.boolean().optional(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    serviceIds: z.array(z.uuid()).min(1, "Escolha pelo menos um serviço."),
    firstName: z.string().trim().min(1, "Informe o nome."),
    lastName: z.string().trim().min(1, "Informe o sobrenome."),
    whatsapp: whatsappSchema,
  })
  .superRefine((data, ctx) => {
    if (data.anyProfessional) return;
    if (!data.professionalId) {
      ctx.addIssue({
        code: "custom",
        message: "Escolha o barbeiro.",
        path: ["professionalId"],
      });
    }
  });

export type CreatePublicAppointmentInput = z.infer<typeof createSchema>;

export type CreatePublicAppointmentResult =
  | {
      ok: true;
      appointmentId: string;
      professionalId: string;
      professionalNickname: string;
    }
  | { ok: false; error: string; status: number };

async function insertAppointment(params: {
  shopId: string;
  professionalId: string;
  customerId: string;
  firstName: string;
  lastName: string;
  whatsapp: string;
  date: string;
  startTime: string;
  endTime: string;
  serviceIds: string[];
  bookingSource: BookingSource;
}): Promise<
  | { ok: true; appointmentId: string }
  | { ok: false; error: string; status: number; conflict?: boolean }
> {
  const admin = createAdminClient();
  if (!admin) {
    return { ok: false, error: "Sistema indisponível no momento.", status: 503 };
  }

  const { data: appointment, error } = await admin
    .from("appointments")
    .insert({
      shop_id: params.shopId,
      professional_id: params.professionalId,
      customer_id: params.customerId,
      customer_first_name: params.firstName,
      customer_last_name: params.lastName,
      customer_whatsapp: params.whatsapp,
      date: params.date,
      start_time: params.startTime,
      end_time: params.endTime,
      status: "scheduled",
      is_squeeze_in: false,
      booking_source: params.bookingSource,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23P01") {
      return {
        ok: false,
        error: "Esse horário acabou de ser ocupado. Escolha outro.",
        status: 409,
        conflict: true,
      };
    }
    return {
      ok: false,
      error: "Não foi possível confirmar o agendamento.",
      status: 500,
    };
  }

  const { error: linkError } = await admin.from("appointment_services").insert(
    appointmentServiceRowsFromIds(appointment.id, params.serviceIds)
  );

  if (linkError) {
    await admin.from("appointments").delete().eq("id", appointment.id);
    return {
      ok: false,
      error: "Não foi possível salvar os serviços.",
      status: 500,
    };
  }


  return { ok: true, appointmentId: appointment.id };
}

async function resolveProfessionalNickname(
  professionalId: string
): Promise<string> {
  const admin = createAdminClient();
  if (!admin) return "—";
  const { data } = await admin
    .from("professionals")
    .select("nickname")
    .eq("id", professionalId)
    .maybeSingle();
  return data?.nickname ?? "—";
}

export async function createPublicAppointment(
  input: CreatePublicAppointmentInput,
  options?: { bookingSource?: BookingSource; expectedShopId?: string }
): Promise<CreatePublicAppointmentResult> {
  const bookingSource = options?.bookingSource ?? "site";
  const whatsapp = normalizeWhatsapp(input.whatsapp);
  if (!whatsapp) {
    return {
      ok: false,
      error: WHATSAPP_INVALID_MESSAGE,
      status: 400,
    };
  }

  const parsed = createSchema.safeParse({ ...input, whatsapp });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0].message,
      status: 400,
    };
  }

  const data = parsed.data;

  const admin = createAdminClient();
  if (!admin) {
    return { ok: false, error: "Sistema indisponível no momento.", status: 503 };
  }

  // Resolve a loja pelo profissional (ou pelo serviço, no modo "qualquer barbeiro").
  let shopId: string | null = null;
  if (data.professionalId) {
    const { data: pro } = await admin
      .from("professionals")
      .select("shop_id")
      .eq("id", data.professionalId)
      .maybeSingle();
    shopId = pro?.shop_id ?? null;
  } else if (data.serviceIds[0]) {
    const { data: service } = await admin
      .from("services")
      .select("shop_id")
      .eq("id", data.serviceIds[0])
      .maybeSingle();
    shopId = service?.shop_id ?? null;
  }

  if (!shopId) {
    return { ok: false, error: "Barbearia não encontrada.", status: 404 };
  }

  if (options?.expectedShopId && options.expectedShopId !== shopId) {
    return {
      ok: false,
      error: "Esse horário não pertence a esta barbearia.",
      status: 403,
    };
  }

  const customer = await upsertCustomer({
    firstName: data.firstName,
    lastName: data.lastName,
    whatsapp: data.whatsapp,
    shopId,
  });

  if (!customer.ok) {
    return { ok: false, error: customer.error, status: 500 };
  }

  if (data.anyProfessional) {
    const excluded: string[] = [];
    const maxAttempts = 5;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const pick = await pickLeastBusyProfessionalForSlot(
        data.date,
        data.startTime,
        data.serviceIds,
        { excludeProfessionalIds: excluded, shopId }
      );

      if (!pick.ok) return pick;

      const endMinutes =
        timeToMinutes(data.startTime) + pick.durationMinutes;
      if (endMinutes > 24 * 60) {
        return {
          ok: false,
          error:
            "O horário de término passa da meia-noite. Escolha um início mais cedo.",
          status: 400,
        };
      }

      const inserted = await insertAppointment({
        shopId,
        professionalId: pick.professionalId,
        customerId: customer.customerId,
        firstName: customer.firstName,
        lastName: customer.lastName,
        whatsapp: data.whatsapp,
        date: data.date,
        startTime: data.startTime,
        endTime: minutesToTime(endMinutes),
        serviceIds: data.serviceIds,
        bookingSource,
      });

      if (inserted.ok) {
        return {
          ok: true,
          appointmentId: inserted.appointmentId,
          professionalId: pick.professionalId,
          professionalNickname: pick.nickname,
        };
      }

      if (inserted.conflict) {
        excluded.push(pick.professionalId);
        continue;
      }

      return inserted;
    }

    return {
      ok: false,
      error: "Esse horário acabou de ser ocupado. Escolha outro.",
      status: 409,
    };
  }

  const professionalId = data.professionalId!;
  const availability = await getAvailability(
    professionalId,
    data.date,
    data.serviceIds
  );

  if (!availability.ok) {
    return {
      ok: false,
      error: availability.error,
      status: availability.status,
    };
  }

  if (!availability.slots.includes(data.startTime)) {
    return {
      ok: false,
      error: "Esse horário não está mais disponível. Escolha outro.",
      status: 409,
    };
  }

  const startMinutes = timeToMinutes(data.startTime);
  const endMinutes = startMinutes + availability.durationMinutes;

  if (endMinutes > 24 * 60) {
    return {
      ok: false,
      error:
        "O horário de término passa da meia-noite. Escolha um início mais cedo.",
      status: 400,
    };
  }

  const inserted = await insertAppointment({
    shopId,
    professionalId,
    customerId: customer.customerId,
    firstName: customer.firstName,
    lastName: customer.lastName,
    whatsapp: data.whatsapp,
    date: data.date,
    startTime: data.startTime,
    endTime: minutesToTime(endMinutes),
    serviceIds: data.serviceIds,
    bookingSource,
  });

  if (!inserted.ok) {
    return {
      ok: false,
      error: inserted.error,
      status: inserted.status,
    };
  }

  const nickname = await resolveProfessionalNickname(professionalId);

  return {
    ok: true,
    appointmentId: inserted.appointmentId,
    professionalId,
    professionalNickname: nickname,
  };
}
