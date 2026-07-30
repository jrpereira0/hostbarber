import { createAdminClient } from "@/lib/supabase/admin";
import { getShopById, getShopBySlug } from "@/lib/shops/queries";

/**
 * Resolve a loja pública a partir do query param `shop` (slug).
 * Usado pelas rotas /api/v1 e /api/agenda/*.
 */
export async function resolveShopIdFromRequest(
  request: Request
): Promise<{ shopId: string; slug: string } | null> {
  const url = new URL(request.url);
  const slug = url.searchParams.get("shop")?.trim().toLowerCase() ?? "";
  if (!slug) return null;

  const admin = createAdminClient();
  if (!admin) return null;

  const shop = await getShopBySlug(admin, slug);
  if (!shop || !shop.active) return null;

  return { shopId: shop.id, slug: shop.slug };
}

/** Lê slug do body JSON (`shop`) quando a rota é POST sem query. */
export function readShopSlugFromBody(body: unknown): string | null {
  if (typeof body !== "object" || body === null) return null;
  const shop = (body as { shop?: unknown }).shop;
  if (typeof shop !== "string") return null;
  const slug = shop.trim().toLowerCase();
  return slug || null;
}

export async function resolveShopIdFromSlug(
  slug: string
): Promise<{ shopId: string; slug: string } | null> {
  const admin = createAdminClient();
  if (!admin) return null;
  const shop = await getShopBySlug(admin, slug);
  if (!shop || !shop.active) return null;
  return { shopId: shop.id, slug: shop.slug };
}

export async function resolveShopSlugById(
  shopId: string
): Promise<string | null> {
  const admin = createAdminClient();
  if (!admin) return null;
  const shop = await getShopById(admin, shopId);
  return shop?.slug ?? null;
}
