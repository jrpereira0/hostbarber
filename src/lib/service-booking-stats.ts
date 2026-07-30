import { createAdminClient } from "@/lib/supabase/admin";

/** Quantas vezes cada serviço entrou em agendamentos normais (não cancelados). */
export async function loadServiceBookingCounts(
  shopId: string
): Promise<Map<string, number>> {
  const admin = createAdminClient();
  if (!admin || !shopId) return new Map();

  const { data, error } = await admin
    .from("appointments")
    .select("appointment_services(service_id)")
    .eq("shop_id", shopId)
    .neq("status", "cancelled")
    .eq("is_comanda_extra", false)
    .eq("is_squeeze_in", false);

  if (error) {
    return new Map();
  }

  const counts = new Map<string, number>();
  for (const row of data ?? []) {
    const raw = row.appointment_services as
      | { service_id: string }
      | { service_id: string }[]
      | null;
    const links = Array.isArray(raw) ? raw : raw ? [raw] : [];
    for (const link of links) {
      if (!link?.service_id) continue;
      counts.set(link.service_id, (counts.get(link.service_id) ?? 0) + 1);
    }
  }

  return counts;
}
