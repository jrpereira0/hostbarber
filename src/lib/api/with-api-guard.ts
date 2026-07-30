import { NextResponse } from "next/server";
import type { ApiScope } from "@/lib/api-scopes";
import {
  resolvePublicApiAuth,
  type PublicApiAuthContext,
} from "@/lib/api-auth";
import {
  protectedAuthRateLimitKey,
  resolveProtectedApiAuth,
  type ProtectedApiAuthContext,
} from "@/lib/protected-api-auth";
import {
  enforcePublicApiRateLimit,
  type PublicApiRateLimitBucket,
} from "@/lib/rate-limit";

type PublicHandler = (context: {
  auth: PublicApiAuthContext;
}) => Promise<NextResponse>;

type ProtectedHandler = (context: {
  auth: ProtectedApiAuthContext;
}) => Promise<NextResponse>;

type PublicGuardOptions = {
  scope: ApiScope;
  rateLimit: PublicApiRateLimitBucket;
  rateLimitKeySuffix?: (auth: PublicApiAuthContext) => string | undefined;
};

type ProtectedGuardOptions = {
  scope: ApiScope;
  rateLimit: PublicApiRateLimitBucket;
  whatsapp?: string | null;
  shopId?: string | null;
};

export async function withPublicApiRouteGuard(
  request: Request,
  options: PublicGuardOptions,
  handler: PublicHandler
): Promise<NextResponse> {
  const authResult = resolvePublicApiAuth();

  const limited = enforcePublicApiRateLimit(
    request,
    options.rateLimit,
    options.rateLimitKeySuffix?.(authResult.auth)
  );
  if (limited) return limited;

  return handler({ auth: authResult.auth });
}

export async function withProtectedApiRouteGuard(
  request: Request,
  options: ProtectedGuardOptions,
  handler: ProtectedHandler
): Promise<NextResponse> {
  const authResult = await resolveProtectedApiAuth(request, options.scope, {
    whatsapp: options.whatsapp,
    shopId: options.shopId,
  });
  if (!authResult.ok) {
    return authResult.response;
  }

  const limited = enforcePublicApiRateLimit(
    request,
    options.rateLimit,
    protectedAuthRateLimitKey(authResult.auth)
  );
  if (limited) return limited;

  return handler({ auth: authResult.auth });
}
