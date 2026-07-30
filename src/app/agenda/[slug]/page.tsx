import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { todayInTimezone } from "@/lib/availability";
import { bookingPathForSlug } from "@/lib/booking-path";
import { getShopCatalog } from "@/lib/get-shop-catalog";
import { getShopSeo } from "@/lib/get-shop-seo";
import { createAdminClient } from "@/lib/supabase/admin";
import { getShopBySlug, getShopBySlugAnyStatus } from "@/lib/shops/queries";
import { BookingPage } from "@/components/booking/booking-page";
import { BookingUnavailable } from "@/components/booking/booking-unavailable";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const admin = createAdminClient();
  if (!admin) {
    return { title: { absolute: "Agenda" } };
  }

  const shop = await getShopBySlug(admin, slug);
  if (!shop) {
    return { title: { absolute: "Agenda" } };
  }

  const { name, shareDescription } = await getShopSeo(shop.id);
  const path = bookingPathForSlug(shop.slug);

  return {
    title: { absolute: name },
    description: shareDescription,
    openGraph: {
      type: "website",
      locale: "pt_BR",
      url: path,
      siteName: name,
      title: name,
      description: shareDescription,
    },
    twitter: {
      card: "summary_large_image",
      title: name,
      description: shareDescription,
    },
  };
}

export default async function AgendaShopPage({ params }: PageProps) {
  const { slug } = await params;
  const admin = createAdminClient();
  if (!admin) return <BookingUnavailable />;

  const decoded = decodeURIComponent(slug);
  const shop = await getShopBySlug(admin, decoded);
  if (!shop) {
    const inactive = await getShopBySlugAnyStatus(admin, decoded);
    if (inactive && !inactive.active) {
      return (
        <BookingUnavailable
          title="Agenda desativada"
          description="Esta barbearia está temporariamente fora do ar. Tente novamente mais tarde ou fale com a unidade."
          showRetry={false}
        />
      );
    }
    notFound();
  }

  // Normaliza slug na URL (ex.: maiúsculas → canônico).
  if (shop.slug !== slug) {
    redirect(bookingPathForSlug(shop.slug));
  }

  let catalog;
  try {
    catalog = await getShopCatalog(shop.id);
  } catch {
    return <BookingUnavailable />;
  }

  if (!catalog.shop.id) {
    return <BookingUnavailable />;
  }

  return <BookingPage catalog={catalog} today={todayInTimezone()} />;
}
