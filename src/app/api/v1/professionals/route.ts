import { NextRequest, NextResponse } from "next/server";
import { safeApiRoute } from "@/lib/api/safe-route";
import { withPublicApiRouteGuard } from "@/lib/api/with-api-guard";
import { TIMEZONE } from "@/lib/availability";
import { getShopCatalog } from "@/lib/get-shop-catalog";
import { resolveShopIdFromRequest } from "@/lib/resolve-public-shop";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { z } from "zod";

const querySchema = z.object({
  serviceId: z.string().uuid().optional(),
});

/**
 * GET /api/v1/professionals — lista profissionais ativos (só dados do profissional).
 * Público. Scope opcional: catalog:read.
 * Query: serviceId? (só quem realiza aquele serviço).
 *
 * Relação com serviços: apenas `serviceIds` (IDs). Detalhes dos serviços
 * vêm de GET /api/v1/services — recursos separados, sem embutir um no outro.
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
          serviceId:
            request.nextUrl.searchParams.get("serviceId") || undefined,
        });
        if (!parsed.success) {
          return NextResponse.json(
            { error: "serviceId inválido." },
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
        const { serviceId } = parsed.data;

        if (serviceId) {
          const serviceExists = catalog.services.some((s) => s.id === serviceId);
          if (!serviceExists) {
            return NextResponse.json(
              { error: "Serviço não encontrado." },
              { status: 404 }
            );
          }
        }

        let professionals = catalog.professionals;
        if (serviceId) {
          professionals = professionals.filter((p) =>
            p.serviceIds.includes(serviceId)
          );
        }

        return NextResponse.json({
          ok: true,
          timezone: TIMEZONE,
          professionals: professionals.map((p) => ({
            id: p.id,
            nickname: p.nickname,
            photoUrl: p.photoUrl,
            /** IDs dos serviços que realiza — detalhes em GET /services. */
            serviceIds: p.serviceIds,
          })),
        });
      }
    )
  );
}
