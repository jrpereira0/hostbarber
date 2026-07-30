import { NextResponse } from "next/server";

type RateLimitConfig = {
  limit: number;
  windowMs: number;
};

type Entry = {
  count: number;
  resetAt: number;
};

const store = new Map<string, Entry>();

function pruneExpired(now: number) {
  if (store.size < 5000) return;
  for (const [key, entry] of store) {
    if (entry.resetAt <= now) store.delete(key);
  }
}

export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() || "unknown";
  }
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

export type RateLimitResult =
  | { ok: true }
  | { ok: false; retryAfterSeconds: number };

export function checkRateLimit(
  key: string,
  config: RateLimitConfig
): RateLimitResult {
  const now = Date.now();
  pruneExpired(now);

  const entry = store.get(key);
  if (!entry || entry.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + config.windowMs });
    return { ok: true };
  }

  if (entry.count >= config.limit) {
    return {
      ok: false,
      retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)),
    };
  }

  entry.count += 1;
  return { ok: true };
}

export const PUBLIC_API_RATE_LIMITS = {
  catalog: { limit: 60, windowMs: 15 * 60 * 1000 },
  availability: { limit: 60, windowMs: 15 * 60 * 1000 },
  whatsappSensitive: { limit: 60, windowMs: 15 * 60 * 1000 },
  /** Início de sessão do cliente (WhatsApp) por IP. */
  clientSessionStartIp: { limit: 30, windowMs: 15 * 60 * 1000 },
  /** Início de sessão do cliente por WhatsApp + loja. */
  clientSessionStartWhatsapp: { limit: 20, windowMs: 15 * 60 * 1000 },
  appointmentCreateIp: { limit: 5, windowMs: 60 * 60 * 1000 },
  appointmentCreateWhatsapp: { limit: 3, windowMs: 60 * 60 * 1000 },
  appointmentMutate: { limit: 10, windowMs: 15 * 60 * 1000 },
} as const;

export type PublicApiRateLimitBucket = keyof typeof PUBLIC_API_RATE_LIMITS;

function tooManyRequests(retryAfterSeconds: number) {
  return NextResponse.json(
    {
      error:
        "Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente de novo.",
    },
    {
      status: 429,
      headers: { "Retry-After": String(retryAfterSeconds) },
    }
  );
}

export function enforcePublicApiRateLimit(
  request: Request,
  bucket: PublicApiRateLimitBucket,
  keySuffix?: string
): NextResponse | null {
  const ip = getClientIp(request);
  const key = keySuffix
    ? `${bucket}:${keySuffix}`
    : `${bucket}:ip:${ip}`;

  const result = checkRateLimit(key, PUBLIC_API_RATE_LIMITS[bucket]);
  if (!result.ok) {
    return tooManyRequests(result.retryAfterSeconds);
  }

  return null;
}
