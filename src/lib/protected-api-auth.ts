import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { type ApiScope } from "@/lib/api-scopes";
import {
  apiForbiddenResponse,
  apiUnauthorizedResponse,
  getAuthorizationHeader,
} from "@/lib/api-auth";
import {
  extractBearerToken,
  readClientSessionFromRequest,
  verifyClientSessionToken,
} from "@/lib/client-api-session";
import { isShopActive } from "@/lib/shops/queries";
import { normalizeWhatsapp } from "@/lib/whatsapp";

export type AdminApiAuthContext = {
  type: "admin";
  userId: string;
  role: "owner" | "barber";
  shopId: string;
};

export type ClientApiAuthContext = {
  type: "client";
  whatsapp: string;
  shopId: string;
};

export type ProtectedApiAuthContext =
  | AdminApiAuthContext
  | ClientApiAuthContext;

const CLIENT_SESSION_SCOPES: ApiScope[] = [
  "customers:read",
  "customers:update",
  "appointments:read",
  "appointments:create",
  "appointments:update",
  "appointments:cancel",
];

const BARBER_SESSION_SCOPES: ApiScope[] = [
  "catalog:read",
  "availability:read",
];

function adminHasScope(role: "owner" | "barber", scope: ApiScope): boolean {
  if (role === "owner") return true;
  return BARBER_SESSION_SCOPES.includes(scope);
}

function clientHasScope(scope: ApiScope): boolean {
  return CLIENT_SESSION_SCOPES.includes(scope);
}

function buildClientAuth(
  whatsapp: string,
  shopId: string,
  requiredScope: ApiScope,
  requestedWhatsapp?: string | null,
  expectedShopId?: string | null
): ClientApiAuthContext | null {
  if (!clientHasScope(requiredScope)) return null;

  if (expectedShopId && expectedShopId !== shopId) return null;

  if (requestedWhatsapp) {
    const requested = normalizeWhatsapp(requestedWhatsapp);
    if (!requested || requested !== whatsapp) return null;
  }

  return { type: "client", whatsapp, shopId };
}

export async function getAdminApiSession(): Promise<AdminApiAuthContext | null> {
  const supabase = await createClient();
  if (!supabase) return null;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, shop_id")
    .eq("id", user.id)
    .maybeSingle();

  if (
    (profile?.role !== "owner" && profile?.role !== "barber") ||
    !profile.shop_id
  ) {
    return null;
  }

  const active = await isShopActive(supabase, profile.shop_id);
  if (!active) return null;

  return {
    type: "admin",
    userId: user.id,
    role: profile.role,
    shopId: profile.shop_id as string,
  };
}

export type ProtectedAuthOptions = {
  /** WhatsApp da requisição — obrigatório para sessão de cliente. */
  whatsapp?: string | null;
  /** Loja esperada (slug resolvido). Cliente só autentica na mesma loja. */
  shopId?: string | null;
};

async function assertClientShopActive(
  shopId: string
): Promise<boolean> {
  const admin = createAdminClient();
  if (!admin) return false;
  return isShopActive(admin, shopId);
}

export async function resolveProtectedApiAuth(
  request: Request,
  requiredScope: ApiScope,
  options: ProtectedAuthOptions = {}
): Promise<
  | { ok: true; auth: ProtectedApiAuthContext }
  | { ok: false; response: NextResponse }
> {
  const authorization = getAuthorizationHeader(request);

  if (authorization !== null) {
    if (!authorization.startsWith("Bearer ")) {
      return { ok: false, response: apiUnauthorizedResponse() };
    }

    const bearer = extractBearerToken(request);
    const bearerSession = verifyClientSessionToken(bearer);
    if (bearerSession) {
      if (!(await assertClientShopActive(bearerSession.shopId))) {
        return { ok: false, response: apiForbiddenResponse() };
      }
      const clientAuth = buildClientAuth(
        bearerSession.whatsapp,
        bearerSession.shopId,
        requiredScope,
        options.whatsapp,
        options.shopId
      );
      if (clientAuth) {
        return { ok: true, auth: clientAuth };
      }
      return { ok: false, response: apiForbiddenResponse() };
    }

    return { ok: false, response: apiUnauthorizedResponse() };
  }

  const clientSession = readClientSessionFromRequest(request);
  if (clientSession && !(await assertClientShopActive(clientSession.shopId))) {
    return { ok: false, response: apiForbiddenResponse() };
  }

  const clientAuth = clientSession
    ? buildClientAuth(
        clientSession.whatsapp,
        clientSession.shopId,
        requiredScope,
        options.whatsapp,
        options.shopId
      )
    : null;

  if (clientAuth) {
    return { ok: true, auth: clientAuth };
  }

  const admin = await getAdminApiSession();
  if (admin && adminHasScope(admin.role, requiredScope)) {
    if (options.shopId && options.shopId !== admin.shopId) {
      return { ok: false, response: apiForbiddenResponse() };
    }
    return { ok: true, auth: admin };
  }

  if (admin) {
    return { ok: false, response: apiForbiddenResponse() };
  }

  if (clientSession && !clientHasScope(requiredScope)) {
    return { ok: false, response: apiForbiddenResponse() };
  }

  if (clientSession && (options.whatsapp || options.shopId)) {
    return { ok: false, response: apiForbiddenResponse() };
  }

  return { ok: false, response: apiUnauthorizedResponse() };
}

export function protectedAuthRateLimitKey(
  auth: ProtectedApiAuthContext
): string | undefined {
  if (auth.type === "client") {
    return `client:${auth.shopId}:${auth.whatsapp}`;
  }
  if (auth.type === "admin") return `admin:${auth.userId}`;
  return undefined;
}
