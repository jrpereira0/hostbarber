/** Escopos internos das rotas do produto (site /agenda e sessão do cliente). */

export const API_SCOPES = [
  "catalog:read",
  "availability:read",
  "customers:read",
  "customers:update",
  "appointments:read",
  "appointments:create",
  "appointments:update",
  "appointments:cancel",
] as const;

export type ApiScope = (typeof API_SCOPES)[number];

export function hasScope(scopes: readonly string[], required: ApiScope): boolean {
  return scopes.includes(required);
}
