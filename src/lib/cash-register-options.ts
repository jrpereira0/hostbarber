import type { SupabaseClient } from "@supabase/supabase-js";
import type { CashRegisterResponsibleOption } from "@/components/admin/open-cash-register-dialog";

export async function loadCashRegisterResponsibleOptions(
  admin: SupabaseClient,
  shopId: string,
  ownerUserId: string
): Promise<CashRegisterResponsibleOption[]> {
  const [{ data: ownerProfile }, { data: professionals }] = await Promise.all([
    admin
      .from("profiles")
      .select("full_name")
      .eq("id", ownerUserId)
      .maybeSingle(),
    admin
      .from("professionals")
      .select("id, nickname")
      .eq("shop_id", shopId)
      .eq("active", true)
      .order("nickname"),
  ]);

  const options: CashRegisterResponsibleOption[] = [];

  const ownerName = ownerProfile?.full_name?.trim();
  if (ownerName) {
    options.push({ id: "owner", label: ownerName });
  }

  for (const pro of professionals ?? []) {
    options.push({ id: pro.id, label: pro.nickname });
  }

  return options;
}
