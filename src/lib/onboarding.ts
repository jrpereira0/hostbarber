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

/** Guia completo pelas telas reais do painel. */
export const TOUR_STEPS: TourStepDef[] = [
  {
    id: "settings-tabs",
    phase: "settings",
    href: "/admin/configuracoes?tab=perfil",
    target: "tour-settings-tabs",
    title: "As abas de Configurações",
    body: "Tudo da loja fica aqui, separado por abas. Você troca de aba no topo — Perfil, Link, Horários, Dias especiais, Mensagens e Recepção.",
    bullets: [
      "Perfil: nome, WhatsApp, endereço e logo",
      "Link: endereço público da agenda (/agenda/sua-loja)",
      "Horários: dias e intervalos de atendimento",
      "Dias especiais: feriados ou fechamentos pontuais",
      "Mensagens: texto de confirmação no WhatsApp",
      "Recepção: acesso da recepção (sem financeiro)",
    ],
  },
  {
    id: "profile",
    phase: "settings",
    href: "/admin/configuracoes?tab=perfil",
    target: "tour-settings-profile",
    title: "Aba Perfil",
    body: "Preencha os dados que o cliente vê no site. Salve antes de seguir.",
    bullets: [
      "Nome da barbearia e WhatsApp de contato",
      "Endereço completo (CEP preenche a rua)",
      "Logo e Instagram, se quiser",
    ],
  },
  {
    id: "link",
    phase: "settings",
    href: "/admin/configuracoes?tab=link",
    target: "tour-settings-link",
    title: "Aba Link",
    body: "Este é o link que você envia para o cliente agendar. Pode personalizar o final da URL (slug).",
    bullets: [
      "Exemplo: /agenda/minha-barbearia",
      "Depois de salvar, teste o link em outra aba",
    ],
  },
  {
    id: "hours",
    phase: "settings",
    href: "/admin/configuracoes?tab=horarios",
    target: "tour-settings-hours",
    title: "Aba Horários",
    body: "Defina quando a loja abre e o intervalo dos horários na agenda (15, 30, 45 ou 60 min).",
    bullets: [
      "Marque os dias abertos e o horário de cada um",
      "O intervalo define os slots que o cliente vê",
      "Salve para valer na agenda e no site",
    ],
  },
  {
    id: "exceptions",
    phase: "settings",
    href: "/admin/configuracoes?tab=excecoes",
    target: "tour-settings-exceptions",
    title: "Aba Dias especiais",
    body: "Use para feriados, folgas ou horários diferentes só em uma data. Não é obrigatório agora.",
    bullets: [
      "Pode fechar a loja inteira ou só um profissional",
      "Dá para liberar um horário especial no dia",
    ],
    optional: true,
  },
  {
    id: "messages",
    phase: "settings",
    href: "/admin/configuracoes?tab=mensagens",
    target: "tour-settings-messages",
    title: "Aba Mensagens",
    body: "Texto pronto para confirmar o horário no WhatsApp do cliente. Você pode editar o modelo.",
    bullets: [
      "Dá para ligar ou desligar a mensagem",
      "Use variáveis do sistema no texto, se aparecerem",
    ],
  },
  {
    id: "reception",
    phase: "settings",
    href: "/admin/configuracoes?tab=recepcao",
    target: "tour-settings-reception",
    title: "Aba Recepção",
    body: "Cadastre quem atende na recepção. Ela vê a agenda toda, mas não o financeiro.",
    bullets: [
      "Opcional se só você opera o painel",
      "Cria login com e-mail e senha para a recepção",
    ],
    optional: true,
  },
  {
    id: "team-list",
    phase: "catalog",
    href: "/admin/profissionais",
    target: "tour-professionals-page",
    title: "Profissionais",
    body: "Aqui fica a lista da equipe. Cada barbeiro pode ter login, comissão e horários próprios.",
    bullets: [
      "Use “Cadastrar” para adicionar o primeiro",
      "Depois você edita foto, serviços e permissões",
    ],
  },
  {
    id: "team",
    phase: "catalog",
    href: "/admin/profissionais/novo",
    target: "tour-professional-form",
    title: "Cadastrar profissional",
    body: "Pode ser você mesmo. Preencha os dados, o acesso e a grade de atendimento.",
    bullets: [
      "Aba Dados: nome, apelido e contato",
      "Aba Acesso: e-mail, senha e % de comissão",
      "Aba Serviços: o que ele realiza",
      "Aba Horário: quando ele atende",
    ],
  },
  {
    id: "services-list",
    phase: "catalog",
    href: "/admin/servicos",
    target: "tour-services-page",
    title: "Serviços",
    body: "Catálogo do que a loja oferece. Sem serviço ativo, o cliente não agenda pelo site.",
    bullets: [
      "Corte, barba, combo… cada um com duração",
      "Preço pode variar por dia da semana",
    ],
  },
  {
    id: "services",
    phase: "catalog",
    href: "/admin/servicos/novo",
    target: "tour-service-form",
    title: "Cadastrar serviço",
    body: "Informe nome, duração e preço. Vincule aos profissionais que fazem esse serviço.",
    bullets: [
      "A duração ocupa o tempo na agenda",
      "Marque os dias em que o serviço é oferecido",
    ],
  },
  {
    id: "products-list",
    phase: "catalog",
    href: "/admin/produtos",
    target: "tour-products-page",
    title: "Produtos",
    body: "Itens vendidos na comanda (pomada, bebida, kit). Se não vende produto, pode pular.",
    bullets: [
      "Organize por categorias",
      "Estoque baixa na venda",
    ],
    optional: true,
  },
  {
    id: "products",
    phase: "catalog",
    href: "/admin/produtos/novo",
    target: "tour-product-form",
    title: "Cadastrar produto",
    body: "Preço, estoque e comissão (se houver barbeiro na venda).",
    bullets: [
      "Sem profissional na comanda = sem comissão",
      "Dá para cadastrar mais depois",
    ],
    optional: true,
  },
  {
    id: "clients",
    phase: "operations",
    href: "/admin/clientes",
    target: "tour-clients-page",
    title: "Clientes",
    body: "Base de clientes da loja: WhatsApp, histórico e crédito.",
    bullets: [
      "Novos clientes também entram ao agendar pelo site",
      "Crédito da loja pode ser usado no pagamento",
    ],
  },
  {
    id: "agenda",
    phase: "operations",
    href: "/admin",
    target: "tour-agenda-main",
    title: "Agenda do dia",
    body: "Centro da operação: horários, encaixes, comandas e status dos atendimentos.",
    bullets: [
      "Clique em um horário vazio para marcar",
      "Clique no card para abrir ações ou a comanda",
      "Troque o dia no calendário ao lado",
    ],
  },
  {
    id: "cash",
    phase: "finance",
    href: "/admin",
    target: "tour-agenda-cash",
    title: "Caixa do dia",
    body: "Abra o caixa pela aba lateral “CAIXA”. Sem caixa aberto, a comanda não fecha.",
    bullets: [
      "Só um caixa aberto por vez",
      "Pagamentos reais entram no caixa do dia",
      "Encerrar no fim do expediente",
    ],
  },
  {
    id: "cash-history",
    phase: "finance",
    href: "/admin/financeiro/caixas",
    target: "tour-caixas-page",
    title: "Histórico de caixas",
    body: "Consulta caixas abertos e encerrados por período. Útil para conferência do dia.",
    bullets: [
      "Filtre por datas",
      "Abra o detalhe de um dia específico",
    ],
  },
  {
    id: "finance",
    phase: "finance",
    href: "/admin/financeiro",
    target: "tour-finance-page",
    title: "Financeiro",
    body: "Visão geral: faturamento, entradas no caixa, ticket médio e evolução.",
    bullets: [
      "Escolha o período no topo",
      "Clique em uma métrica para ver o detalhe",
    ],
  },
  {
    id: "commissions",
    phase: "finance",
    href: "/admin/financeiro/comissoes",
    target: "tour-commissions-page",
    title: "Comissões",
    body: "Quanto cada profissional tem a receber no período, com detalhe por atendimento.",
    bullets: [
      "Baseado no valor cobrado dos serviços",
      "Produto só entra se tiver barbeiro na venda",
    ],
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
