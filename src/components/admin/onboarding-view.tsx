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
import { FormSectionTitle } from "@/components/admin/form-section";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
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

const STEP_META: Record<
  OnboardingStepId,
  {
    title: string;
    short: string;
    icon: typeof Store;
  }
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

  const progressPct = useMemo(() => {
    const weight = status.steps.filter((s) => s.done).length;
    return Math.round((weight / status.steps.length) * 100);
  }, [status.steps]);

  function finish(kind: "complete" | "skip") {
    startTransition(async () => {
      const result =
        kind === "complete" ? await completeOnboarding() : await skipOnboarding();
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

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <PageHeader
        tone="dark"
        title="Primeiros passos"
        description={
          status.completed
            ? `${shopName} já passou pela configuração inicial. Use esta página como guia quando precisar.`
            : `Vamos deixar ${shopName} pronta para atender: perfil, equipe, catálogo e o caixa do dia.`
        }
        action={
          !status.completed ? (
            <Button
              type="button"
              variant="outline"
              className={ADMIN_SURFACE.btnGhost}
              disabled={pending}
              onClick={() => finish("skip")}
            >
              Ir para a agenda
            </Button>
          ) : (
            <Button asChild className={ADMIN_SURFACE.btnPrimary}>
              <Link href="/admin">Abrir agenda</Link>
            </Button>
          )
        }
      />

      <Card className={cn(ADMIN_SURFACE.panel, "overflow-hidden")}>
        <CardContent className="space-y-4 p-5 sm:p-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className={ADMIN_SURFACE.sectionLabel}>Progresso</p>
              <p className="mt-1 text-sm text-[#f5f5f5]">
                {status.steps.filter((s) => s.done).length} de{" "}
                {status.steps.length} etapas
                {done.products ? "" : " · produtos são opcionais"}
              </p>
            </div>
            <p className={cn("text-sm tabular-nums", ADMIN_SURFACE.muted)}>
              {progressPct}%
            </p>
          </div>
          <div className={cn("h-1.5 overflow-hidden rounded-full", ADMIN_SURFACE.progress)}>
            <div
              className={cn("h-full rounded-full transition-all", ADMIN_SURFACE.progressBar)}
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,240px)_minmax(0,1fr)]">
        <nav className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
          {(Object.keys(STEP_META) as OnboardingStepId[]).map((id, index) => {
            const meta = STEP_META[id];
            const isActive = active === id;
            const isDone = done[id];
            const optional = status.steps.find((s) => s.id === id)?.optional;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setActive(id)}
                className={cn(
                  "flex min-w-[9.5rem] items-center gap-3 rounded-xl border px-3 py-3 text-left transition-colors lg:min-w-0",
                  isActive
                    ? "border-[rgb(236_241_94_/_35%)] bg-[rgb(236_241_94_/_10%)]"
                    : "border-white/10 bg-[#151618] hover:border-white/20"
                )}
              >
                <span
                  className={cn(
                    "flex size-8 shrink-0 items-center justify-center rounded-md border text-xs font-semibold tabular-nums",
                    isDone
                      ? "border-[rgb(236_241_94_/_40%)] bg-[rgb(236_241_94_/_14%)] text-[#ecf15e]"
                      : isActive
                        ? "border-white/15 bg-[#1a1b1e] text-[#ecf15e]"
                        : "border-white/10 bg-[#1a1b1e] text-[#b4b6bb]"
                  )}
                >
                  {isDone ? <Check className="size-3.5" /> : index + 1}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-[#f5f5f5]">
                    {meta.short}
                  </span>
                  <span className={cn("block text-xs", ADMIN_SURFACE.muted)}>
                    {isDone
                      ? "Concluído"
                      : optional
                        ? "Opcional"
                        : "Pendente"}
                  </span>
                </span>
              </button>
            );
          })}
        </nav>

        <Card className={ADMIN_SURFACE.panel}>
          <CardContent className="space-y-6 p-5 sm:p-6">
            {active === "shop" ? (
              <ShopStep done={done.shop} />
            ) : null}
            {active === "team" ? (
              <TeamStep done={done.team} />
            ) : null}
            {active === "services" ? (
              <ServicesStep done={done.services} />
            ) : null}
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
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StepShell({
  icon,
  title,
  description,
  done,
  children,
  actions,
}: {
  icon: typeof Store;
  title: string;
  description: string;
  done: boolean;
  children: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <FormSectionTitle
          tone="dark"
          icon={icon}
          title={title}
          description={description}
        />
        <span
          className={cn(
            "rounded-full border px-2.5 py-1 text-xs font-medium",
            done
              ? "border-[rgb(236_241_94_/_35%)] bg-[rgb(236_241_94_/_12%)] text-[#ecf15e]"
              : "border-white/10 text-[#b4b6bb]"
          )}
        >
          {done ? "Pronto" : "Em andamento"}
        </span>
      </div>
      {children}
      {actions ? (
        <>
          <Separator className="bg-white/10" />
          <div className="flex flex-wrap gap-2">{actions}</div>
        </>
      ) : null}
    </div>
  );
}

