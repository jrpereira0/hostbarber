/** Login do painel da plataforma (superadmin). */
export const PLATFORM_LOGIN_PATH = "/plataforma/login";

export function platformLoginUrl(erro?: string): string {
  if (!erro) return PLATFORM_LOGIN_PATH;
  return `${PLATFORM_LOGIN_PATH}?erro=${erro}`;
}
