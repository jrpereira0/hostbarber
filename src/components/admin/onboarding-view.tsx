"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowRight,
  Banknote,
  Check,
  Clock3,
  Link2,
  Package,
  Receipt,
  Scissors,
  Store,
  Users,
  Wallet,
} from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { ADMIN_SURFACE } from "@/lib/admin-surface";
import { cn } from "@/lib/utils";
import type { OnboardingStepId, OnboardingStatus } from "@/lib/onboarding";
import {
  completeOnboarding,
  skipOnboarding,
} from "@/app/admin/(panel)/primeiros-passos/actions";

type OnboardingViewProps = {
  status: OnboardingStatus;
  shopName: string;
  initialStep?: OnboardingStepId;
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
  { title: string; short: string; icon: typeof Store }
> = {
  shop: { title: "Sua barbearia", short: "Perfil", icon: Store },
  team: { title: "Equipe e acessos", short: "Equipe", icon: Users },
  services: { title: "Serviços", short: "Serviços", icon: Scissors },
  products: { title: "Produtos", short: "Produtos", icon: Package },
  cash: { title: "Como funciona o caixa", short: "Caixa", icon: Wallet },
};

function stepDoneMap(status: OnboardingStatus) {
  return Object.fromEntries(status.steps.map((s) => [s.id, s.done])) as Record<
    OnboardingStepId,
    boolean
  >;
}

export function OnboardingView({
  status,
  shopName,
  initialStep,
}: OnboardingViewProps) {
  const router = useRouter();
  const done = stepDoneMap(status);
  const [active, setActive] = useState<OnboardingStepId>(
    initialStep && STEP_META[initialStep] ? initialStep : status.nextStepId
  );
  const [pending, startTransition] = useTransition();

  const activeIndex = STEP_ORDER.indexOf(active);
  const doneCount = status.steps.filter((s) => s.done).length;
  const progressPct = useMemo(
    () => Math.round((doneCount / status.steps.length) * 100),
    [doneCount, status.steps.length]
  );

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
          ? "Tudo pronto. Boa operação!"
          : "Configuração liberada. Você pode voltar aqui quando quiser."
      );
      router.push("/admin");
      router.refresh();
    });
  }

  function goNext() {
    const next = STEP_ORDER[activeIndex + 1];
    if (next) setActive(next);
  }

  function goPrev() {
    const prev = STEP_ORDER[activeIndex - 1];
    if (prev) setActive(prev);
  }

  return (
    <div
      className={cn(
        "admin-page -m-4 flex min-h-full flex-col p-4 pb-28 md:-m-8 md:p-8 md:pb-8",
        ADMIN_SURFACE.page
      )}
    >
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 md:gap-6">
        <PageHeader
          tone="dark"
          title="Primeiros passos"
          description={
            status.completed
              ? `${shopName} já passou pela configuração inicial. Use esta página como guia quando precisar.`
              : `Vamos deixar ${shopName} pronta para atender.`
          }
          action={
            <Button
              type="button"
              variant="outline"
              className={cn(ADMIN_SURFACE.btnGhost, "w-full sm:w-auto")}
              disabled={pending}
              onClick={() =>
                status.completed ? router.push("/admin") : finish("skip")
              }
            >
              {status.completed ? "Abrir agenda" : "Ir para a agenda"}
            </Button>
          }
        />

        {/* Progresso compacto */}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3 text-sm">
            <p className={ADMIN_SURFACE.muted}>
              <span className="font-medium text-[#f5f5f5]">
                {doneCount}/{status.steps.length}
              </span>{" "}
              etapas
              <span className="hidden sm:inline">
                {" "}
                · produtos são opcionais
              </span>
            </p>
            <p className={cn("tabular-nums", ADMIN_SURFACE.muted)}>
              {progressPct}%
            </p>
          </div>
          <div
            className={cn(
              "h-1 overflow-hidden rounded-full",
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
        </div>

        {/* Stepper mobile: círculos em linha */}
        <nav
          aria-label="Etapas"
          className="flex items-center justify-between gap-1 sm:hidden"
        >
          {STEP_ORDER.map((id, index) => {
            const isActive = active === id;
            const isDone = done[id];
            return (
              <button
                key={id}
                type="button"
                onClick={() => setActive(id)}
                className="flex min-w-0 flex-1 flex-col items-center gap-1.5"
                aria-current={isActive ? "step" : undefined}
              >
                <span
                  className={cn(
                    "flex size-9 items-center justify-center rounded-full border text-xs font-semibold tabular-nums transition-colors",
                    isDone &&
                      "border-[#ecf15e] bg-[#ecf15e] text-[#0e0f11]",
                    !isDone &&
                      isActive &&
                      "border-[#ecf15e] bg-[rgb(236_241_94_/_14%)] text-[#ecf15e]",
                    !isDone &&
                      !isActive &&
                      "border-white/15 bg-transparent text-[#b4b6bb]"
                  )}
                >
                  {isDone ? <Check className="size-3.5" strokeWidth={2.5} /> : index + 1}
                </span>
                <span
                  className={cn(
                    "max-w-full truncate text-[10px] font-medium tracking-wide uppercase",
                    isActive || isDone ? "text-[#f5f5f5]" : ADMIN_SURFACE.muted
                  )}
                >
                  {STEP_META[id].short}
                </span>
              </button>
            );
          })}
        </nav>

        {/* Stepper desktop: lista vertical compacta acima do conteúdo em md? 
            Em desktop usamos chips horizontais limpos */}
        <nav
          aria-label="Etapas"
          className="hidden gap-2 sm:flex sm:flex-wrap"
        >
          {STEP_ORDER.map((id, index) => {
            const isActive = active === id;
            const isDone = done[id];
            const optional = status.steps.find((s) => s.id === id)?.optional;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setActive(id)}
                className={cn(
                  "inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm transition-colors",
                  isActive
                    ? "border-[#ecf15e] bg-[rgb(236_241_94_/_12%)] text-[#f5f5f5]"
                    : "border-white/10 bg-[#151618] text-[#b4b6bb] hover:border-white/20 hover:text-[#f5f5f5]"
                )}
              >
                <span
                  className={cn(
                    "flex size-5 items-center justify-center rounded-full text-[10px] font-semibold tabular-nums",
                    isDone
                      ? "bg-[#ecf15e] text-[#0e0f11]"
                      : isActive
                        ? "bg-[rgb(236_241_94_/_20%)] text-[#ecf15e]"
                        : "bg-white/10 text-[#b4b6bb]"
                  )}
                >
                  {isDone ? <Check className="size-3" strokeWidth={2.5} /> : index + 1}
                </span>
                <span className="font-medium">{STEP_META[id].short}</span>
                {optional && !isDone ? (
                  <span className="text-xs text-[#8b8d93]">opc.</span>
                ) : null}
              </button>
            );
          })}
        </nav>

        {/* Conteúdo da etapa */}
        <section className="rounded-2xl border border-white/10 bg-[#151618] p-4 sm:p-6">
          {active === "shop" ? <ShopStep done={done.shop} /> : null}
          {active === "team" ? <TeamStep done={done.team} /> : null}
          {active === "services" ? <ServicesStep done={done.services} /> : null}
          {active === "products" ? (
            <ProductsStep
              done={done.products}
              onSkipToCash={() => setActive("cash")}
            />
          ) : null}
          {active === "cash" ? (
            <CashStep
              canFinish={done.shop && done.team && done.services}
              completed={status.completed}
              pending={pending}
              onFinish={() => finish("complete")}
            />
          ) : null}
        </section>

        {/* Navegação entre etapas — desktop */}
        <div className="hidden items-center justify-between gap-3 md:flex">
          <Button
            type="button"
            variant="outline"
            className={ADMIN_SURFACE.btnGhost}
            disabled={activeIndex === 0}
            onClick={goPrev}
          >
            Anterior
          </Button>
          {active !== "cash" ? (
            <Button
              type="button"
              className={ADMIN_SURFACE.btnPrimary}
              onClick={goNext}
            >
              Próxima etapa
              <ArrowRight className="size-4" />
            </Button>
          ) : null}
        </div>
      </div>

      {/* Barra fixa no mobile */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-[#0e0f11]/95 p-3 backdrop-blur-md md:hidden">
        <div className="mx-auto flex max-w-3xl gap-2">
          <Button
            type="button"
            variant="outline"
            className={cn(ADMIN_SURFACE.btnGhost, "flex-1")}
            disabled={activeIndex === 0}
            onClick={goPrev}
          >
            Anterior
          </Button>
          {active === "cash" ? (
            status.completed ? (
              <Button asChild className={cn(ADMIN_SURFACE.btnPrimary, "flex-[1.4]")}>
                <Link href="/admin">Abrir agenda</Link>
              </Button>
            ) : (
              <Button
                type="button"
                className={cn(ADMIN_SURFACE.btnPrimary, "flex-[1.4]")}
                disabled={
                  pending || !(done.shop && done.team && done.services)
                }
                onClick={() => finish("complete")}
              >
                {done.shop && done.team && done.services
                  ? "Começar a usar"
                  : "Falta equipe/serviço"}
              </Button>
            )
          ) : (
            <Button
              type="button"
              className={cn(ADMIN_SURFACE.btnPrimary, "flex-[1.4]")}
              onClick={goNext}
            >
              Próxima
              <ArrowRight className="size-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function StepShell({
  icon: Icon,
  stepNumber,
  title,
  description,
  done,
  children,
  actions,
}: {
  icon: typeof Store;
  stepNumber: number;
  title: string;
  description: string;
  done: boolean;
  children: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-[#1a1b1e] text-[#ecf15e]">
          <Icon className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className={ADMIN_SURFACE.sectionLabel}>Etapa {stepNumber}</p>
            <span
              className={cn(
                "rounded-full border px-2 py-0.5 text-[11px] font-medium",
                done
                  ? "border-[rgb(236_241_94_/_40%)] text-[#ecf15e]"
                  : "border-white/10 text-[#b4b6bb]"
              )}
            >
              {done ? "Pronto" : "Pendente"}
            </span>
          </div>
          <h2 className="mt-1 text-lg font-semibold tracking-tight text-[#f5f5f5] sm:text-xl">
            {title}
          </h2>
          <p className={cn("mt-1.5 text-sm leading-relaxed", ADMIN_SURFACE.muted)}>
            {description}
          </p>
        </div>
      </div>

      {children}

      {actions ? (
        <div className="flex flex-col gap-2 border-t border-white/10 pt-5 sm:flex-row sm:flex-wrap">
          {actions}
        </div>
      ) : null}
    </div>
  );
}

function TipList({ items }: { items: string[] }) {
  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li key={item} className="flex gap-3 text-sm leading-relaxed">
          <span className="mt-2 size-1.5 shrink-0 rounded-full bg-[#ecf15e]" />
          <span className="text-[#c8c9cd]">{item}</span>
        </li>
      ))}
    </ul>
  );
}

function PrimaryLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Button asChild className={cn(ADMIN_SURFACE.btnPrimary, "w-full sm:w-auto")}>
      <Link href={href}>
        {children}
        <ArrowRight className="size-4" />
      </Link>
    </Button>
  );
}

function GhostLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Button
      asChild
      variant="outline"
      className={cn(ADMIN_SURFACE.btnGhost, "w-full sm:w-auto")}
    >
      <Link href={href}>{children}</Link>
    </Button>
  );
}

function ShopStep({ done }: { done: boolean }) {
  return (
    <StepShell
      icon={Store}
      stepNumber={1}
      title="Cadastre as informações da barbearia"
      description="É o que o cliente vê no site e no link de agendamento."
      done={done}
      actions={
        <>
          <PrimaryLink href="/admin/configuracoes">
            Abrir configurações
          </PrimaryLink>
          <GhostLink href="/admin/configuracoes">
            Ajustar horários
          </GhostLink>
        </>
      }
    >
      <TipList
        items={[
          "Preencha nome, WhatsApp, endereço e, se quiser, logo e Instagram.",
          "Revise o link público da agenda — é o que você envia para o cliente.",
          "Confira os horários e o intervalo dos slots (15, 30, 45 ou 60 min).",
          "Volte aqui depois de salvar: o progresso atualiza sozinho.",
        ]}
      />
      <div className="grid gap-2">
        <MiniRow icon={Store} title="Perfil" text="Nome, contato e endereço" />
        <MiniRow
          icon={Link2}
          title="Link"
          text="Página pública /agenda/sua-loja"
        />
        <MiniRow
          icon={Clock3}
          title="Horários"
          text="Dias abertos e grade da semana"
        />
      </div>
    </StepShell>
  );
}