function TipList({ items }: { items: string[] }) {
  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li key={item} className="flex gap-3 text-sm leading-relaxed">
          <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-[#ecf15e]" />
          <span className={ADMIN_SURFACE.muted}>{item}</span>
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
    <Button asChild className={ADMIN_SURFACE.btnPrimary}>
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
    <Button asChild variant="outline" className={ADMIN_SURFACE.btnGhost}>
      <Link href={href}>{children}</Link>
    </Button>
  );
}

function ShopStep({ done }: { done: boolean }) {
  return (
    <StepShell
      icon={Store}
      title="1. Cadastre as informações da barbearia"
      description="É o que o cliente vê no site e o que aparece nos horários e no link de agendamento."
      done={done}
      actions={
        <>
          <PrimaryLink href="/admin/configuracoes">
            Abrir configurações
          </PrimaryLink>
          <GhostLink href="/admin/configuracoes">
            Ajustar horários de funcionamento
          </GhostLink>
        </>
      }
    >
      <TipList
        items={[
          "Preencha nome, WhatsApp, endereço e, se quiser, logo e Instagram.",
          "Revise o link público da agenda — é o que você envia para o cliente.",
          "Confira os horários de funcionamento e o intervalo dos slots (15, 30, 45 ou 60 min).",
          "Volte aqui depois de salvar: o progresso atualiza sozinho.",
        ]}
      />
      <div className="grid gap-3 sm:grid-cols-3">
        <MiniCard
          icon={Store}
          title="Perfil"
          text="Nome, contato e endereço."
        />
        <MiniCard
          icon={Link2}
          title="Link"
          text="Página pública /agenda/sua-loja."
        />
        <MiniCard
          icon={Clock3}
          title="Horários"
          text="Dias abertos e grade da semana."
        />
      </div>
    </StepShell>
  );
}

function TeamStep({ done }: { done: boolean }) {
  return (
    <StepShell
      icon={Users}
      title="2. Cadastre a equipe e os acessos"
      description="Cada profissional entra na agenda com o próprio horário. O dono define o que cada um pode fazer."
      done={done}
      actions={
        <>
          <PrimaryLink href="/admin/profissionais/novo">
            Cadastrar profissional
          </PrimaryLink>
          <GhostLink href="/admin/profissionais">Ver equipe</GhostLink>
          <GhostLink href="/admin/configuracoes">
            Recepção (opcional)
          </GhostLink>
        </>
      }
    >
      <TipList
        items={[
          "Cadastre ao menos um barbeiro para a agenda funcionar.",
          "No cadastro, defina horário de atendimento, % de comissão e permissões (marcar, comanda, encaixe etc.).",
          "Se a loja tiver recepção, cadastre em Configurações → Recepção: ela vê a agenda toda, sem financeiro.",
          "Dica: o próprio dono também pode ser um profissional se atender clientes.",
        ]}
      />
    </StepShell>
  );
}

