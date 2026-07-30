import type { SupabaseClient } from "@supabase/supabase-js";
import type { ShopSettingsRow } from "@/lib/shops/settings";

export type PublicShopRef = {
  id: string;
  slug: string;
  name: string;
};

const SHOP_SELECT =
  "id, name, slug, bio, whatsapp, phone, instagram, facebook, website, logo_url, cep, street, address_number, address_complement, neighborhood, city, state, address, slot_step_minutes, confirmation_whatsapp_message, confirmation_whatsapp_enabled, active";

/** Loja ativa pelo slug da URL pública (`/agenda/[slug]`). */
export async function getShopBySlug(
  client: SupabaseClient,
  slug: string
): Promise<ShopSettingsRow | null> {
  const normalized = slug.trim().toLowerCase();
  if (!normalized) return null;

  const { data, error } = await client
    .from("shops")
    .select(SHOP_SELECT)
    .eq("slug", normalized)
    .eq("active", true)
    .maybeSingle();

  if (error || !data) return null;
  return data as ShopSettingsRow;
}

export async function getShopById(
  client: SupabaseClient,
  shopId: string
): Promise<ShopSettingsRow | null> {
  const { data, error } = await client
    .from("shops")
    .select(SHOP_SELECT)
    .eq("id", shopId)
    .maybeSingle();

  if (error || !data) return null;
  return data as ShopSettingsRow;
}

/** Loja pelo slug, mesmo se inativa (para mensagem de bloqueio). */
export async function getShopBySlugAnyStatus(
  client: SupabaseClient,
  slug: string
): Promise<ShopSettingsRow | null> {
  const normalized = slug.trim().toLowerCase();
  if (!normalized) return null;

  const { data, error } = await client
    .from("shops")
    .select(SHOP_SELECT)
    .eq("slug", normalized)
    .maybeSingle();

  if (error || !data) return null;
  return data as ShopSettingsRow;
}

/** True se a loja existe e está ativa. */
export async function isShopActive(
  client: SupabaseClient,
  shopId: string
): Promise<boolean> {
  if (!shopId.trim()) return false;
  const { data, error } = await client
    .from("shops")
    .select("id")
    .eq("id", shopId)
    .eq("active", true)
    .maybeSingle();
  return !error && Boolean(data?.id);
}

/**
 * Loja padrão só para redirect de `/agenda` → `/agenda/{slug}`.
 * Usa a barbearia ativa mais antiga.
 */
export async function getDefaultPublicShopRef(
  client: SupabaseClient
): Promise<PublicShopRef | null> {
  const { data: first } = await client
    .from("shops")
    .select("id, slug, name")
    .eq("active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!first?.id || !first.slug) return null;
  return {
    id: first.id,
    slug: first.slug,
    name: first.name?.trim() || "Barbearia",
  };
}

/** @deprecated Use getShopBySlug / getDefaultPublicShopRef. */
export async function getPublicBookingShopId(
  client: SupabaseClient
): Promise<string | null> {
  const shop = await getDefaultPublicShopRef(client);
  return shop?.id ?? null;
}
