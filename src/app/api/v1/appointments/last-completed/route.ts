import { NextRequest, NextResponse } from "next/server";
import { safeApiRoute } from "@/lib/api/safe-route";
import { withProtectedApiRouteGuard } from "@/lib/api/with-api-guard";
import { getLastCompletedAppointmentByWhatsapp } from "@/lib/manage-public-appointment";
import { resolveShopIdFromRequest } from "@/lib/resolve-public-shop";
import {
  normalizeWhatsapp,
  WHATSAPP_INVALID_MESSAGE,
} from "@/lib/whatsapp";

// GET /api/v1/appointments/last-completed?whatsapp=...&shop=slug
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
        const result = await getLastCompletedAppointmentByWhatsapp(
          whatsapp,
          shopId
        );

        if (!result.ok) {
          return NextResponse.json(
            { error: result.error },
            { status: result.status }
          );
        }

        if (!result.data) {
          return NextResponse.json({
            found: false,
            lastAppointment: null,
          });
        }

        return NextResponse.json({
          found: true,
          lastAppointment: result.data,
        });
      }
    );
  });
}
