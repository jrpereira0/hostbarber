import { DEFAULT_SHOP_LOGO_PATH, DEFAULT_SHOP_NAME } from "@/lib/brand";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getShopById } from "@/lib/shops/queries";

const SHARE_DESCRIPTION_MAX = 140;

const DEFAULT_SEO = {
  name: DEFAULT_SHOP_NAME,
  description: `Agende seu horário na ${DEFAULT_SHOP_NAME}.`,
  shareDescription:
    "Agende online: escolha o barbeiro, o serviço e o horário.",
  logoUrl: DEFAULT_SHOP_LOGO_PATH,
};

function truncateShareText(value: string, max = SHARE_DESCRIPTION_MAX): string {
  const text = value.replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1).replace(/\s+\S*$/, "").trimEnd();
  return `${cut || text.slice(0, max - 1)}…`;
}

function buildShareDescription(bio: string): string {
  if (!bio) return DEFAULT_SEO.shareDescription;
  return truncateShareText(bio);
}

export type ShopSeo = {
  name: string;
  description: string;
  shareDescription: string;
  logoUrl: string;
};

export async function getShopSeo(shopId?: string | null): Promise<ShopSeo> {
  if (!isSupabaseConfigured()) {
    return DEFAULT_SEO;
  }

  try {
    if (!shopId) return DEFAULT_SEO;

    const admin = createAdminClient();
    if (!admin) return DEFAULT_SEO;

    const data = await getShopById(admin, shopId);
    if (!data || !data.active) return DEFAULT_SEO;

    const name = data.name?.trim() || DEFAULT_SEO.name;
    const bio = data.bio?.trim() ?? "";
    const logoUrl = data.logo_url?.trim() || DEFAULT_SHOP_LOGO_PATH;

    return {
      name,
      description: bio || `Agende seu horário na ${name}.`,
      shareDescription: buildShareDescription(bio),
      logoUrl,
    };
  } catch {
    return DEFAULT_SEO;
  }
}
