import { NextRequest, NextResponse, after } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { safeApiRoute } from "@/lib/api/safe-route";
import { withProtectedApiRouteGuard } from "@/lib/api/with-api-guard";
import { createPublicAppointment } from "@/lib/create-public-appointment";
import {
  LIST_APPOINTMENTS_MODES,
  listPublicAppointmentsByWhatsapp,
  type ListAppointmentsMode,
} from "@/lib/manage-public-appointment";
import {
  normalizeWhatsapp,
  WHATSAPP_INVALID_MESSAGE,
  whatsappSchema,
} from "@/lib/whatsapp";
import { resolveShopIdFromRequest } from "@/lib/resolve-public-shop";
import { bookingPathForSlug } from "@/lib/booking-path";

const listQuerySchema = z.object({
  mode: z.enum(LIST_APPOINTMENTS_MODES).default("upcoming"),
});

const bodySchema = z
  .object({
    professionalId: z.uuid("professionalId inválido.").optional(),
    anyProfessional: z.boolean().optional(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date deve ser AAAA-MM-DD."),
    startTime: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "startTime inválido."),
    serviceIds: z
      .array(z.uuid("serviceIds contém um id inválido."))
      .min(1, "Informe ao menos um serviço."),
    firstName: z.string().trim().min(1, "Informe o nome."),
    lastName: z.string().trim().min(1, "Informe o sobrenome."),
    whatsapp: whatsappSchema,
  })
  .superRefine((data, ctx) => {
    if (data.anyProfessional) return;
    if (!data.professionalId) {
      ctx.addIssue({
        code: "custom",
        message: "Informe o barbeiro ou anyProfessional.",
        path: ["professionalId"],
      });
    }
  });

// GET /api/v1/appointments?whatsapp=...&mode=upcoming|history|all
export async function GET(request: NextRequest) {
  return safeApiRoute(async () => {
    const raw = request.nextUrl.searchParams.get("whatsapp") ?? "";
    const whatsapp = normalizeWhatsapp(raw);
    if (!whatsapp) {
      return NextResponse.json(
        { ok: false, error: WHATSAPP_INVALID_MESSAGE },
        { status: 400 }
      );
    }

    const modeRaw = request.nextUrl.searchParams.get("mode") ?? undefined;
    const parsedMode = listQuerySchema.safeParse({ mode: modeRaw });
    if (!parsedMode.success) {
      return NextResponse.json(
        {
          ok: false,
          error: "mode inválido. Use upcoming, history ou all.",
        },
        { status: 400 }
      );
    }
    const mode: ListAppointmentsMode = parsedMode.data.mode;

    const shopRef = await resolveShopIdFromRequest(request);
    if (!shopRef) {
      return NextResponse.json(
        { ok: false, error: "Informe a barbearia (?shop=slug)." },
        { status: 400 }
      );
    }

    return withProtectedApiRouteGuard(
      request,
      {
        scope: "appointments:read",
        rateLimit: "whatsappSensitive",
        whatsapp,
        shopId: shopRef.shopId,
      },
      async ({ auth }) => {
        const shopId =
          auth.type === "client" || auth.type === "admin"
            ? auth.shopId
            : shopRef.shopId;

        const result = await listPublicAppointmentsByWhatsapp(whatsapp, {
          mode,
          shopId,
        });

        if (!result.ok) {
          return NextResponse.json(
            { error: result.error },
            { status: result.status }
          );
        }

        return NextResponse.json({
          ok: true,
          mode: result.data.mode,
          appointments: result.data.appointments,
        });
      }
    );
  });
}

// POST /api/v1/appointments — site exige sessão do cliente (WhatsApp)
export async function POST(request: NextRequest) {
  return safeApiRoute(async () => {
    let json: unknown;
    try {
      json = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Corpo da requisição inválido." },
        { status: 400 }
      );
    }

    if (typeof json !== "object" || json === null) {
      return NextResponse.json(
        { error: "Corpo da requisição inválido." },
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
        { error: WHATSAPP_INVALID_MESSAGE },
        { status: 400 }
      );
    }

    const parsed = bodySchema.safeParse({ ...raw, whatsapp });
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const shopRef = await resolveShopIdFromRequest(request);
    const shopFromBody =
      typeof raw.shop === "string" ? raw.shop.trim().toLowerCase() : "";
    let shopId = shopRef?.shopId ?? null;
    let shopSlug = shopRef?.slug ?? shopFromBody;

    if (!shopId && shopFromBody) {
      const { resolveShopIdFromSlug } = await import(
        "@/lib/resolve-public-shop"
      );
      const resolved = await resolveShopIdFromSlug(shopFromBody);
      shopId = resolved?.shopId ?? null;
      shopSlug = resolved?.slug ?? shopFromBody;
    }

    if (!shopId) {
      return NextResponse.json(
        { error: "Informe a barbearia (shop)." },
        { status: 400 }
      );
    }

    return withProtectedApiRouteGuard(
      request,
      {
        scope: "appointments:create",
        rateLimit: "appointmentCreateIp",
        whatsapp: parsed.data.whatsapp,
        shopId,
      },
      async ({ auth }) => {
        const expectedShopId =
          auth.type === "client" || auth.type === "admin"
            ? auth.shopId
            : shopId!;

        const result = await createPublicAppointment(parsed.data, {
          bookingSource: "site",
          expectedShopId,
        });

        if (!result.ok) {
          return NextResponse.json(
            { error: result.error },
            { status: result.status }
          );
        }

        after(() => {
          revalidatePath("/admin");
          revalidatePath("/agenda");
          if (shopSlug) {
            revalidatePath(bookingPathForSlug(shopSlug));
          }
        });
        return NextResponse.json({
          ok: true,
          appointmentId: result.appointmentId,
          professionalId: result.professionalId,
          professionalNickname: result.professionalNickname,
        });
      }
    );
  });
}
