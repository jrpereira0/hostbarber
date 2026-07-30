import type { SupabaseClient } from "@supabase/supabase-js";
import { digitsOnlyWhatsapp } from "@/lib/whatsapp";

export const ONBOARDING_PATH = "/admin/primeiros-passos";

export type OnboardingStepId = string;

export type TourPhaseId =
  | "settings"
  | "catalog"
  | "operations"
  | "finance";

export type TourStepDef = {
  id: string;
  phase: TourPhaseId;
  /** Rota real do painel. */
  href: string;
  /** data-tour do alvo. */
  target: string;
  title: string;
  /** Texto principal do balão. */
  body: string;
  /** Detalhes didáticos. */
  bullets?: string[];
  /** Passo opcional (pode pular). */
  optional?: boolean;
};

export const TOUR_PHASES: Record<
  TourPhaseId,
  { label: string; description: string }
> = {
  settings: {
    label: "1. Configurações",
    description: "Perfil, link, horários e abas da loja",
  },
  catalog: {
    label: "2. Equipe e catálogo",
    description: "Profissionais, serviços e produtos",
  },
  operations: {
    label: "3. Operação",
    description: "Clientes, agenda e atendimento",
  },
  finance: {
    label: "4. Caixa e financeiro",
    description: "Dinheiro do dia, histórico e comissões",
  },
};

/** Guia completo pelas telas reais do painel. Textos curtos: o balão não tem scroll. */
export const TOUR_STEPS: TourStepDef[] = [
  {
    id: "settings-tabs",
    phase: "settings",
    href: "/admin/configuracoes?tab=perfil",
    target: "tour-settings-tabs",
    title: "Abas de Configurações",
    body: "Tudo da loja fica nestas abas. Vamos passar por cada uma: Perfil, Link, Horários e as demais.",
  },
  {
    id: "profile",
    phase: "settings",
    href: "/admin/configuracoes?tab=perfil",
    target: "tour-settings-profile",
    title: "Aba Perfil",
    body: "Nome, WhatsApp, endereço e logo — o que o cliente vê no site. Salve antes de seguir.",
  },
  {
    id: "link",
    phase: "settings",
    href: "/admin/configuracoes?tab=link",
    target: "tour-settings-link",
    title: "Aba Link",
    body: "Link público da agenda (ex.: /agenda/minha-loja). Personalize, salve e teste em outra aba.",
  },
  {
    id: "hours",
    phase: "settings",
    href: "/admin/configuracoes?tab=horarios",
    target: "tour-settings-hours",
    title: "Aba Horários",
    body: "Dias abertos, horário de cada um e intervalo dos slots (15–60 min). Salve para valer na agenda.",
  },
  {
    id: "exceptions",
    phase: "settings",
    href: "/admin/configuracoes?tab=excecoes",
    target: "tour-settings-exceptions",
    title: "Aba Dias especiais",
    body: "Feriados, folgas ou horário diferente em uma data. Opcional — pode pular.",
    optional: true,
  },
  {
    id: "messages",
    phase: "settings",
    href: "/admin/configuracoes?tab=mensagens",
    target: "tour-settings-messages",
    title: "Aba Mensagens",
    body: "Modelo de confirmação no WhatsApp. Dá para ligar, desligar e editar o texto.",
  },
  {
    id: "reception",
    phase: "settings",
    href: "/admin/configuracoes?tab=recepcao",
    target: "tour-settings-reception",
    title: "Aba Recepção",
    body: "Login da recepção: vê a agenda, sem financeiro. Opcional se só você usa o painel.",
    optional: true,
  },
  {
    id: "team-list",
    phase: "catalog",
    href: "/admin/profissionais",
    target: "tour-professionals-page",
    title: "Profissionais",
    body: "Lista da equipe. Use Cadastrar para o primeiro barbeiro (pode ser você).",
  },
  {
    id: "team",
    phase: "catalog",
    href: "/admin/profissionais/novo",
    target: "tour-professional-form",
    title: "Cadastrar profissional",
    body: "Preencha Dados, Acesso (e-mail/senha/%), Serviços e Horário nas abas do formulário.",
  },
  {
    id: "services-list",
    phase: "catalog",
    href: "/admin/servicos",
    target: "tour-services-page",
    title: "Serviços",
    body: "Catálogo da loja (corte, barba…). Sem serviço ativo, o cliente não agenda pelo site.",
  },
  {
    id: "services",
    phase: "catalog",
    href: "/admin/servicos/novo",
    target: "tour-service-form",
    title: "Cadastrar serviço",
    body: "Nome, duração, preço e quem realiza. A duração ocupa o tempo na agenda.",
  },
  {
    id: "products-list",
    phase: "catalog",
    href: "/admin/produtos",
    target: "tour-products-page",
    title: "Produtos",
    body: "Itens da comanda (pomada, bebida…). Se não vende produto, pode pular.",
    optional: true,
  },
  {
    id: "products",
    phase: "catalog",
    href: "/admin/produtos/novo",
    target: "tour-product-form",
    title: "Cadastrar produto",
    body: "Preço, estoque e comissão (só se houver barbeiro na venda).",
    optional: true,
  },
  {
    id: "clients",
    phase: "operations",
    href: "/admin/clientes",
    target: "tour-clients-page",
    title: "Clientes",
    body: "Base com WhatsApp, histórico e crédito. Novos clientes também entram pelo site.",
  },
  {
    id: "agenda",
    phase: "operations",
    href: "/admin",
    target: "tour-agenda-main",
    title: "Agenda do dia",
    body: "Horário vazio marca; no card abre ações/comanda. Troque o dia no calendário.",
  },
  {
    id: "cash",
    phase: "finance",
    href: "/admin",
    target: "tour-agenda-cash",
    title: "Caixa do dia",
    body: "Abra pela aba CAIXA. Sem caixa aberto a comanda não fecha. Encerre no fim do dia.",
  },
  {
    id: "cash-history",
    phase: "finance",
    href: "/admin/financeiro/caixas",
    target: "tour-caixas-page",
    title: "Histórico de caixas",
    body: "Caixas abertos e encerrados por período — útil para conferir o dia.",
  },
  {
    id: "finance",
    phase: "finance",
    href: "/admin/financeiro",
    target: "tour-finance-page",
    title: "Financeiro",
    body: "Faturamento, entradas, ticket médio. Escolha o período e clique numa métrica.",
  },
  {
    id: "commissions",
    phase: "finance",
    href: "/admin/financeiro/comissoes",
    target: "tour-commissions-page",
    title: "Comissões",
    body: "Quanto cada profissional tem a receber no período, com detalhe por atendimento.",
  },
];

