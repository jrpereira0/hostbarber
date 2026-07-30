/** Origem canônica do site (URLs absolutas para Open Graph / WhatsApp). */
const LOCAL_SITE_URL = "http://localhost:3000";

export function getSiteUrl(): URL {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) {
    try {
      return new URL(explicit);
    } catch {
      // ignora valor inválido
    }
  }

  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) {
    return new URL(`https://${vercel}`);
  }

  return new URL(LOCAL_SITE_URL);
}
