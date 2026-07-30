"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowRight,
  Banknote,
  Check,
  Clock3,
  Package,
  Receipt,
  Scissors,
  Store,
  Users,
  Wallet,
} from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import {
  ShopProfileForm,
  type ShopProfileValues,
} from "@/components/admin/shop-profile-form";
import {
  BusinessHoursForm,
  type BusinessDay,
} from "@/components/admin/business-hours-form";
import { ProfessionalForm } from "@/components/admin/professional-form";
import { ServiceForm } from "@/components/admin/service-form";
import { ProductForm } from "@/components/admin/product-form";
import { Button } from "@/components/ui/button";
import { ADMIN_SURFACE } from "@/lib/admin-surface";
import { cn } from "@/lib/utils";
import type { OnboardingStepId, OnboardingStatus } from "@/lib/onboarding";
import { createProfessional } from "@/app/admin/(panel)/profissionais/actions";
import { createService } from "@/app/admin/(panel)/servicos/actions";
import { createProduct } from "@/app/admin/(panel)/produtos/actions";
import {
  completeOnboarding,
  skipOnboarding,
} from "@/app/admin/(panel)/primeiros-passos/actions";

type ServiceOption = { id: string; name: string };
type ProfessionalOption = { id: string; nickname: string };
type BusinessHourOption = { weekday: number; active: boolean };
type CategoryOption = { id: string; name: string };

type OnboardingViewProps = {
  status: OnboardingStatus;
  shopName: string;
  profile: ShopProfileValues;
  businessDays: BusinessDay[];
  slotStepMinutes: number;
  services: ServiceOption[];
  professionals: ProfessionalOption[];
  businessHours: BusinessHourOption[];
  categories: CategoryOption[];
};

const STEP_ORDER: OnboardingStepId[] = [
  "shop",
  "team",
  "services",
  "products",
  "cash",
];

const STEP_META: Record<
  OnboardingStepId,
  { short: string; title: string; tip: string }
> = {
  shop: {
    short: "Loja",
    title: "Dados da barbearia",
    tip: "Preencha e salve. O progresso sobe sozinho.",
  },
  team: {
    short: "Equipe",
    title: "Primeiro profissional",
    tip: "Cadastre ao menos um barbeiro com acesso ao painel.",
  },
  services: {
    short: "Serviços",
    title: "Primeiro serviço",
    tip: "Corte, barba ou combo — com preço e duração.",
  },
  products: {
    short: "Produtos",
    title: "Primeiro produto",
    tip: "Opcional. Pode pular e cadastrar depois.",
  },
  cash: {
    short: "Caixa",
    title: "Como funciona o caixa",
    tip: "Leia com calma — depois é só começar a usar.",
  },
};

function stepDoneMap(status: OnboardingStatus) {
  return Object.fromEntries(status.steps.map((s) => [s.id, s.done])) as Record<
    OnboardingStepId,
    boolean
  >;
}

function canOpenStep(id: OnboardingStepId, done: Record<OnboardingStepId, boolean>) {
  const index = STEP_ORDER.indexOf(id);
  if (index <= 0) return true;
  // Só libera a etapa se a anterior obrigatória estiver pronta
  for (let i = 0; i < index; i++) {
    const prev = STEP_ORDER[i];
    if (prev === "products") continue;
    if (prev === "cash") continue;
    if (!done[prev]) return false;
  }
  return true;
}

