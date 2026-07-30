import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { safeApiRoute } from "@/lib/api/safe-route";
import { withProtectedApiRouteGuard } from "@/lib/api/with-api-guard";
import {
  applyAppointmentStatusUpdate,
  appointmentWorkflowStatusSchema,
} from "@/lib/update-appointment-status";

const bodySchema = z.object({
  status: appointmentWorkflowStatusSchema,
});

type RouteContext = { params: Promise<{ id: string }> };

/**
 * PUT /api/v1/appointments/:id/status — atualizar status do agendamento.
 * Privada. Scope: appointments:update.
 * Aceita chave de API ou sessão do dono no painel (não sessão do cliente).
 */
export async function PUT(request: NextRequest, context: RouteContext) {
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

    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Status inválido. Use scheduled, confirmed, cancelled ou done.",
        },
        { status: 400 }
      );
    }

    return withProtectedApiRouteGuard(
      request,
      {
        scope: "appointments:update",
        rateLimit: "appointmentMutate",
      },
      async ({ auth }) => {
        if (auth.type === "client") {
          return NextResponse.json(
            {
              ok: false,
              error:
                "Cliente não pode alterar status por esta rota. Use cancelar ou remarcar.",
            },
            { status: 403 }
          );
        }

        if (auth.type === "admin" && auth.role === "barber") {
          return NextResponse.json(
            { ok: false, error: "Sem permissão." },
            { status: 403 }
          );
        }

        const result = await applyAppointmentStatusUpdate({
          appointmentId: id,
          status: parsed.data.status,
          asOwner: true,
          shopId: auth.shopId,
          restrictToProfessionalId: null,
        });

        if (!result.ok) {
          return NextResponse.json(
            { ok: false, error: result.error },
            { status: result.status }
          );
        }

        revalidatePath("/admin");
        revalidatePath("/agenda");
        return NextResponse.json({
          ok: true,
          appointmentId: id,
          status: parsed.data.status,
        });
      }
    );
  });
}
