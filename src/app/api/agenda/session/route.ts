import { NextRequest, NextResponse } from "next/server";
import { safeApiRoute } from "@/lib/api/safe-route";
import {
  CLIENT_SESSION_COOKIE,
  createClientSessionToken,
  getClientSessionCookieOptions,
  readClientSessionFromRequest,
  verifyClientSessionToken,
} from "@/lib/client-api-session";
import { enforcePublicApiRateLimit } from "@/lib/rate-limit";
import {
  readShopSlugFromBody,
  resolveShopIdFromRequest,
  resolveShopIdFromSlug,
} from "@/lib/resolve-public-shop";
import { createAdminClient } from "@/lib/supabase/admin";
import { isShopActive } from "@/lib/shops/queries";
import {
  normalizeWhatsapp,
  WHATSAPP_INVALID_MESSAGE,
} from "@/lib/whatsapp";

// GET /api/agenda/session — sessão atual do cliente
export async function GET(request: NextRequest) {
  return safeApiRoute(async () => {
    const session = readClientSessionFromRequest(request);
    if (!session) {
      return NextResponse.json({ ok: true, authenticated: false });
    }

    const admin = createAdminClient();
    if (!admin || !(await isShopActive(admin, session.shopId))) {
      const response = NextResponse.json({
        ok: true,
        authenticated: false,
      });
      response.cookies.set(CLIENT_SESSION_COOKIE, "", {
        ...getClientSessionCookieOptions(),
        maxAge: 0,
      });
      return response;
    }

    const shopRef = await resolveShopIdFromRequest(request);
    if (shopRef && shopRef.shopId !== session.shopId) {
      return NextResponse.json({ ok: true, authenticated: false });
    }

    return NextResponse.json({
      ok: true,
      authenticated: true,
      whatsapp: session.whatsapp,
      shopId: session.shopId,
      expiresAt: session.exp,
    });
  });
}

// POST /api/agenda/session — grava sessão ao informar o WhatsApp
export async function POST(request: NextRequest) {
  return safeApiRoute(async () => {
    const limitedIp = enforcePublicApiRateLimit(request, "clientSessionStartIp");
    if (limitedIp) return limitedIp;

    let json: unknown;
    try {
      json = await request.json();
    } catch {
      return NextResponse.json(
        { ok: false, error: "Corpo da requisição inválido." },
        { status: 400 }
      );
    }

    const body =
      typeof json === "object" && json !== null
        ? (json as { whatsapp?: unknown })
        : {};

    const whatsapp =
      typeof body.whatsapp === "string"
        ? normalizeWhatsapp(body.whatsapp)
        : null;

    if (!whatsapp) {
      return NextResponse.json(
        { ok: false, error: WHATSAPP_INVALID_MESSAGE },
        { status: 400 }
      );
    }

    const shopSlug =
      readShopSlugFromBody(json) ??
      request.nextUrl.searchParams.get("shop")?.trim().toLowerCase() ??
      null;
    if (!shopSlug) {
      return NextResponse.json(
        { ok: false, error: "Informe a barbearia (shop)." },
        { status: 400 }
      );
    }

    const shop = await resolveShopIdFromSlug(shopSlug);
    if (!shop) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Barbearia não encontrada ou desativada. Não é possível agendar agora.",
        },
        { status: 404 }
      );
    }

    const limitedWhatsapp = enforcePublicApiRateLimit(
      request,
      "clientSessionStartWhatsapp",
      `${shop.shopId}:${whatsapp}`
    );
    if (limitedWhatsapp) return limitedWhatsapp;

    const token = createClientSessionToken(whatsapp, shop.shopId);
    if (!token) {
      return NextResponse.json(
        { ok: false, error: "Não foi possível iniciar a sessão." },
        { status: 503 }
      );
    }

    const session = verifyClientSessionToken(token);
    const response = NextResponse.json({
      ok: true,
      whatsapp,
      shopId: shop.shopId,
      expiresAt: session?.exp ?? null,
    });
    response.cookies.set(
      CLIENT_SESSION_COOKIE,
      token,
      getClientSessionCookieOptions()
    );
    return response;
  });
}

// DELETE /api/agenda/session — sair (limpa cookie)
export async function DELETE() {
  return safeApiRoute(async () => {
    const response = NextResponse.json({ ok: true });
    response.cookies.set(CLIENT_SESSION_COOKIE, "", {
      ...getClientSessionCookieOptions(),
      maxAge: 0,
    });
    return response;
  });
}