export function OnboardingView({
  status,
  shopName,
  profile,
  businessDays,
  slotStepMinutes,
  services,
  professionals,
  businessHours,
  categories,
}: OnboardingViewProps) {
  const router = useRouter();
  const done = stepDoneMap(status);
  const [pinnedStep, setPinnedStep] = useState<OnboardingStepId | null>(null);
  const [shopPhase, setShopPhase] = useState<"profile" | "hours">("profile");
  const [pending, startTransition] = useTransition();

  const active = pinnedStep ?? status.nextStepId;

  const doneCount = status.steps.filter((s) => s.done).length;
  const progressPct = useMemo(
    () => Math.round((doneCount / status.steps.length) * 100),
    [doneCount, status.steps.length]
  );

  const meta = STEP_META[active];
  const stepNumber = STEP_ORDER.indexOf(active) + 1;

  function finish(kind: "complete" | "skip") {
    startTransition(async () => {
      const result =
        kind === "complete"
          ? await completeOnboarding()
          : await skipOnboarding();
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(
        kind === "complete"
          ? "Pronto! Sua loja está configurada."
          : "Agenda liberada. Você pode voltar em Primeiros passos quando quiser."
      );
      router.push("/admin");
      router.refresh();
    });
  }

  function refreshProgress() {
    router.refresh();
  }

  return (
    <div
      className={cn(
        "admin-page -m-4 flex min-h-full flex-col p-4 md:-m-8 md:p-8",
        ADMIN_SURFACE.page
      )}
    >
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
        <PageHeader
          tone="dark"
          title="Vamos configurar sua loja"
          description={`Passo a passo para deixar ${shopName} pronta. Salve cada etapa — o progresso atualiza sozinho.`}
          action={
            status.completed ? null : (
              <button
                type="button"
                disabled={pending}
                onClick={() => finish("skip")}
                className={cn(
                  "text-xs underline-offset-2 hover:underline",
                  ADMIN_SURFACE.muted
                )}
              >
                Já configurei — ir para a agenda
              </button>
            )
          }
        />

        {/* Progresso */}
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3 text-sm">
            <p className="text-[#f5f5f5]">
              Etapa {stepNumber} de {STEP_ORDER.length}
              <span className={cn("ml-2", ADMIN_SURFACE.muted)}>
                · {meta.short}
              </span>
            </p>
            <p className={cn("tabular-nums", ADMIN_SURFACE.muted)}>
              {progressPct}%
            </p>
          </div>
          <div
            className={cn(
              "h-1.5 overflow-hidden rounded-full",
              ADMIN_SURFACE.progress
            )}
          >
            <div
              className={cn(
                "h-full rounded-full transition-all duration-300",
                ADMIN_SURFACE.progressBar
              )}
              style={{ width: `${progressPct}%` }}
            />
          </div>

          {/* Stepper — só etapas liberadas */}
          <ol className="flex items-center justify-between gap-1">
            {STEP_ORDER.map((id, index) => {
              const isActive = active === id;
              const isDone = done[id];
              const unlocked = canOpenStep(id, done);
              return (
                <li key={id} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                  <button
                    type="button"
                    disabled={!unlocked && !isDone}
                    onClick={() =>
                      unlocked || isDone ? setPinnedStep(id) : undefined
                    }
                    className={cn(
                      "flex size-8 items-center justify-center rounded-full border text-xs font-semibold tabular-nums transition-colors",
                      isDone && "border-[#ecf15e] bg-[#ecf15e] text-[#0e0f11]",
                      !isDone &&
                        isActive &&
                        "border-[#ecf15e] bg-[rgb(236_241_94_/_14%)] text-[#ecf15e]",
                      !isDone &&
                        !isActive &&
                        unlocked &&
                        "border-white/20 text-[#b4b6bb]",
                      !isDone &&
                        !isActive &&
                        !unlocked &&
                        "border-white/10 text-[#5c5e63] opacity-50"
                    )}
                    aria-current={isActive ? "step" : undefined}
                    aria-label={`${STEP_META[id].short}${isDone ? " (concluído)" : ""}`}
                  >
                    {isDone ? (
                      <Check className="size-3.5" strokeWidth={2.5} />
                    ) : (
                      index + 1
                    )}
                  </button>
                  <span
                    className={cn(
                      "max-w-full truncate text-[10px] font-medium uppercase tracking-wide",
                      isActive || isDone ? "text-[#f5f5f5]" : ADMIN_SURFACE.muted
                    )}
                  >
                    {STEP_META[id].short}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>

        {/* Cabeçalho da etapa */}
        <div className="rounded-2xl border border-white/10 bg-[#151618] p-4 sm:p-5">
          <p className={ADMIN_SURFACE.sectionLabel}>Agora</p>
          <h2 className="mt-1 text-lg font-semibold tracking-tight text-[#f5f5f5] sm:text-xl">
            {meta.title}
          </h2>
          <p className={cn("mt-1.5 text-sm leading-relaxed", ADMIN_SURFACE.muted)}>
            {meta.tip}
          </p>
        </div>

        {/* Conteúdo — formulário real */}
        {active === "shop" ? (
          <div className="space-y-4">
            {shopPhase === "hours" ? (
              <>
                <StepHint icon={Clock3}>
                  Confirme os dias e horários de funcionamento da loja.
                </StepHint>
                <BusinessHoursForm
                  initialDays={businessDays}
                  initialSlotStep={slotStepMinutes}
                  submitLabel="Salvar horários e continuar"
                  onSaved={() => {
                    refreshProgress();
                    setPinnedStep(null);
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  className={cn(ADMIN_SURFACE.btnGhost, "w-full")}
                  onClick={() => {
                    setPinnedStep(null);
                    router.refresh();
                  }}
                >
                  Horários ok — continuar para a equipe
                  <ArrowRight className="size-4" />
                </Button>
              </>
            ) : (
              <>
                <StepHint icon={Store}>
                  Nome, WhatsApp e endereço. Isso aparece no site de
                  agendamento.
                </StepHint>
                <ShopProfileForm
                  initialValues={profile}
                  submitLabel="Salvar e continuar"
                  onSaved={() => {
                    setShopPhase("hours");
                    setPinnedStep("shop");
                    refreshProgress();
                  }}
                />
              </>
            )}
          </div>
        ) : null}

        {active === "team" ? (
          <div className="space-y-4">
            <StepHint icon={Users}>
              Cadastre o barbeiro (pode ser você). Defina senha de acesso,
              comissão e horários dele.
            </StepHint>
            <ProfessionalForm
              services={services}
              businessDays={businessDays}
              onSubmit={createProfessional}
              submitLabel="Salvar profissional e continuar"
              onSaved={() => {
                setPinnedStep(null);
                refreshProgress();
              }}
            />
          </div>
        ) : null}

        {active === "services" ? (
          <div className="space-y-4">
            <StepHint icon={Scissors}>
              Sem serviço ativo o cliente não consegue agendar pelo site.
            </StepHint>
            <ServiceForm
              professionals={professionals}
              businessHours={businessHours}
              onSubmit={createService}
              submitLabel="Salvar serviço e continuar"
              onSaved={() => {
                setPinnedStep(null);
                refreshProgress();
              }}
            />
          </div>
        ) : null}

        {active === "products" ? (
          <div className="space-y-4">
            <StepHint icon={Package}>
              Pomada, bebida, kit… Se não vende produto agora, pode pular.
            </StepHint>
            {categories.length > 0 ? (
              <ProductForm
                categories={categories}
                onSubmit={createProduct}
                submitLabel="Salvar produto e continuar"
                onSaved={() => {
                  setPinnedStep(null);
                  refreshProgress();
                }}
              />
            ) : (
              <p className={cn("text-sm", ADMIN_SURFACE.muted)}>
                Preparando categoria… Atualize a página se o formulário não
                aparecer.
              </p>
            )}
            <Button
              type="button"
              variant="outline"
              className={cn(ADMIN_SURFACE.btnGhost, "w-full")}
              onClick={() => setPinnedStep("cash")}
            >
              Pular produtos — ir para o caixa
              <ArrowRight className="size-4" />
            </Button>
          </div>
        ) : null}

        {active === "cash" ? (
          <CashLesson
            canFinish={done.shop && done.team && done.services}
            pending={pending}
            onFinish={() => finish("complete")}
          />
        ) : null}
      </div>
    </div>
  );
}

function StepHint({
  icon: Icon,
  children,
}: {
  icon: typeof Store;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-3 rounded-xl border border-white/10 bg-[#151618] px-3 py-3">
      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border border-white/10 text-[#ecf15e]">
        <Icon className="size-4" />
      </span>
      <p className={cn("text-sm leading-relaxed", ADMIN_SURFACE.muted)}>
        {children}
      </p>
    </div>
  );
}

function CashLesson({
  canFinish,
  pending,
  onFinish,
}: {
  canFinish: boolean;
  pending: boolean;
  onFinish: () => void;
}) {
  return (
    <div className="space-y-4">
      <StepHint icon={Wallet}>
        O caixa é o envelope do dia: abre de manhã, recebe o que entra nas
        comandas e encerra no fim do expediente.
      </StepHint>

      <div className="space-y-2">
        <LessonRow
          step="1"
          icon={Wallet}
          title="Abrir o caixa"
          text="Na agenda, aba Caixa. Só um caixa aberto por vez."
        />
        <LessonRow
          step="2"
          icon={Receipt}
          title="Fechar a comanda"
          text="Escolha a forma de pagamento (Pix, dinheiro, cartão…)."
        />
        <LessonRow
          step="3"
          icon={Banknote}
          title="O valor entra no caixa"
          text="Pagamentos reais entram. Crédito da loja não soma de novo."
        />
        <LessonRow
          step="4"
          icon={Clock3}
          title="Encerrar e consultar"
          text="No fim do dia, encerre. Histórico em Caixas; resumo em Financeiro."
        />
      </div>

      <div className="rounded-xl border border-white/10 bg-[#151618] p-4">
        <p className="text-sm font-medium text-[#f5f5f5]">
          Regras importantes
        </p>
        <ul className="mt-3 space-y-2 text-sm leading-relaxed text-[#b4b6bb]">
          <li>· Só o dono abre e encerra o caixa.</li>
          <li>· Comanda só fecha com o caixa do mesmo dia aberto.</li>
          <li>· Comissão é sobre o valor cobrado dos serviços.</li>
          <li>· Gorjeta vai 100% para o barbeiro e entra no caixa.</li>
        </ul>
      </div>

      <Button
        type="button"
        className={cn(ADMIN_SURFACE.btnPrimary, "w-full")}
        disabled={pending || !canFinish}
        onClick={onFinish}
      >
        {canFinish
          ? "Entendi — começar a usar"
          : "Conclua as etapas anteriores primeiro"}
        <ArrowRight className="size-4" />
      </Button>
    </div>
  );
}

function LessonRow({
  step,
  icon: Icon,
  title,
  text,
}: {
  step: string;
  icon: typeof Store;
  title: string;
  text: string;
}) {
  return (
    <div className="flex gap-3 rounded-xl border border-white/10 bg-[#151618] px-3 py-3">
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full border border-[rgb(236_241_94_/_35%)] text-[11px] font-semibold text-[#ecf15e]">
        {step}
      </span>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <Icon className="size-3.5 shrink-0 text-[#ecf15e]" />
          <p className="text-sm font-medium text-[#f5f5f5]">{title}</p>
        </div>
        <p className={cn("mt-1 text-sm leading-relaxed", ADMIN_SURFACE.muted)}>
          {text}
        </p>
      </div>
    </div>
  );
}
