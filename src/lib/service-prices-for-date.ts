import type { SupabaseClient } from "@supabase/supabase-js";
import { weekdayOf } from "@/lib/availability";
import { serviceMatchesDateBand } from "@/lib/catalog-booking";

export type ServicePricingContext = {
  weekday: number;
  priceOnDateByServiceId: Map<string, number>;
  servicesWithWeekdayPrices: Set<string>;
};

export type ServicePriceRow = {
  id: string;
  name: string;
  duration_minutes: number;
  price_cents: number;
  photo_url?: string | null;
  photo_position?: string | null;
};

export async function loadServicePricingContext(
  admin: SupabaseClient,
  date: string,
  serviceIds?: string[],
  shopId?: string
): Promise<ServicePricingContext> {
  const weekday = weekdayOf(date);

  let pricesForDay: { service_id: string; price_cents: number }[] | null = null;
  let configuredRows: { service_id: string }[] | null = null;

  if (shopId) {
    let pricesQuery = admin
      .from("service_weekday_prices")
      .select("service_id, price_cents, services!inner(shop_id)")
      .eq("weekday", weekday)
      .eq("services.shop_id", shopId);

    let configuredQuery = admin
      .from("service_weekday_prices")
      .select("service_id, services!inner(shop_id)")
      .eq("services.shop_id", shopId);

    if (serviceIds?.length) {
      pricesQuery = pricesQuery.in("service_id", serviceIds);
      configuredQuery = configuredQuery.in("service_id", serviceIds);
    }

    const [pricesResult, configuredResult] = await Promise.all([
      pricesQuery,
      configuredQuery,
    ]);
    pricesForDay = pricesResult.data;
    configuredRows = configuredResult.data;
  } else {
    let pricesQuery = admin
      .from("service_weekday_prices")
      .select("service_id, price_cents")
      .eq("weekday", weekday);

    let configuredQuery = admin
      .from("service_weekday_prices")
      .select("service_id");

    if (serviceIds?.length) {
      pricesQuery = pricesQuery.in("service_id", serviceIds);
      configuredQuery = configuredQuery.in("service_id", serviceIds);
    }

    const [pricesResult, configuredResult] = await Promise.all([
      pricesQuery,
      configuredQuery,
    ]);
    pricesForDay = pricesResult.data;
    configuredRows = configuredResult.data;
  }

  return {
    weekday,
    priceOnDateByServiceId: new Map(
      (pricesForDay ?? []).map((row) => [row.service_id, row.price_cents])
    ),
    servicesWithWeekdayPrices: new Set(
      (configuredRows ?? []).map((row) => row.service_id)
    ),
  };
}

export function resolvePriceCentsForServiceOnDate(
  service: Pick<ServicePriceRow, "id" | "name" | "price_cents">,
  ctx: ServicePricingContext
): number | null {
  if (ctx.servicesWithWeekdayPrices.has(service.id)) {
    return ctx.priceOnDateByServiceId.get(service.id) ?? null;
  }
  if (serviceMatchesDateBand(service.name, ctx.weekday)) {
    return service.price_cents;
  }
  return null;
}

export function resolvePriceCentsOrFallback(
  service: Pick<ServicePriceRow, "id" | "name" | "price_cents">,
  ctx: ServicePricingContext
): number {
  return resolvePriceCentsForServiceOnDate(service, ctx) ?? service.price_cents;
}

export type AdminServiceCatalogItem = {
  id: string;
  name: string;
  durationMinutes: number;
  priceCents: number;
  photoUrl: string | null;
  photoPosition: string | null;
  bookingCount: number;
};

export function buildAdminServicesCatalogForDate(
  services: ServicePriceRow[],
  ctx: ServicePricingContext,
  bookingCounts: Map<string, number> = new Map()
): AdminServiceCatalogItem[] {
  return services.flatMap((service) => {
    const priceCents = resolvePriceCentsForServiceOnDate(service, ctx);
    if (priceCents === null) return [];
    return [
      {
        id: service.id,
        name: service.name,
        durationMinutes: service.duration_minutes,
        priceCents,
        photoUrl: service.photo_url ?? null,
        photoPosition: service.photo_position ?? null,
        bookingCount: bookingCounts.get(service.id) ?? 0,
      },
    ];
  });
}
