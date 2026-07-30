import Link from "next/link";
import { ArrowRight, ListChecks } from "lucide-react";
import { ONBOARDING_PATH } from "@/lib/onboarding";
import { ADMIN_SURFACE } from "@/lib/admin-surface";
import { cn } from "@/lib/utils";

type OnboardingBannerProps = {
  nextLabel: string;
  requiredDone: number;
  requiredTotal: number;
};

/** Faixa discreta na agenda enquanto o dono não concluiu o setup. */
export function OnboardingBanner({
  nextLabel,
  requiredDone,
  requiredTotal,
}: OnboardingBannerProps) {
  return (
    <Link
      href={ONBOARDING_PATH}
      className={cn(
        "flex items-center justify-between gap-3 rounded-xl border border-[rgb(236_241_94_/_28%)] bg-[rgb(236_241_94_/_8%)] px-4 py-3 transition-colors hover:bg-[rgb(236_241_94_/_12%)]"
      )}
    >
      <div className="flex min-w-0 items-start gap-3">
        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md border border-[rgb(236_241_94_/_35%)] text-[#ecf15e]">
          <ListChecks className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-medium text-[#f5f5f5]">
            Continue a configuração da loja
          </p>
          <p className={cn("mt-0.5 text-xs sm:text-sm", ADMIN_SURFACE.muted)}>
            {requiredDone}/{requiredTotal} essenciais · próximo: {nextLabel}
          </p>
        </div>
      </div>
      <ArrowRight className="size-4 shrink-0 text-[#ecf15e]" />
    </Link>
  );
}
