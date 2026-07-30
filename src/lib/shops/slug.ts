import { normalizeText } from "@/lib/text";

/** Gera slug URL-friendly a partir do nome da barbearia. */
export function slugifyShopName(name: string): string {
  const base = normalizeText(name)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

  return base || "barbearia";
}

const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Normaliza texto digitado pelo usuário pro formato de slug (sem fallback). */
export function normalizeSlugInput(raw: string): string {
  return normalizeText(raw)
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/** Valida o formato de um slug já normalizado. Retorna a mensagem de erro ou null. */
export function validateSlugFormat(slug: string): string | null {
  if (slug.length < 3) {
    return "O link precisa ter pelo menos 3 caracteres.";
  }
  if (!SLUG_PATTERN.test(slug)) {
    return "Use só letras minúsculas, números e hífen, sem espaços ou acentos.";
  }
  return null;
}
