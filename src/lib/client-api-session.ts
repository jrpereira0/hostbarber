import { createHmac, timingSafeEqual } from "node:crypto";
import { normalizeWhatsapp } from "@/lib/whatsapp";

export const CLIENT_SESSION_COOKIE = "agenda_client_session";
/** Sessão do cliente no site /agenda (~14 dias no mesmo aparelho). */
export const CLIENT_SESSION_TTL_MS = 14 * 24 * 60 * 60 * 1000;

export type ClientSessionPayload = {
  whatsapp: string;
  /** Loja em que o cliente autenticou (isolamento multi-loja). */
  shopId: string;
  exp: number;
};

function getSessionSecret(): string | null {
  const secret = process.env.CLIENT_SESSION_SECRET?.trim();
  if (secret && secret.length >= 32) return secret;
  return null;
}

function signPayload(payload: string): string {
  const secret = getSessionSecret();
  if (!secret) {
    throw new Error("CLIENT_SESSION_SECRET indisponível.");
  }
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function createClientSessionToken(
  whatsapp: string,
  shopId: string
): string | null {
  const normalized = normalizeWhatsapp(whatsapp);
  const shop = shopId.trim();
  if (!normalized || !shop) return null;

  const payload: ClientSessionPayload = {
    whatsapp: normalized,
    shopId: shop,
    exp: Date.now() + CLIENT_SESSION_TTL_MS,
  };

  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${signPayload(encoded)}`;
}

export function verifyClientSessionToken(
  token: string | undefined | null
): ClientSessionPayload | null {
  if (!token) return null;

  const parts = token.split(".");
  if (parts.length !== 2) return null;

  const [encoded, signature] = parts;
  if (!encoded || !signature) return null;

  let expected: string;
  try {
    expected = signPayload(encoded);
  } catch {
    return null;
  }

  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8")
    ) as Partial<ClientSessionPayload>;

    if (
      typeof payload.whatsapp !== "string" ||
      typeof payload.shopId !== "string" ||
      typeof payload.exp !== "number" ||
      !payload.shopId.trim() ||
      !normalizeWhatsapp(payload.whatsapp)
    ) {
      return null;
    }

    if (payload.exp <= Date.now()) return null;

    return {
      whatsapp: normalizeWhatsapp(payload.whatsapp)!,
      shopId: payload.shopId.trim(),
      exp: payload.exp,
    };
  } catch {
    return null;
  }
}

export function getClientSessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: CLIENT_SESSION_TTL_MS / 1000,
  };
}

/** Extrai o token Bearer cru (sem validar). */
export function extractBearerToken(request: Request): string | null {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return null;
  const token = authorization.slice("Bearer ".length).trim();
  return token || null;
}

/**
 * Lê sessão do cliente: cookie (site) ou Bearer com token de sessão (app).
 */
export function readClientSessionFromRequest(
  request: Request
): ClientSessionPayload | null {
  const bearer = extractBearerToken(request);
  if (bearer) {
    const fromBearer = verifyClientSessionToken(bearer);
    if (fromBearer) return fromBearer;
  }

  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) return null;

  const match = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${CLIENT_SESSION_COOKIE}=`));

  if (!match) return null;

  const token = decodeURIComponent(match.slice(CLIENT_SESSION_COOKIE.length + 1));
  return verifyClientSessionToken(token);
}
