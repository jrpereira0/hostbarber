"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { ArrowRight, Check, ListChecks, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ADMIN_SURFACE } from "@/lib/admin-surface";
import { cn } from "@/lib/utils";
import {
  TOUR_PHASES,
  TOUR_STEPS,
  isTourStepDone,
  tourStorageKey,
  type OnboardingStatus,
  type OnboardingStepId,
  type TourPhaseId,
  type TourStepDef,
} from "@/lib/onboarding";
import {
  completeOnboarding,
  skipOnboarding,
} from "@/app/admin/(panel)/primeiros-passos/actions";

type OnboardingTourProps = {
  shopId: string;
  shopName: string;
  status: OnboardingStatus;
  forceWelcome?: boolean;
};

type Rect = { top: number; left: number; width: number; height: number };

function readStoredStep(shopId: string): OnboardingStepId | null {
  try {
    const raw = localStorage.getItem(tourStorageKey(shopId));
    if (!raw) return null;
    return raw;
  } catch {
    return null;
  }
}

function writeStoredStep(shopId: string, step: OnboardingStepId | null) {
  try {
    if (!step || step === "done") {
      localStorage.removeItem(tourStorageKey(shopId));
    } else {
      localStorage.setItem(tourStorageKey(shopId), step);
    }
  } catch {
    // ignore
  }
}

function stepIndex(id: OnboardingStepId): number {
  if (id === "welcome") return -1;
  if (id === "done") return TOUR_STEPS.length;
  return TOUR_STEPS.findIndex((s) => s.id === id);
}

function phaseProgress(step: TourStepDef) {
  const inPhase = TOUR_STEPS.filter((s) => s.phase === step.phase);
  const index = inPhase.findIndex((s) => s.id === step.id);
  return { current: index + 1, total: inPhase.length };
}

