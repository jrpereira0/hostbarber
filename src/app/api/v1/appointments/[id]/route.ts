import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { safeApiRoute } from "@/lib/api/safe-route";
import { withProtectedApiRouteGuard } from "@/lib/api/with-api-guard";
import {
  cancelPublicAppointment,
  updatePublicAppointment,
} from "@/lib/manage-public-appointment";
import {
  normalizeWhatsapp,
  WHATSAPP_INVALID_MESSAGE,
  whatsappSchema,
} from "@/lib/whatsapp";

const updateBodySchema = z.object({
  whatsapp: whatsappSchema,
  professionalId: z.uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  serviceIds: z.array(z.uuid()).min(1),
});

type RouteContext = { params: Promise<{ id: string }> };

// PATCH /api/v1/appointments/:id — remarcar agendamento do cliente
export async function PATCH(request: NextRequest, context: RouteContext) {
  return safeApiRoute(async () => {
    const { id } = await context.params;

    let json: unknown;
    try {
      json = await request.json();
    } catch {
      return NextResponse.json(
        { ok: false, error: "Corpo da requisição inválido." },
        { status: 400 }
      );
    }

    if (typeof json !== "object" || json === null) {
      return NextResponse.json(
        { ok: false, error: "Corpo da requisição inválido." },
        { status: 400 }
      );
    }

    const raw = json as Record<string, unknown>;
    const whatsapp =
      typeof raw.whatsapp === "string"
        ? normalizeWhatsapp(raw.whatsapp)
        : null;
    if (!whatsapp) {
      return NextResponse.json(
        { ok: false, error: WHATSAPP_INVALID_MESSAGE },
        { status: 400 }
      );
    }

    const parsed = updateBodySchema.safeParse({ ...raw, whatsapp });
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    return withProtectedApiRouteGuard(
      request,
      {
        scope: "appointments:update",
        rateLimit: "appointmentMutate",
        whatsapp,
      },
      async ({ auth }) => {
        const result = await updatePublicAppointment(
          id,
          parsed.data,
          auth.shopId
        );

        if (!result.ok) {
          return NextResponse.json(
            { error: result.error },
            { status: result.status }
          );
        }

        revalidatePath("/admin");
        revalidatePath("/agenda");
        return NextResponse.json({ ok: true, appointmentId: result.data.id });
      }
    );
  });
}

// DELETE /api/v1/appointments/:id?whatsapp=... — cancelar agendamento do cliente
export async function DELETE(request: NextRequest, context: RouteContext) {
  return safeApiRoute(async () => {
    const { id } = await context.params;
    const raw = request.nextUrl.searchParams.get("whatsapp") ?? "";
    const whatsapp = normalizeWhatsapp(raw);
    if (!whatsapp) {
      return NextResponse.json(
        { ok: false, error: WHATSAPP_INVALID_MESSAGE },
        { status: 400 }
      );
    }

    return withProtectedApiRouteGuard(
      request,
      {
        scope: "appointments:cancel",
        rateLimit: "appointmentMutate",
        whatsapp,
      },
      async ({ auth }) => {
        const result = await cancelPublicAppointment(id, whatsapp, auth.shopId);

        if (!result.ok) {
          return NextResponse.json(
            { error: result.error },
            { status: result.status }
          );
        }

        revalidatePath("/admin");
        revalidatePath("/agenda");
        return NextResponse.json({ ok: true, appointmentId: result.data.id });
      }
    );
  });
}
