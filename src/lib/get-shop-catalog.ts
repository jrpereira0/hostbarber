import { DEFAULT_SHOP_LOGO_PATH, DEFAULT_SHOP_NAME } from "@/lib/brand";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { formatShopAddress, formatTime, WEEKDAYS } from "@/lib/format";
import {
  DEFAULT_PHOTO_POSITION,
  normalizePhotoPosition,
} from "@/lib/photo-position";
import { minWeekdayPrice } from "@/lib/service-weekday-prices";
import { loadServiceBookingCounts } from "@/lib/service-booking-stats";
import { getShopById } from "@/lib/shops/queries";
import { buildShopAddress } from "@/lib/shops/settings";

export type ShopProfile = {
  id: string;
  slug: string;
  name: string;
  bio: string;
  address: string;
  whatsapp: string;
  instagram: string | null;
  logoUrl: string | null;
  slotStepMinutes: number;
};

export type PublicProfessional = {
  id: string;
  nickname: string;
  photoUrl: string | null;
  photoPosition: string;
  serviceIds: string[];
};

export type PublicService = {
  id: string;
  name: string;
  description: string;
  photoUrl: string | null;
  photoPosition: string;
  durationMinutes: number;
  priceCents: number;
  priceFrom: boolean;
  weekdayPrices: { weekday: number; priceCents: number }[];
  bookingCount: number;
};

export type BusinessHourRow = {
  weekday: number;
  label: string;
  active: boolean;
  openTime: string;
  closeTime: string;
};

export type ShopCatalog = {
  shop: ShopProfile;
  professionals: PublicProfessional[];
  services: PublicService[];
  businessHours: BusinessHourRow[];
};

function emptyShopCatalog(): ShopCatalog {
  return {
    shop: {
      id: "",
      slug: "",
      name: DEFAULT_SHOP_NAME,
      bio: "",
      address: "",
      whatsapp: "",
      instagram: null,
      logoUrl: DEFAULT_SHOP_LOGO_PATH,
      slotStepMinutes: 15,
    },
    professionals: [],
    services: [],
    businessHours: [],
  };
}

export async function getShopCatalog(shopId: string): Promise<ShopCatalog> {
  if (!isSupabaseConfigured() || !shopId.trim()) {
    return emptyShopCatalog();
  }

  try {
    const supabase = createAdminClient();
    if (!supabase) return emptyShopCatalog();

    const shopRow = await getShopById(supabase, shopId);
    if (!shopRow || !shopRow.active) return emptyShopCatalog();

    const [{ data: professionals }, { data: services }, { data: businessHours }, bookingCounts] =
      await Promise.all([
        supabase
          .from("professionals")
          .select("id, nickname, photo_url, photo_position")
          .eq("shop_id", shopId)
          .eq("active", true)
          .order("nickname"),
        supabase
          .from("services")
          .select(
            "id, name, description, photo_url, photo_position, duration_minutes, price_cents, price_from"
          )
          .eq("shop_id", shopId)
          .eq("active", true)
          .order("name"),
        supabase
          .from("business_hours")
          .select("*")
          .eq("shop_id", shopId)
          .order("weekday"),
        loadServiceBookingCounts(shopId),
      ]);

    const professionalIds = (professionals ?? []).map((p) => p.id);
    const serviceIds = (services ?? []).map((s) => s.id);

    const [{ data: links }, { data: weekdayPrices }] = await Promise.all([
      professionalIds.length > 0 && serviceIds.length > 0
        ? supabase
            .from("professional_services")
            .select("professional_id, service_id")
            .in("professional_id", professionalIds)
            .in("service_id", serviceIds)
        : Promise.resolve({ data: [] as { professional_id: string; service_id: string }[] }),
      serviceIds.length > 0
        ? supabase
            .from("service_weekday_prices")
            .select("service_id, weekday, price_cents")
            .in("service_id", serviceIds)
        : Promise.resolve({ data: [] as { service_id: string; weekday: number; price_cents: number }[] }),
    ]);

    const weekdayPricesByService = new Map<
      string,
      { weekday: number; priceCents: number }[]
    >();
    for (const row of weekdayPrices ?? []) {
      const list = weekdayPricesByService.get(row.service_id) ?? [];
      list.push({ weekday: row.weekday, priceCents: row.price_cents });
      weekdayPricesByService.set(row.service_id, list);
    }

    const serviceIdsByProfessional = new Map<string, string[]>();
    const professionalIdSet = new Set((professionals ?? []).map((p) => p.id));
    const serviceIdSet = new Set((services ?? []).map((s) => s.id));
    for (const link of links ?? []) {
      if (
        !professionalIdSet.has(link.professional_id) ||
        !serviceIdSet.has(link.service_id)
      ) {
        continue;
      }
      const list = serviceIdsByProfessional.get(link.professional_id) ?? [];
      list.push(link.service_id);
      serviceIdsByProfessional.set(link.professional_id, list);
    }

    return {
      shop: {
        id: shopRow.id,
        slug: shopRow.slug,
        name: shopRow.name?.trim() || DEFAULT_SHOP_NAME,
        bio: shopRow.bio?.trim() ?? "",
        address:
          buildShopAddress(shopRow) ||
          formatShopAddress({
            street: shopRow.street ?? "",
            addressNumber: shopRow.address_number ?? "",
            addressComplement: shopRow.address_complement ?? "",
            neighborhood: shopRow.neighborhood ?? "",
            city: shopRow.city ?? "",
            state: shopRow.state ?? "",
          }),
        whatsapp: shopRow.whatsapp?.replace(/\D/g, "") ?? "",
        instagram: shopRow.instagram?.trim() || null,
        logoUrl: shopRow.logo_url?.trim() || DEFAULT_SHOP_LOGO_PATH,
        slotStepMinutes: shopRow.slot_step_minutes ?? 15,
      },
      professionals: (professionals ?? []).map((p) => ({
        id: p.id,
        nickname: p.nickname,
        photoUrl: p.photo_url,
        photoPosition: normalizePhotoPosition(
          p.photo_position ?? DEFAULT_PHOTO_POSITION
        ),
        serviceIds: serviceIdsByProfessional.get(p.id) ?? [],
      })),
      services: (services ?? []).map((s) => {
        const prices = (weekdayPricesByService.get(s.id) ?? []).sort(
          (a, b) => a.weekday - b.weekday
        );
        return {
          id: s.id,
          name: s.name,
          description: s.description ?? "",
          photoUrl: s.photo_url,
          photoPosition: normalizePhotoPosition(
            s.photo_position ?? DEFAULT_PHOTO_POSITION
          ),
          durationMinutes: s.duration_minutes,
          priceCents:
            prices.length > 0 ? minWeekdayPrice(prices) : s.price_cents,
          priceFrom: s.price_from ?? false,
          weekdayPrices: prices,
          bookingCount: bookingCounts.get(s.id) ?? 0,
        };
      }),
      businessHours: (businessHours ?? []).map((b) => ({
        weekday: b.weekday,
        label: WEEKDAYS[b.weekday],
        active: b.active,
        openTime: formatTime(b.open_time),
        closeTime: formatTime(b.close_time),
      })),
    };
  } catch {
    return emptyShopCatalog();
  }
}
