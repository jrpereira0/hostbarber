"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ListChecks } from "lucide-react";
import {
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  TOUR_PROGRESS_EVENT,
  readTourProgress,
} from "@/lib/onboarding";

type SidebarOnboardingLinkProps = {
  shopId: string;
};

export function SidebarOnboardingLink({ shopId }: SidebarOnboardingLinkProps) {
  const { setOpenMobile } = useSidebar();
  const [progress, setProgress] = useState<ReturnType<
    typeof readTourProgress
  > | null>(null);

  useEffect(() => {
    function sync() {
      setProgress(readTourProgress(shopId));
    }
    sync();
    window.addEventListener(TOUR_PROGRESS_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(TOUR_PROGRESS_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, [shopId]);

  const inProgress = Boolean(progress);
  const href = inProgress ? "/admin?guia=continuar" : "/admin?guia=1";
  const label = inProgress ? "Continuar guia" : "Guia inicial";

  return (
    <SidebarMenuItem>
      <div className="flex flex-col gap-1">
        <SidebarMenuButton
          asChild
          isActive={false}
          tooltip={
            inProgress
              ? `Continuar guia · passo ${progress!.current} de ${progress!.total}`
              : "Guia inicial"
          }
          onClick={() => setOpenMobile(false)}
          className={
            inProgress
              ? "border border-[rgb(236_241_94_/_35%)] bg-[rgb(236_241_94_/_8%)] text-[#ecf15e] hover:bg-[rgb(236_241_94_/_12%)] hover:text-[#ecf15e]"
              : undefined
          }
        >
          <Link href={href}>
            <ListChecks />
            <span>{label}</span>
            {inProgress ? (
              <span className="ml-auto text-[10px] tabular-nums opacity-80 group-data-[collapsible=icon]:hidden">
                {progress!.current}/{progress!.total}
              </span>
            ) : null}
          </Link>
        </SidebarMenuButton>
        {inProgress ? (
          <div className="px-2 pb-1 group-data-[collapsible=icon]:hidden">
            <div className="h-1 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-[#ecf15e] transition-[width] duration-300"
                style={{ width: `${progress!.percent}%` }}
              />
            </div>
            <p className="mt-1 text-[10px] leading-tight text-sidebar-foreground/50">
              Retome para conhecer o painel todo
            </p>
          </div>
        ) : null}
      </div>
    </SidebarMenuItem>
  );
}