function ServicesStep({ done }: { done: boolean }) {
  return (
    <StepShell
      icon={Scissors}
      title="3. Cadastre os serviços"
      description="Corte, barba, combo — com preço e duração. Isso monta a agenda e a comanda."
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
          "Você pode ter preços diferentes por dia da semana, se precisar.",
          "Sem serviço ativo, o cliente não consegue agendar pelo site.",
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
      title="4. Cadastre os produtos (opcional)"
      description="Pomadas, bebidas, kits — vendidos na comanda, com estoque e comissão se quiser."
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
            className={ADMIN_SURFACE.btnGhost}
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
          "Na comanda, produto pode ir com ou sem barbeiro (sem barbeiro = sem comissão).",
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
      title="5. Como funciona o caixa"
      description="O caixa organiza o dinheiro do dia. Sem caixa aberto, a comanda não fecha."
      done={completed}
      actions={
        completed ? (
          <Button asChild className={ADMIN_SURFACE.btnPrimary}>
            <Link href="/admin">
              Ir para a agenda
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        ) : (
          <Button
            type="button"
            className={ADMIN_SURFACE.btnPrimary}
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
          Pense no caixa como o envelope do dia: você abre de manhã, registra o
          que entra ao fechar cada comanda e encerra no fim do expediente.
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <LessonCard
            step="1"
            icon={Wallet}
            title="Abrir o caixa"
            text="Na agenda, aba Caixa, abra o caixa do dia. Só pode haver um caixa aberto por vez."
          />
          <LessonCard
            step="2"
            icon={Receipt}
            title="Atender e fechar a comanda"
            text="Cada cliente do dia tem uma comanda. Ao finalizar, escolha a forma de pagamento (Pix, dinheiro, cartão…)."
          />
          <LessonCard
            step="3"
            icon={Banknote}
            title="O valor entra no caixa"
            text="Pagamentos reais entram no caixa do dia. Uso de crédito da loja não soma de novo (o dinheiro já entrou antes)."
          />
          <LessonCard
            step="4"
            icon={Clock3}
            title="Encerrar e consultar"
            text="No fim do dia, encerre o caixa. O histórico fica em Caixas; o resumo do período em Financeiro."
          />
        </div>

        <div className="rounded-xl border border-white/10 bg-[#1a1b1e] p-4">
          <p className="text-sm font-medium text-[#f5f5f5]">Regras que evitam dor de cabeça</p>
          <ul className="mt-3 space-y-2 text-sm leading-relaxed text-[#b4b6bb]">
            <li>
              · Só o <span className="text-[#f5f5f5]">dono</span> opera o caixa
              (abrir/encerrar).
            </li>
            <li>
              · Comanda só fecha se o caixa do{" "}
              <span className="text-[#f5f5f5]">mesmo dia</span> estiver aberto.
            </li>
            <li>
              · Comissão do barbeiro é calculada sobre o valor cobrado dos
              serviços (e produtos com profissional).
            </li>
            <li>
              · Gorjeta vai 100% para o barbeiro escolhido e também entra no
              caixa.
            </li>
          </ul>
        </div>

        {!canFinish ? (
          <p className={cn("text-sm", ADMIN_SURFACE.muted)}>
            Antes de liberar a operação, cadastre pelo menos um profissional e um
            serviço nos passos anteriores.
          </p>
        ) : null}
      </div>
    </StepShell>
  );
}

function MiniCard({
  icon: Icon,
  title,
  text,
}: {
  icon: typeof Store;
  title: string;
  text: string;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-[#1a1b1e] p-4">
      <div className="mb-3 flex size-8 items-center justify-center rounded-md border border-white/10 text-[#ecf15e]">
        <Icon className="size-4" />
      </div>
      <p className="text-sm font-medium text-[#f5f5f5]">{title}</p>
      <p className={cn("mt-1 text-xs leading-relaxed", ADMIN_SURFACE.muted)}>
        {text}
      </p>
    </div>
  );
}

function LessonCard({
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
    <div className="rounded-xl border border-white/10 bg-[#151618] p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex size-6 items-center justify-center rounded-full border border-[rgb(236_241_94_/_35%)] text-[11px] font-semibold text-[#ecf15e]">
          {step}
        </span>
        <Icon className="size-4 text-[#ecf15e]" />
        <p className="text-sm font-medium text-[#f5f5f5]">{title}</p>
      </div>
      <p className={cn("text-sm leading-relaxed", ADMIN_SURFACE.muted)}>{text}</p>
    </div>
  );
}
