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
import { ArrowRight, CheckCircle2, ListChecks, X } from "lucide-react";
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
  notifyTourProgress,
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
  forceResume?: boolean;
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
  notifyTourProgress();
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

function isVisibleTourTarget(el: HTMLElement) {
  if (el.classList.contains("hidden")) return false;
  if (el.closest(".hidden")) return false;
  const style = window.getComputedStyle(el);
  if (
    style.display === "none" ||
    style.visibility === "hidden" ||
    Number(style.opacity) === 0
  ) {
    return false;
  }
  const r = el.getBoundingClientRect();
  return r.width >= 8 && r.height >= 8;
}

/** Retângulo real do alvo, limitado só à área visível da tela. */
function visibleRectOf(el: HTMLElement, pad = 8): Rect | null {
  const r = el.getBoundingClientRect();
  const top = Math.max(pad, r.top - pad);
  const left = Math.max(pad, r.left - pad);
  const right = Math.min(window.innerWidth - pad, r.right + pad);
  const bottom = Math.min(window.innerHeight - pad, r.bottom + pad);
  const width = right - left;
  const height = bottom - top;
  if (width < 8 || height < 8) return null;
  return { top, left, width, height };
}

export function OnboardingTour({
  shopId,
  shopName,
  status,
  forceWelcome = false,
  forceResume = false,
}: OnboardingTourProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [mounted, setMounted] = useState(false);
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  const [celebrationOpen, setCelebrationOpen] = useState(false);
  const [activeId, setActiveId] = useState<OnboardingStepId | null>(null);
  const [pausedId, setPausedId] = useState<OnboardingStepId | null>(null);
  const [targetRect, setTargetRect] = useState<Rect | null>(null);
  const [pending, startTransition] = useTransition();
  const didScrollRef = useRef<string | null>(null);
  const targetElRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setMounted(true);
      const stored = readStoredStep(shopId);
      const validStored =
        stored &&
        stored !== "welcome" &&
        stored !== "done" &&
        TOUR_STEPS.some((s) => s.id === stored)
          ? stored
          : null;

      if (forceResume && validStored) {
        setWelcomeOpen(false);
        setPausedId(null);
        setActiveId(validStored);
        router.replace("/admin", { scroll: false });
        return;
      }

      if (forceWelcome) {
        setWelcomeOpen(true);
        setActiveId(null);
        setPausedId(validStored);
        return;
      }
      if (!stored || stored === "welcome") {
        setWelcomeOpen(true);
        setActiveId(null);
        setPausedId(null);
        return;
      }
      if (stored === "done") return;
      if (!validStored) {
        setWelcomeOpen(true);
        setActiveId(null);
        setPausedId(null);
        return;
      }
      // Pausado: retoma pela sidebar (Continuar guia).
      setWelcomeOpen(false);
      setActiveId(null);
      setPausedId(validStored);
      notifyTourProgress();
    });
    return () => cancelAnimationFrame(frame);
  }, [shopId, forceWelcome, forceResume, router]);

  const activeStep: TourStepDef | null = useMemo(() => {
    if (!activeId || activeId === "welcome" || activeId === "done") return null;
    return TOUR_STEPS.find((s) => s.id === activeId) ?? null;
  }, [activeId]);

  const progressStepId = activeId ?? pausedId;
  const progressIndex = progressStepId
    ? Math.max(0, stepIndex(progressStepId))
    : 0;
  const progressTotal = TOUR_STEPS.length;

  const measureTarget = useCallback(
    (allowScroll: boolean) => {
      if (!activeStep) {
        setTargetRect(null);
        targetElRef.current = null;
        return;
      }
      const nodes = Array.from(
        document.querySelectorAll<HTMLElement>(
          `[data-tour="${activeStep.target}"]`
        )
      );
      const el = nodes.find(isVisibleTourTarget) ?? null;

      if (!el) {
        setTargetRect(null);
        targetElRef.current = null;
        return;
      }

      targetElRef.current = el;

      if (allowScroll && didScrollRef.current !== activeStep.id) {
        didScrollRef.current = activeStep.id;
        el.scrollIntoView({ block: "nearest", behavior: "smooth", inline: "nearest" });
      }

      setTargetRect(visibleRectOf(el));
    },
    [activeStep]
  );

  useEffect(() => {
    if (!activeStep) return;
    didScrollRef.current = null;
    const frame = requestAnimationFrame(() => measureTarget(true));
    const timer = window.setInterval(() => measureTarget(false), 200);
    const onResize = () => measureTarget(false);
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onResize, true);

    let observer: ResizeObserver | null = null;
    const observeTimer = window.setTimeout(() => {
      if (targetElRef.current && typeof ResizeObserver !== "undefined") {
        observer = new ResizeObserver(() => measureTarget(false));
        observer.observe(targetElRef.current);
      }
    }, 120);

    return () => {
      cancelAnimationFrame(frame);
      window.clearInterval(timer);
      window.clearTimeout(observeTimer);
      observer?.disconnect();
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
    setPausedId(null);
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
      setActiveId(null);
      setPausedId(null);
      setTargetRect(null);
      setWelcomeOpen(false);
      setCelebrationOpen(true);
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
      setPausedId(null);
      writeStoredStep(shopId, "welcome");
      return;
    }
    goToStep(TOUR_STEPS[idx - 1].id);
  }

  function pauseTour() {
    if (!activeId) return;
    writeStoredStep(shopId, activeId);
    setPausedId(activeId);
    setActiveId(null);
    setTargetRect(null);
  }

  function resumeTour() {
    const stored = pausedId ?? readStoredStep(shopId);
    if (stored && TOUR_STEPS.some((s) => s.id === stored)) {
      setWelcomeOpen(false);
      setPausedId(null);
      setActiveId(stored);
      const def = TOUR_STEPS.find((s) => s.id === stored);
      if (def) router.push(def.href);
      return;
    }
    setWelcomeOpen(true);
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
      setPausedId(null);
      setWelcomeOpen(false);
      setCelebrationOpen(false);
      if (kind === "skip") {
        toast.success("Guia encerrado. Retome quando quiser pela sidebar.");
      }
      router.push("/admin");
      router.refresh();
    });
  }

  function confirmCelebration() {
    finishTour("complete");
  }

  if (!mounted || (status.completed && !celebrationOpen)) return null;

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
            onClose={pauseTour}
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
            especiais, recepção e produtos). Se fechar o guia, retome pela
            sidebar em Continuar guia.
          </p>

          <DialogFooter className="flex-col gap-2 border-white/10 bg-transparent sm:flex-col">
            <Button
              type="button"
              className={cn(ADMIN_SURFACE.btnPrimary, "w-full")}
              onClick={pausedId ? resumeTour : startTour}
            >
              {pausedId ? "Continuar de onde parei" : "Começar o tour"}
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

      <Dialog open={celebrationOpen} onOpenChange={setCelebrationOpen}>
        <DialogContent
          className="max-w-md border-white/10 bg-[#151618] text-[#f5f5f5] sm:rounded-2xl"
          showCloseButton={false}
        >
          <DialogHeader>
            <div className="mb-2 flex size-11 items-center justify-center rounded-xl border border-[rgb(236_241_94_/_30%)] bg-[rgb(236_241_94_/_10%)] text-[#ecf15e]">
              <CheckCircle2 className="size-5" />
            </div>
            <DialogTitle className="text-xl text-[#f5f5f5]">
              Você passou por todos os módulos
            </DialogTitle>
            <DialogDescription className="text-[#b4b6bb]">
              Configurações, equipe, serviços, agenda, caixa e financeiro —
              o painel inteiro. Agora é só preencher os dados da sua loja e
              começar a usar no dia a dia.
            </DialogDescription>
          </DialogHeader>

          <ul className="space-y-2 py-1 text-sm text-[#c8c9cd]">
            {(Object.keys(TOUR_PHASES) as TourPhaseId[]).map((phaseId) => (
              <li key={phaseId} className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-[#ecf15e]" />
                <span>
                  <span className="font-medium text-[#f5f5f5]">
                    {TOUR_PHASES[phaseId].label}
                  </span>
                  <span className={cn("ml-1", ADMIN_SURFACE.muted)}>
                    — {TOUR_PHASES[phaseId].description}
                  </span>
                </span>
              </li>
            ))}
          </ul>

          <DialogFooter className="flex-col gap-2 border-white/10 bg-transparent sm:flex-col">
            <Button
              type="button"
              className={cn(ADMIN_SURFACE.btnPrimary, "w-full")}
              disabled={pending}
              onClick={confirmCelebration}
            >
              Preencher e começar a usar
              <ArrowRight className="size-4" />
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {balloon}
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

  const balloonStyle = useMemo(
    () =>
      ({
        left: 12,
        bottom: 12,
        width: "min(340px, calc(100vw - 24px))",
        maxWidth: 340,
      }) as CSSProperties,
    []
  );

  return (
    <div className="pointer-events-none fixed inset-0 z-[80]">
      {rect ? (
        <>
          <div
            className="absolute left-0 right-0 top-0 bg-black/50"
            style={{ height: Math.max(0, rect.top) }}
          />
          <div
            className="absolute left-0 bg-black/50"
            style={{
              top: rect.top,
              width: Math.max(0, rect.left),
              height: rect.height,
            }}
          />
          <div
            className="absolute bg-black/50"
            style={{
              top: rect.top,
              left: rect.left + rect.width,
              right: 0,
              height: rect.height,
            }}
          />
          <div
            className="absolute bottom-0 left-0 right-0 bg-black/50"
            style={{ top: rect.top + rect.height }}
          />
          <div
            className="absolute rounded-xl border-2 border-[#ecf15e] shadow-[0_0_0_4px_rgba(236,241,94,0.18)]"
            style={{
              top: rect.top,
              left: rect.left,
              width: rect.width,
              height: rect.height,
            }}
          />
        </>
      ) : (
        <div className="absolute inset-0 bg-black/35" />
      )}

      <div
        className="pointer-events-auto absolute z-[81] overflow-visible rounded-2xl border border-white/15 bg-[#151618] p-3.5 text-[#f5f5f5] shadow-2xl sm:p-4"
        style={balloonStyle}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className={cn("text-[11px] tabular-nums", ADMIN_SURFACE.muted)}>
              {phase.label} · {local.current}/{local.total}
              <span className="mx-1.5 text-white/20">·</span>
              Passo {stepNumber}/{stepTotal}
            </p>
            <h3 className="mt-1 text-[15px] font-semibold tracking-tight sm:text-base">
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

        <p className={cn("mt-2 text-[13px] leading-snug", ADMIN_SURFACE.muted)}>
          {waiting
            ? "Abrindo a tela… o destaque aparece em instantes."
            : step.body}
        </p>

        <div className="mt-3 flex flex-col gap-1.5 border-t border-white/10 pt-3">
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
          <div className="flex items-center justify-center gap-3">
            {step.optional ? (
              <button
                type="button"
                className="text-[11px] text-[#b4b6bb] underline-offset-2 hover:underline"
                onClick={onNext}
              >
                Pular passo
              </button>
            ) : null}
            <button
              type="button"
              className="text-[11px] text-[#8b8d93] underline-offset-2 hover:underline"
              disabled={pending}
              onClick={onSkip}
            >
              Encerrar guia
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
