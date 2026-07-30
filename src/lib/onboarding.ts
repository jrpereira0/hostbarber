import type { SupabaseClient } from "@supabase/supabase-js";
import { digitsOnlyWhatsapp } from "@/lib/whatsapp";

export const ONBOARDING_PATH = "/admin/primeiros-passos";

export type OnboardingStepId =
  | "welcome"
  | "profile"
  | "hours"
  | "team"
  | "services"
  | "products"
  | "cash"
  | "done";

export type TourStepDef = {
  id: Exclude<OnboardingStepId, "welcome" | "done">;
  /** Rota real do painel. */
  href: string;
  /** data-tour do alvo. */
  target: string;
  title: string;
  body: string;
  /** Passo opcional (produtos). */
  optional?: boolean;
};

/** Ordem do guia nas telas reais. */
export const TOUR_STEPS: TourStepDef[] = [
  {
    id: "profile",
    href: "/admin/configuracoes?tab=perfil",
    target: "tour-settings-profile",
    title: "Perfil da barbearia",
    body: "Preencha nome, WhatsApp e endereço. Depois salve e toque em Próximo.",
  },
  {
    id: "hours",
    href: "/admin/configuracoes?tab=horarios",
    target: "tour-settings-hours",
    title: "Horários de funcionamento",
    body: "Confira os dias abertos e o intervalo dos slots. Salve e siga em frente.",
  },
  {
    id: "team",
    href: "/admin/profissionais/novo",
    target: "tour-professional-form",
    title: "Cadastre um profissional",
    body: "Pode ser você. Defina acesso, comissão e horários. Salve para continuar.",
  },
  {
    id: "services",
    href: "/admin/servicos/novo",
    target: "tour-service-form",
    title: "Cadastre um serviço",
    body: "Corte, barba ou combo — com preço e duração. Sem isso o cliente não agenda.",
  },
  {
    id: "products",
    href: "/admin/produtos/novo",
    target: "tour-product-form",
    title: "Cadastre um produto",
    body: "Opcional. Pomadas, bebidas… Se não vende agora, pule esta etapa.",
    optional: true,
  },
  {
    id: "cash",
    href: "/admin",
    target: "tour-agenda-cash",
    title: "Caixa do dia",
    body: "Aqui você abre o caixa, acompanha as entradas e encerra no fim do dia. Sem caixa aberto, a comanda não fecha.",
  },
];

export type OnboardingStatus = {
  completed: boolean;
  completedAt: string | null;
  shopDone: boolean;
  teamDone: boolean;
  servicesDone: boolean;
  productsDone: boolean;
  /** Próximo passo sugerido com base nos dados. */
  suggestedStepId: OnboardingStepId;
};

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

  let suggestedStepId: OnboardingStepId = "cash";
  if (!shopDone) {
    const profileOk = shopProfileDone({
      name: shop?.name ?? null,
      whatsapp: shop?.whatsapp ?? null,
      phone: shop?.phone ?? null,
      city: shop?.city ?? null,
      street: shop?.street ?? null,
      address: shop?.address ?? null,
    });
    suggestedStepId = profileOk ? "hours" : "profile";
  } else if (!teamDone) suggestedStepId = "team";
  else if (!servicesDone) suggestedStepId = "services";
  else if (!productsDone) suggestedStepId = "products";
  else suggestedStepId = "cash";

  if (completed) suggestedStepId = "done";

  return {
    completed,
    completedAt,
    shopDone,
    teamDone,
    servicesDone,
    productsDone,
    suggestedStepId,
  };
}

export function tourStorageKey(shopId: string) {
  return `hostbarber-onboarding-tour:${shopId}`;
}
