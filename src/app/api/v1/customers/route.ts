import { NextRequest, NextResponse } from "next/server";
import { safeApiRoute } from "@/lib/api/safe-route";
import { withProtectedApiRouteGuard } from "@/lib/api/with-api-guard";
import { getCustomerByWhatsapp } from "@/lib/lookup-customer";
import { resolveShopIdFromRequest } from "@/lib/resolve-public-shop";
import {
  normalizeWhatsapp,
  WHATSAPP_INVALID_MESSAGE,
} from "@/lib/whatsapp";

/**
 * GET /api/v1/customers?whatsapp=...&shop=slug
 */
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
        scope: "customers:read",
        rateLimit: "whatsappSensitive",
        whatsapp,
        shopId: shopRef.shopId,
      },
      async ({ auth }) => {
        const shopId = auth.type === "client" || auth.type === "admin"
          ? auth.shopId
          : shopRef.shopId;
        const result = await getCustomerByWhatsapp(whatsapp, shopId);
        if (!result.ok) {
          return NextResponse.json(
            { ok: false, error: result.error },
            { status: result.httpStatus }
          );
        }
        return NextResponse.json({
          ok: true,
          found: result.found,
          customer: result.customer,
        });
      }
    );
  });
}
