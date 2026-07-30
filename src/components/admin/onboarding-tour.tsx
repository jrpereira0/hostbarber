"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  useTransition,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
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
  TOUR_STEPS,
  tourStorageKey,
  type OnboardingStatus,
  type OnboardingStepId,
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
  /** Se true, abre o modal de boas-vindas imediatamente. */
  forceWelcome?: boolean;
};

type Rect = { top: number; left: number; width: number; height: number };

function readStoredStep(shopId: string): OnboardingStepId | null {
  try {
    const raw = localStorage.getItem(tourStorageKey(shopId));
    if (!raw) return null;
    return raw as OnboardingStepId;
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

export function OnboardingTour({
  shopId,
  shopName,
  status,
  forceWelcome = false,
}: OnboardingTourProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  const [activeId, setActiveId] = useState<OnboardingStepId | null>(null);
  const [targetRect, setTargetRect] = useState<Rect | null>(null);
  const [pending, startTransition] = useTransition();

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

  const measureTarget = useCallback(() => {
    if (!activeStep) {
      setTargetRect(null);
      return;
    }
    const el = document.querySelector<HTMLElement>(
      `[data-tour="${activeStep.target}"]`
    );
    if (!el) {
      setTargetRect(null);
      return;
    }
    const r = el.getBoundingClientRect();
    const pad = 8;
    setTargetRect({
      top: r.top - pad,
      left: r.left - pad,
      width: r.width + pad * 2,
      height: r.height + pad * 2,
    });
    el.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [activeStep]);

  useLayoutEffect(() => {
    if (!activeStep) return;
    const frame = requestAnimationFrame(() => measureTarget());
    const onResize = () => measureTarget();
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onResize, true);
    const timer = window.setInterval(() => measureTarget(), 500);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onResize, true);
      window.clearInterval(timer);
    };
  }, [activeStep, pathname, measureTarget]);

  // Se o passo aponta para outra rota, navega.
  useEffect(() => {
    if (!activeStep) return;
    const targetPath = activeStep.href.split("?")[0];
    if (pathname !== targetPath) {
      router.push(activeStep.href);
    }
  }, [activeStep, pathname, router]);

  function goToStep(id: OnboardingStepId) {
    writeStoredStep(shopId, id);
    setActiveId(id === "welcome" ? null : id);
    if (id === "welcome") {
      setWelcomeOpen(true);
      return;
    }
    setWelcomeOpen(false);
    const def = TOUR_STEPS.find((s) => s.id === id);
    if (def) router.push(def.href);
  }

  function startTour() {
    const start =
      status.suggestedStepId === "done" || status.suggestedStepId === "welcome"
        ? "profile"
        : status.suggestedStepId === "hours" ||
            status.suggestedStepId === "profile" ||
            status.suggestedStepId === "team" ||
            status.suggestedStepId === "services" ||
            status.suggestedStepId === "products" ||
            status.suggestedStepId === "cash"
          ? status.suggestedStepId
          : "profile";
    goToStep(start);
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
          ? "Guia concluído. Boa operação!"
          : "Guia encerrado. Você pode retomar pelo menu."
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
          className="max-w-md border-white/10 bg-[#151618] text-[#f5f5f5] sm:rounded-2xl"
          showCloseButton={false}
        >
          <DialogHeader>
            <div className="mb-2 flex size-11 items-center justify-center rounded-xl border border-white/10 bg-[#1a1b1e] text-[#ecf15e]">
              <ListChecks className="size-5" />
            </div>
            <DialogTitle className="text-xl text-[#f5f5f5]">
              Vamos configurar {shopName}
            </DialogTitle>
            <DialogDescription className="text-[#b4b6bb]">
              Em poucos passos você deixa a loja pronta: perfil, horários,
              equipe, serviços e o caixa. O guia aponta o que preencher em cada
              tela.
            </DialogDescription>
          </DialogHeader>

          <ol className="space-y-2 py-1">
            {TOUR_STEPS.map((step, i) => (
              <li
                key={step.id}
                className="flex items-center gap-3 rounded-lg border border-white/10 bg-[#1a1b1e] px-3 py-2.5 text-sm"
              >
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-[rgb(236_241_94_/_35%)] text-[11px] font-semibold text-[#ecf15e]">
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1 text-[#f5f5f5]">
                  {step.title}
                  {step.optional ? (
                    <span className="ml-1 text-xs text-[#8b8d93]">
                      (opcional)
                    </span>
                  ) : null}
                </span>
                {isStepDataDone(step.id, status) ? (
                  <Check className="size-4 shrink-0 text-[#ecf15e]" />
                ) : null}
              </li>
            ))}
          </ol>

          <DialogFooter className="flex-col gap-2 border-white/10 bg-transparent sm:flex-col">
            <Button
              type="button"
              className={cn(ADMIN_SURFACE.btnPrimary, "w-full")}
              onClick={startTour}
            >
              Iniciar
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

      {/* Atalho flutuante para retomar o guia */}
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

function isStepDataDone(id: TourStepDef["id"], status: OnboardingStatus) {
  if (id === "profile" || id === "hours") return status.shopDone;
  if (id === "team") return status.teamDone;
  if (id === "services") return status.servicesDone;
  if (id === "products") return status.productsDone;
  return false;
}

function TourOverlay({
  rect,
  step,
  stepNumber,
  stepTotal,
  pending,
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
  onNext: () => void;
  onPrev: () => void;
  onSkip: () => void;
  onClose: () => void;
}) {
  const balloonStyle = useMemo(() => {
    if (!rect) {
      return {
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        } as CSSProperties;
    }

    const gap = 12;
    const balloonApprox = 280;
    const spaceBelow = window.innerHeight - (rect.top + rect.height);
    const placeBelow = spaceBelow > balloonApprox || rect.top < balloonApprox;

    const left = Math.min(
      Math.max(16, rect.left),
      window.innerWidth - 16 - Math.min(340, window.innerWidth - 32)
    );

    if (placeBelow) {
      return {
        top: rect.top + rect.height + gap,
        left,
        maxWidth: Math.min(340, window.innerWidth - 32),
      } as CSSProperties;
    }

    return {
      top: Math.max(16, rect.top - gap - 220),
      left,
      maxWidth: Math.min(340, window.innerWidth - 32),
    } as CSSProperties;
  }, [rect]);

  return (
    <div className="pointer-events-none fixed inset-0 z-[80]">
      {/* Escurece a tela */}
      <div className="absolute inset-0 bg-black/70" />

      {/* Recorte do alvo */}
      {rect ? (
        <div
          className="absolute rounded-xl border-2 border-[#ecf15e] bg-transparent shadow-[0_0_0_9999px_rgba(0,0,0,0.72)]"
          style={{
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height,
          }}
        />
      ) : null}

      {/* Balão */}
      <div
        className="pointer-events-auto absolute z-[81] w-[min(340px,calc(100vw-2rem))] rounded-2xl border border-white/15 bg-[#151618] p-4 text-[#f5f5f5] shadow-2xl"
        style={balloonStyle}
      >
        <div className="mb-3 flex items-start justify-between gap-2">
          <div>
            <p className={ADMIN_SURFACE.sectionLabel}>
              Passo {stepNumber} de {stepTotal}
            </p>
            <h3 className="mt-1 text-base font-semibold tracking-tight">
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
          {step.body}
        </p>

        <div className="mt-4 flex flex-col gap-2">
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
              className={cn(ADMIN_SURFACE.btnPrimary, "flex-[1.4]")}
              onClick={onNext}
              disabled={pending}
            >
              {stepNumber >= stepTotal ? "Concluir" : "Próximo"}
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
              Pular produtos
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