export function OnboardingTour({
  shopId,
  shopName,
  status,
  forceWelcome = false,
}: OnboardingTourProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [mounted, setMounted] = useState(false);
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  const [activeId, setActiveId] = useState<OnboardingStepId | null>(null);
  const [targetRect, setTargetRect] = useState<Rect | null>(null);
  const [pending, startTransition] = useTransition();
  const didScrollRef = useRef<string | null>(null);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setMounted(true);
      const stored = readStoredStep(shopId);
      if (forceWelcome || !stored || stored === "welcome") {
        setWelcomeOpen(true);
        setActiveId(null);
        return;
      }
      if (stored === "done") return;
      if (!TOUR_STEPS.some((s) => s.id === stored)) {
        setWelcomeOpen(true);
        setActiveId(null);
        return;
      }
      setActiveId(stored);
    });
    return () => cancelAnimationFrame(frame);
  }, [shopId, forceWelcome]);

  const activeStep: TourStepDef | null = useMemo(() => {
    if (!activeId || activeId === "welcome" || activeId === "done") return null;
    return TOUR_STEPS.find((s) => s.id === activeId) ?? null;
  }, [activeId]);

  const progressIndex = activeId ? Math.max(0, stepIndex(activeId)) : 0;
  const progressTotal = TOUR_STEPS.length;

  const measureTarget = useCallback(
    (allowScroll: boolean) => {
      if (!activeStep) {
        setTargetRect(null);
        return;
      }
      const nodes = Array.from(
        document.querySelectorAll<HTMLElement>(
          `[data-tour="${activeStep.target}"]`
        )
      );
      const el =
        nodes.find((node) => {
          const r = node.getBoundingClientRect();
          return r.width >= 8 && r.height >= 8;
        }) ?? null;

      if (!el) {
        setTargetRect(null);
        return;
      }
      const r = el.getBoundingClientRect();
      const pad = 10;
      const maxH = Math.min(r.height + pad * 2, window.innerHeight * 0.62);
      setTargetRect({
        top: Math.max(8, r.top - pad),
        left: Math.max(8, r.left - pad),
        width: Math.min(r.width + pad * 2, window.innerWidth - 16),
        height: maxH,
      });

      if (allowScroll && didScrollRef.current !== activeStep.id) {
        didScrollRef.current = activeStep.id;
        el.scrollIntoView({ block: "start", behavior: "smooth" });
      }
    },
    [activeStep]
  );

  useEffect(() => {
    if (!activeStep) return;
    didScrollRef.current = null;
    const frame = requestAnimationFrame(() => measureTarget(true));
    const timer = window.setInterval(() => measureTarget(false), 280);
    const onResize = () => measureTarget(false);
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onResize, true);
    return () => {
      cancelAnimationFrame(frame);
      window.clearInterval(timer);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onResize, true);
    };
  }, [activeStep, pathname, searchParams, measureTarget]);

  useEffect(() => {
    if (!activeStep) return;
    const [targetPath, query = ""] = activeStep.href.split("?");
    if (pathname !== targetPath) {
      router.push(activeStep.href);
      return;
    }
    if (query) {
      const wanted = new URLSearchParams(query);
      let mismatch = false;
      wanted.forEach((value, key) => {
        if (searchParams.get(key) !== value) mismatch = true;
      });
      if (mismatch) {
        router.replace(activeStep.href, { scroll: false });
      }
    }
  }, [activeStep, pathname, searchParams, router]);

  function goToStep(id: OnboardingStepId) {
    writeStoredStep(shopId, id);
    setActiveId(id === "welcome" ? null : id);
    setTargetRect(null);
    if (id === "welcome") {
      setWelcomeOpen(true);
      return;
    }
    setWelcomeOpen(false);
    const def = TOUR_STEPS.find((s) => s.id === id);
    if (def) router.push(def.href);
  }

  function startTour() {
    goToStep("settings-tabs");
  }

  function nextStep() {
    if (!activeId || activeId === "welcome") return;
    const idx = stepIndex(activeId);
    if (idx < 0) return;
    if (idx >= TOUR_STEPS.length - 1) {
      finishTour("complete");
      return;
    }
    goToStep(TOUR_STEPS[idx + 1].id);
  }

  function prevStep() {
    if (!activeId) return;
    const idx = stepIndex(activeId);
    if (idx <= 0) {
      setWelcomeOpen(true);
      setActiveId(null);
      writeStoredStep(shopId, "welcome");
      return;
    }
    goToStep(TOUR_STEPS[idx - 1].id);
  }

  function finishTour(kind: "complete" | "skip") {
    startTransition(async () => {
      const result =
        kind === "complete"
          ? await completeOnboarding()
          : await skipOnboarding();
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      writeStoredStep(shopId, "done");
      setActiveId(null);
      setWelcomeOpen(false);
      toast.success(
        kind === "complete"
          ? "Guia concluído. Sua loja está pronta para operar."
          : "Guia encerrado. Retome quando quiser pelo menu."
      );
      router.push("/admin");
      router.refresh();
    });
  }

  if (!mounted || status.completed) return null;

  const balloon =
    activeStep && !welcomeOpen
      ? createPortal(
          <TourOverlay
            rect={targetRect}
            step={activeStep}
            stepNumber={progressIndex + 1}
            stepTotal={progressTotal}
            pending={pending}
            waiting={!targetRect}
            onNext={nextStep}
            onPrev={prevStep}
            onSkip={() => finishTour("skip")}
            onClose={() => {
              writeStoredStep(shopId, activeId);
              setActiveId(null);
            }}
          />,
          document.body
        )
      : null;

  return (
    <>
      <Dialog open={welcomeOpen} onOpenChange={setWelcomeOpen}>
        <DialogContent
          className="max-w-lg border-white/10 bg-[#151618] text-[#f5f5f5] sm:rounded-2xl"
          showCloseButton={false}
        >
          <DialogHeader>
            <div className="mb-2 flex size-11 items-center justify-center rounded-xl border border-white/10 bg-[#1a1b1e] text-[#ecf15e]">
              <ListChecks className="size-5" />
            </div>
            <DialogTitle className="text-xl text-[#f5f5f5]">
              Tour completo · {shopName}
            </DialogTitle>
            <DialogDescription className="text-[#b4b6bb]">
              Vamos percorrer o painel inteiro: configurações (com cada aba),
              cadastros, agenda, caixa e financeiro. Em cada tela aparece um
              balão explicando o que fazer.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 py-1">
            {(Object.keys(TOUR_PHASES) as TourPhaseId[]).map((phaseId) => {
              const phase = TOUR_PHASES[phaseId];
              const steps = TOUR_STEPS.filter((s) => s.phase === phaseId);
              const doneCount = steps.filter((s) =>
                isTourStepDone(s.id, status)
              ).length;
              return (
                <div
                  key={phaseId}
                  className="rounded-xl border border-white/10 bg-[#1a1b1e] px-3.5 py-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-[#f5f5f5]">
                        {phase.label}
                      </p>
                      <p className={cn("mt-0.5 text-xs", ADMIN_SURFACE.muted)}>
                        {phase.description}
                      </p>
                    </div>
                    <span className="shrink-0 text-[11px] tabular-nums text-[#8b8d93]">
                      {doneCount}/{steps.length}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          <p className={cn("text-xs leading-relaxed", ADMIN_SURFACE.muted)}>
            {progressTotal} passos no total · alguns são opcionais (dias
            especiais, recepção e produtos).
          </p>

          <DialogFooter className="flex-col gap-2 border-white/10 bg-transparent sm:flex-col">
            <Button
              type="button"
              className={cn(ADMIN_SURFACE.btnPrimary, "w-full")}
              onClick={startTour}
            >
              Começar o tour
              <ArrowRight className="size-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full text-[#b4b6bb] hover:bg-white/5 hover:text-[#f5f5f5]"
              disabled={pending}
              onClick={() => finishTour("skip")}
            >
              Agora não
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {balloon}

      {!welcomeOpen && !activeStep ? (
        <button
          type="button"
          onClick={() => setWelcomeOpen(true)}
          className="fixed right-4 bottom-20 z-40 flex items-center gap-2 rounded-full border border-[rgb(236_241_94_/_40%)] bg-[#151618] px-3 py-2 text-xs font-medium text-[#ecf15e] shadow-lg md:bottom-6"
        >
          <ListChecks className="size-3.5" />
          Continuar guia
        </button>
      ) : null}
    </>
  );
}

function TourOverlay({
  rect,
  step,
  stepNumber,
  stepTotal,
  pending,
  waiting,
  onNext,
  onPrev,
  onSkip,
  onClose,
}: {
  rect: Rect | null;
  step: TourStepDef;
  stepNumber: number;
  stepTotal: number;
  pending: boolean;
  waiting: boolean;
  onNext: () => void;
  onPrev: () => void;
  onSkip: () => void;
  onClose: () => void;
}) {
  const phase = TOUR_PHASES[step.phase];
  const local = phaseProgress(step);

  const balloonStyle = useMemo(() => {
    // Balão fixo embaixo: não tapa o conteúdo e funciona bem no mobile.
    return {
      left: 12,
      right: 12,
      bottom: 12,
      width: "auto",
      maxWidth: 480,
      marginLeft: "auto",
      marginRight: "auto",
    } as CSSProperties;
  }, []);

  return (
    <div className="fixed inset-0 z-[80]">
      {rect ? (
        <>
          <div
            className="pointer-events-none absolute left-0 right-0 top-0 bg-black/50"
            style={{ height: Math.max(0, rect.top) }}
          />
          <div
            className="pointer-events-none absolute left-0 bg-black/50"
            style={{
              top: rect.top,
              width: Math.max(0, rect.left),
              height: rect.height,
            }}
          />
          <div
            className="pointer-events-none absolute bg-black/50"
            style={{
              top: rect.top,
              left: rect.left + rect.width,
              right: 0,
              height: rect.height,
            }}
          />
          <div
            className="pointer-events-none absolute bottom-0 left-0 right-0 bg-black/50"
            style={{ top: rect.top + rect.height }}
          />
          <div
            className="pointer-events-none absolute rounded-xl border-2 border-[#ecf15e] shadow-[0_0_0_4px_rgba(236,241,94,0.18)]"
            style={{
              top: rect.top,
              left: rect.left,
              width: rect.width,
              height: rect.height,
            }}
          />
        </>
      ) : (
        <div className="pointer-events-none absolute inset-0 bg-black/35" />
      )}

      <div
        className="absolute z-[81] max-h-[min(52vh,420px)] overflow-y-auto rounded-2xl border border-white/15 bg-[#151618] p-4 text-[#f5f5f5] shadow-2xl sm:p-5"
        style={balloonStyle}
      >
        <div className="mb-3 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className={ADMIN_SURFACE.sectionLabel}>
              {phase.label} · {local.current}/{local.total}
            </p>
            <p className={cn("mt-1 text-[11px] tabular-nums", ADMIN_SURFACE.muted)}>
              Passo {stepNumber} de {stepTotal} no tour
            </p>
            <h3 className="mt-1.5 text-base font-semibold tracking-tight sm:text-lg">
              {step.title}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-[#b4b6bb] hover:bg-white/5 hover:text-[#f5f5f5]"
            aria-label="Minimizar guia"
          >
            <X className="size-4" />
          </button>
        </div>

        <p className={cn("text-sm leading-relaxed", ADMIN_SURFACE.muted)}>
          {waiting
            ? "Abrindo a tela… em instantes o destaque aparece para você editar."
            : step.body}
        </p>

        {!waiting && step.bullets && step.bullets.length > 0 ? (
          <ul className="mt-3 space-y-2">
            {step.bullets.map((item) => (
              <li key={item} className="flex gap-2.5 text-sm leading-relaxed">
                <Check className="mt-0.5 size-3.5 shrink-0 text-[#ecf15e]" />
                <span className="text-[#c8c9cd]">{item}</span>
              </li>
            ))}
          </ul>
        ) : null}

        <div className="mt-4 flex flex-col gap-2 border-t border-white/10 pt-4">
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              className={cn(ADMIN_SURFACE.btnGhost, "flex-1")}
              onClick={onPrev}
            >
              Voltar
            </Button>
            <Button
              type="button"
              className={cn(ADMIN_SURFACE.btnPrimary, "flex-[1.35]")}
              onClick={onNext}
              disabled={pending}
            >
              {stepNumber >= stepTotal ? "Concluir tour" : "Próximo"}
              <ArrowRight className="size-4" />
            </Button>
          </div>
          {step.optional ? (
            <Button
              type="button"
              variant="ghost"
              className="w-full text-xs text-[#b4b6bb] hover:bg-white/5 hover:text-[#f5f5f5]"
              onClick={onNext}
            >
              Pular este passo
            </Button>
          ) : null}
          <button
            type="button"
            className="text-center text-[11px] text-[#8b8d93] underline-offset-2 hover:underline"
            disabled={pending}
            onClick={onSkip}
          >
            Encerrar guia
          </button>
        </div>
      </div>
    </div>
  );
}
