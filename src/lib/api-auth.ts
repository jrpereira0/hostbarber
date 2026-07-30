import { NextResponse } from "next/server";

export function apiUnauthorizedResponse() {
  return NextResponse.json(
    { ok: false, error: "Não autorizado." },
    { status: 401 }
  );
}

export function apiForbiddenResponse() {
  return NextResponse.json(
    { ok: false, error: "Sem permissão." },
    { status: 403 }
  );
}

export type PublicApiAuthContext = {
  type: "public";
};

export function getAuthorizationHeader(request: Request): string | null {
  return request.headers.get("authorization");
}

/** Rotas públicas do produto (catálogo, disponibilidade) — sem autenticação externa. */
export function resolvePublicApiAuth(): {
  ok: true;
  auth: PublicApiAuthContext;
} {
  return { ok: true, auth: { type: "public" } };
}
