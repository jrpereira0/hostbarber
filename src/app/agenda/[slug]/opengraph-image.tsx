import { ImageResponse } from "next/og";
import { createAdminClient } from "@/lib/supabase/admin";
import { getShopBySlug } from "@/lib/shops/queries";
import { DEFAULT_SHOP_LOGO_PATH, DEFAULT_SHOP_NAME } from "@/lib/brand";
import { getShopSeo } from "@/lib/get-shop-seo";

export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

type Props = { params: Promise<{ slug: string }> };

async function resolveLogoSrc(pathOrUrl: string): Promise<string | null> {
  try {
    if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
    const { getSiteUrl } = await import("@/lib/site-url");
    return new URL(
      pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`,
      getSiteUrl()
    ).toString();
  } catch {
    return null;
  }
}

export default async function Image({ params }: Props) {
  const { slug } = await params;
  const admin = createAdminClient();
  const shop = admin ? await getShopBySlug(admin, slug) : null;
  const seo = await getShopSeo(shop?.id);
  const name = seo.name || DEFAULT_SHOP_NAME;
  const logoSrc =
    (await resolveLogoSrc(seo.logoUrl)) ||
    (await resolveLogoSrc(DEFAULT_SHOP_LOGO_PATH));

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#0a0a0a",
          color: "#f5f5f5",
          fontFamily: "sans-serif",
        }}
      >
        {logoSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoSrc}
            alt=""
            width={160}
            height={160}
            style={{ objectFit: "contain", marginBottom: 32 }}
          />
        ) : null}
        <div style={{ fontSize: 56, fontWeight: 700, textAlign: "center" }}>
          {name}
        </div>
        <div style={{ fontSize: 28, marginTop: 16, color: "#a3a3a3" }}>
          Agende seu horário
        </div>
      </div>
    ),
    { ...size }
  );
}
