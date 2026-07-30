import type { SupabaseClient } from "@supabase/supabase-js";
import { digitsOnlyWhatsapp } from "@/lib/whatsapp";

export const ONBOARDING_PATH = "/admin/primeiros-passos";

export type OnboardingStepId =
  | "shop"
  | "team"
  | "services"
  | "products"
  | "cash";

export type OnboardingStepStatus = {
  id: OnboardingStepId;
  done: boolean;
  /** Produtos podem ser pulados sem bloquear o restante. */
  optional?: boolean;
};

export type OnboardingStatus = {
  completed: boolean;
  completedAt: string | null;
  steps: OnboardingStepStatus[];
  /** Quantos passos obrigatórios estão prontos (sem contar caixa). */
  requiredDone: number;
  requiredTotal: number;
  /** Falta o essencial (equipe ou serviços) — vale redirecionar. */
  needsGuidedSetup: boolean;
  /** Próximo passo ainda incompleto (ou caixa se o resto estiver ok). */
  nextStepId: OnboardingStepId;
};

const REQUIRED_BEFORE_CASH: OnboardingStepId[] = [
  "shop",
  "team",
  "services",
];

function shopProfileDone(shop: {
  name: string | null;
  whatsapp: string | null;
  phone: string | null;
  city: string | null;
  street: string | null;
  address: string | null;
}): boolean {
  const name = shop.name?.trim() ?? "";
  const phone = digitsOnlyWhatsapp(shop.whatsapp || shop.phone || "");
  const hasPlace = Boolean(
    shop.city?.trim() || shop.street?.trim() || shop.address?.trim()
  );
  return name.length >= 2 && phone.length >= 10 && hasPlace;
}

export async function getOnboardingStatus(
  supabase: SupabaseClient,
  shopId: string
): Promise<OnboardingStatus> {
  const [
    { data: shop },
    { count: professionalCount },
    { count: serviceCount },
    { count: productCount },
    { count: openHoursCount },
  ] = await Promise.all([
    supabase
      .from("shops")
      .select(
        "name, whatsapp, phone, city, street, address, onboarding_completed_at"
      )
      .eq("id", shopId)
      .maybeSingle(),
    supabase
      .from("professionals")
      .select("id", { count: "exact", head: true })
      .eq("shop_id", shopId)
      .eq("active", true),
    supabase
      .from("services")
      .select("id", { count: "exact", head: true })
      .eq("shop_id", shopId)
      .eq("active", true),
    supabase
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("shop_id", shopId)
      .eq("active", true),
    supabase
      .from("business_hours")
      .select("id", { count: "exact", head: true })
      .eq("shop_id", shopId)
      .eq("active", true),
  ]);

  const completedAt = shop?.onboarding_completed_at ?? null;
  const completed = Boolean(completedAt);

  const shopDone =
    shopProfileDone({
      name: shop?.name ?? null,
      whatsapp: shop?.whatsapp ?? null,
      phone: shop?.phone ?? null,
      city: shop?.city ?? null,
      street: shop?.street ?? null,
      address: shop?.address ?? null,
    }) && (openHoursCount ?? 0) > 0;

  const teamDone = (professionalCount ?? 0) >= 1;
  const servicesDone = (serviceCount ?? 0) >= 1;
  const productsDone = (productCount ?? 0) >= 1;

  const steps: OnboardingStepStatus[] = [
    { id: "shop", done: shopDone },
    { id: "team", done: teamDone },
    { id: "services", done: servicesDone },
    { id: "products", done: productsDone, optional: true },
    { id: "cash", done: completed },
  ];

  const requiredDone = REQUIRED_BEFORE_CASH.filter((id) =>
    steps.find((s) => s.id === id)?.done
  ).length;

  const needsGuidedSetup = !completed && (!teamDone || !servicesDone);

  let nextStepId: OnboardingStepId = "cash";
  if (!shopDone) nextStepId = "shop";
  else if (!teamDone) nextStepId = "team";
  else if (!servicesDone) nextStepId = "services";
  else if (!productsDone && !completed) nextStepId = "products";
  else nextStepId = "cash";

  return {
    completed,
    completedAt,
    steps,
    requiredDone,
    requiredTotal: REQUIRED_BEFORE_CASH.length,
    needsGuidedSetup,
    nextStepId,
  };
}