export type OnboardingStatus = {
  completed: boolean;
  completedAt: string | null;
  shopDone: boolean;
  teamDone: boolean;
  servicesDone: boolean;
  productsDone: boolean;
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

  let suggestedStepId: OnboardingStepId = "commissions";
  if (!shopDone) {
    const profileOk = shopProfileDone({
      name: shop?.name ?? null,
      whatsapp: shop?.whatsapp ?? null,
      phone: shop?.phone ?? null,
      city: shop?.city ?? null,
      street: shop?.street ?? null,
      address: shop?.address ?? null,
    });
    suggestedStepId = profileOk ? "hours" : "settings-tabs";
  } else if (!teamDone) suggestedStepId = "team-list";
  else if (!servicesDone) suggestedStepId = "services-list";
  else if (!productsDone) suggestedStepId = "products-list";
  else suggestedStepId = "agenda";

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
  return `hostbarber-onboarding-tour:v2:${shopId}`;
}

/** Evento disparado quando o progresso do guia muda (sidebar escuta). */
export const TOUR_PROGRESS_EVENT = "hostbarber-tour-progress";

export function notifyTourProgress() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(TOUR_PROGRESS_EVENT));
}

export function readTourProgress(shopId: string): {
  stepId: string;
  current: number;
  total: number;
  percent: number;
} | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(tourStorageKey(shopId));
    if (!raw || raw === "welcome" || raw === "done") return null;
    const index = TOUR_STEPS.findIndex((s) => s.id === raw);
    if (index < 0) return null;
    const current = index + 1;
    const total = TOUR_STEPS.length;
    return {
      stepId: raw,
      current,
      total,
      percent: Math.round((current / total) * 100),
    };
  } catch {
    return null;
  }
}

export function isTourStepDone(
  id: string,
  status: OnboardingStatus
): boolean {
  if (
    id === "settings-tabs" ||
    id === "profile" ||
    id === "link" ||
    id === "hours" ||
    id === "exceptions" ||
    id === "messages" ||
    id === "reception"
  ) {
    return status.shopDone;
  }
  if (id === "team-list" || id === "team") return status.teamDone;
  if (id === "services-list" || id === "services") return status.servicesDone;
  if (id === "products-list" || id === "products") return status.productsDone;
  return false;
}