function TeamStep({ done }: { done: boolean }) {
  return (
    <StepShell
      icon={Users}
      stepNumber={2}
      title="Cadastre a equipe e os acessos"
      description="Cada profissional entra na agenda com horário, comissão e permissões."
      done={done}
      actions={
        <>
          <PrimaryLink href="/admin/profissionais/novo">
            Cadastrar profissional
          </PrimaryLink>
          <GhostLink href="/admin/profissionais">Ver equipe</GhostLink>
          <GhostLink href="/admin/configuracoes">Recepção (opcional)</GhostLink>
        </>
      }
    >
      <TipList
        items={[
          "Cadastre ao menos um barbeiro para a agenda funcionar.",
          "Defina horário, % de comissão e permissões (marcar, comanda, encaixe).",
          "Recepção em Configurações: vê a agenda toda, sem financeiro.",
          "O dono também pode ser um profissional se atender clientes.",
        ]}
      />
    </StepShell>
  );
}

function ServicesStep({ done }: { done: boolean }) {
  return (
    <StepShell
      icon={Scissors}
      stepNumber={3}
      title="Cadastre os serviços"
      description="Corte, barba, combo — com preço e duração. Monta a agenda e a comanda."
      done={done}
      actions={
        <>
          <PrimaryLink href="/admin/servicos/novo">
            Cadastrar serviço
          </PrimaryLink>
          <GhostLink href="/admin/servicos">Ver serviços</GhostLink>
        </>
      }
    >
      <TipList
        items={[
          "Informe nome, duração em minutos e preço.",
          "A duração define quanto tempo o horário ocupa na agenda.",
          "Dá para ter preços diferentes por dia da semana.",
          "Sem serviço ativo, o cliente não agenda pelo site.",
        ]}
      />
    </StepShell>
  );
}

