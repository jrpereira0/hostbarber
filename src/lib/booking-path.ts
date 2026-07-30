/** Prefixo da agenda pública do cliente. */
export const BOOKING_PATH = "/agenda";

/** URL pública de uma barbearia: `/agenda/{slug}`. */
export function bookingPathForSlug(slug: string): string {
  const clean = slug.trim().replace(/^\/+|\/+$/g, "");
  return `${BOOKING_PATH}/${encodeURIComponent(clean)}`;
}

/** Acrescenta `?shop=` (slug) em URLs da API do site. */
export function withShopQuery(url: string, shopSlug: string): string {
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}shop=${encodeURIComponent(shopSlug)}`;
}
