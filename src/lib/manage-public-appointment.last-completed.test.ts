import { beforeEach, describe, expect, it, vi } from "vitest";
import { getLastCompletedAppointmentByWhatsapp } from "@/lib/manage-public-appointment";

type QueryResult = { data: unknown; error: unknown };

const mockMaybeSingle = vi.fn<() => Promise<QueryResult>>();

/**
 * Query encadeável do Supabase: qualquer filtro devolve a própria query, que
 * resolve como Promise (`await query`) ou por `maybeSingle()`.
 */
function createQuery(result: () => QueryResult) {
  const query = {
    select: () => query,
    in: () => query,
    eq: () => query,
    order: () => query,
    limit: () => query,
    maybeSingle: () => mockMaybeSingle(),
    then: (
      resolve: (value: QueryResult) => unknown,
      reject?: (reason: unknown) => unknown
    ) => Promise.resolve(result()).then(resolve, reject),
  };
  return query;
}

const weekdayPriceRows = [{ service_id: "svc-1", price_cents: 6500 }];

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) =>
      createQuery(() =>
        table === "service_weekday_prices"
          ? { data: weekdayPriceRows, error: null }
          : { data: null, error: null }
      ),
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getLastCompletedAppointmentByWhatsapp", () => {
  it("retorna null quando não há atendimento concluído", async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });

    const result = await getLastCompletedAppointmentByWhatsapp(
      "5513981008852",
      "shop-1"
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toBeNull();
    }
  });

  it("retorna o último atendimento com status done", async () => {
    mockMaybeSingle.mockResolvedValue({
      data: {
        id: "apt-1",
        professional_id: "pro-1",
        date: "2026-06-20",
        start_time: "15:00:00",
        professionals: { nickname: "Chico" },
        appointment_services: [
          {
            service_id: "svc-1",
            services: {
              name: "02 - Corte Qui. - Sáb.",
              duration_minutes: 30,
              price_cents: 6500,
            },
          },
        ],
      },
      error: null,
    });

    const result = await getLastCompletedAppointmentByWhatsapp(
      "5513981008852",
      "shop-1"
    );

    expect(result.ok).toBe(true);
    if (result.ok && result.data) {
      expect(result.data).toEqual({
        appointmentId: "apt-1",
        professionalId: "pro-1",
        professionalName: "Chico",
        date: "2026-06-20",
        startTime: "15:00",
        serviceIds: ["svc-1"],
        serviceNames: ["02 - Corte Qui. - Sáb."],
      });
    }
  });

  it("retorna 400 para WhatsApp inválido", async () => {
    const result = await getLastCompletedAppointmentByWhatsapp("abc", "shop-1");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(400);
    }
  });
});
