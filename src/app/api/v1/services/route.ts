import { NextRequest, NextResponse } from "next/server";
import { safeApiRoute } from "@/lib/api/safe-route";
import { withPublicApiRouteGuard } from "@/lib/api/with-api-guard";
import { TIMEZONE, weekdayOf } from "@/lib/availability";
import { BOOKING_DAY_LABELS } from "@/lib/catalog-booking";
import { getShopCatalog } from "@/lib/get-shop-catalog";
import { resolveShopIdFromRequest } from "@/lib/resolve-public-shop";
import {
  groupWeekdayPrices,
  priceForWeekday,
} from "@/lib/service-weekday-prices";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { z } from "zod";

const querySchema = z.object({
  professionalId: z.string().uuid().optional(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

/**
 * GET /api/v1/services — lista serviços ativos (dados úteis pra integração).
 * Público. Scope opcional: catalog:read.
 * Query: professionalId?, date? (AAAA-MM-DD).
 *
 * Sem photoPosition / bookingCount / weekdayPrices / priceLabel (ruído ou só do site).
 * Preços: `prices` agrupados; com `?date=`, também `priceCentsForDate`.
 */
export async function GET(request: NextRequest) {
  return safeApiRoute(() =>
    withPublicApiRouteGuard(
      request,
      { scope: "catalog:read", rateLimit: "catalog" },
      async () => {
        if (!isSupabaseConfigured()) {
          return NextResponse.json(
            { error: "Sistema indisponível no momento." },
            { status: 503 }
          );
        }

        const parsed = querySchema.safeParse({
          professionalId:
            request.nextUrl.searchParams.get("professionalId") || undefined,
          date: request.nextUrl.searchParams.get("date") || undefined,
        });
        if (!parsed.success) {
          return NextResponse.json(
            {
              error:
                "Parâmetros inválidos. Use professionalId (UUID) e/ou date (AAAA-MM-DD).",
            },
            { status: 400 }
          );
        }

        const shopRef = await resolveShopIdFromRequest(request);
        if (!shopRef) {
          return NextResponse.json(
            { error: "Informe a barbearia (?shop=slug)." },
            { status: 400 }
          );
        }

        const catalog = await getShopCatalog(shopRef.shopId);
        const { professionalId, date } = parsed.data;
        const weekday = date ? weekdayOf(date) : null;

        const professionalsByServiceId = new Map<
          string,
          {
            id: string;
            nickname: string;
            photoUrl: string | null;
          }[]
        >();
        for (const pro of catalog.professionals) {
          const thin = {
            id: pro.id,
            nickname: pro.nickname,
            photoUrl: pro.photoUrl,
          };
          for (const sid of pro.serviceIds) {
            const list = professionalsByServiceId.get(sid) ?? [];
            list.push(thin);
            professionalsByServiceId.set(sid, list);
          }
        }

        let services = catalog.services;

        if (professionalId) {
          const pro = catalog.professionals.find((p) => p.id === professionalId);
          if (!pro) {
            return NextResponse.json(
              { error: "Profissional não encontrado." },
              { status: 404 }
            );
          }
          const allowed = new Set(pro.serviceIds);
          services = services.filter((s) => allowed.has(s.id));
        }

        return NextResponse.json({
          ok: true,
          timezone: TIMEZONE,
          dayLabels: [...BOOKING_DAY_LABELS],
          date: date ?? null,
          weekday,
          services: services.map((s) => {
            const grouped = groupWeekdayPrices(s.weekdayPrices);
            const priceForDate =
              weekday !== null && s.weekdayPrices.length > 0
                ? priceForWeekday(s.weekdayPrices, weekday)
                : null;
            const professionals = professionalsByServiceId.get(s.id) ?? [];

            return {
              id: s.id,
              name: s.name,
              description: s.description,
              durationMinutes: s.durationMinutes,
              /** Menor preço da semana (referência). */
              priceCents: s.priceCents,
              /** Preço do dia em `?date=` (null sem data ou sem preço naquele dia). */
              priceCentsForDate: priceForDate,
              priceFrom: s.priceFrom,
              /**
               * Preços agrupados por valor.
               * Ex.: [{ priceCents: 6000, weekdays: [1,2,3], days: ["Seg","Ter","Qua"] }]
               */
              prices: grouped.map(([priceCents, weekdays]) => ({
                priceCents,
                weekdays,
                days: weekdays.map((d) => BOOKING_DAY_LABELS[d]),
              })),
              photoUrl: s.photoUrl,
              professionalIds: professionals.map((p) => p.id),
              professionals,
            };
          }),
        });
      }
    )
  );
}