function ProductsStep({
  done,
  onSkipToCash,
}: {
  done: boolean;
  onSkipToCash: () => void;
}) {
  return (
    <StepShell
      icon={Package}
      stepNumber={4}
      title="Cadastre os produtos"
      description="Opcional. Pomadas, bebidas e kits vendidos na comanda."
      done={done}
      actions={
        <>
          <PrimaryLink href="/admin/produtos/novo">
            Cadastrar produto
          </PrimaryLink>
          <GhostLink href="/admin/produtos">Ver produtos</GhostLink>
          <Button
            type="button"
            variant="outline"
            className={cn(ADMIN_SURFACE.btnGhost, "w-full sm:w-auto")}
            onClick={onSkipToCash}
          >
            Pular e ir para o caixa
            <ArrowRight className="size-4" />
          </Button>
        </>
      }
    >
      <TipList
        items={[
          "Dá para começar sem produtos e voltar depois.",
          "Organize por categorias se a lista crescer.",
          "Na comanda, produto pode ir com ou sem barbeiro.",
          "O estoque baixa quando a venda é registrada.",
        ]}
      />
    </StepShell>
  );
}

function CashStep({
  canFinish,
  completed,
  pending,
  onFinish,
}: {
  canFinish: boolean;
  completed: boolean;
  pending: boolean;
  onFinish: () => void;
}) {
  return (
    <StepShell
      icon={Wallet}
      stepNumber={5}
      title="Como funciona o caixa"
      description="O caixa organiza o dinheiro do dia. Sem caixa aberto, a comanda não fecha."
      done={completed}
      actions={
        completed ? (
          <Button
            asChild
            className={cn(ADMIN_SURFACE.btnPrimary, "hidden w-full sm:inline-flex sm:w-auto")}
          >
            <Link href="/admin">
              Ir para a agenda
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        ) : (
          <Button
            type="button"
            className={cn(
              ADMIN_SURFACE.btnPrimary,
              "hidden w-full sm:inline-flex sm:w-auto"
            )}
            disabled={pending || !canFinish}
            onClick={onFinish}
          >
            {canFinish
              ? "Entendi — começar a usar"
              : "Conclua equipe e serviços antes"}
            <ArrowRight className="size-4" />
          </Button>
        )
      }
    >
      <div className="space-y-4">
        <p className={cn("text-sm leading-relaxed", ADMIN_SURFACE.muted)}>
          Pense no caixa como o envelope do dia: abre de manhã, registra o que
          entra ao fechar cada comanda e encerra no fim do expediente.
        </p>

        <div className="grid gap-2">
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
            text="Encerre no fim do dia. Histórico em Caixas; resumo em Financeiro."
          />
        </div>

        <div className="rounded-xl border border-white/10 bg-[#1a1b1e] p-4">
          <p className="text-sm font-medium text-[#f5f5f5]">
            Regras que evitam dor de cabeça
          </p>
          <ul className="mt-3 space-y-2.5 text-sm leading-relaxed text-[#b4b6bb]">
            <li>
              · Só o <span className="text-[#f5f5f5]">dono</span> abre e encerra
              o caixa.
            </li>
            <li>
              · Comanda só fecha com o caixa do{" "}
              <span className="text-[#f5f5f5]">mesmo dia</span> aberto.
            </li>
            <li>
              · Comissão é sobre o valor cobrado dos serviços (e produtos com
              profissional).
            </li>
            <li>
              · Gorjeta vai 100% para o barbeiro e também entra no caixa.
            </li>
          </ul>
        </div>

        {!canFinish ? (
          <p className={cn("text-sm", ADMIN_SURFACE.muted)}>
            Antes de liberar, cadastre pelo menos um profissional e um serviço.
          </p>
        ) : null}
      </div>
    </StepShell>
  );
}

function MiniRow({
  icon: Icon,
  title,
  text,
}: {
  icon: typeof Store;
  title: string;
  text: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-[#1a1b1e] px-3 py-3">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-white/10 text-[#ecf15e]">
        <Icon className="size-3.5" />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-medium text-[#f5f5f5]">{title}</p>
        <p className={cn("truncate text-xs", ADMIN_SURFACE.muted)}>{text}</p>
      </div>
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
    <div className="flex gap-3 rounded-xl border border-white/10 bg-[#1a1b1e] px-3 py-3">
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
