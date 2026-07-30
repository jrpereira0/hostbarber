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
  requestTourResume,
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
  const label = inProgress ? "Continuar guia" : "Guia inicial";
  const tooltip = inProgress
    ? `Continuar guia · passo ${progress!.current} de ${progress!.total}`
    : "Guia inicial";

  if (inProgress) {
    return (
      <SidebarMenuItem>
        <SidebarMenuButton
          type="button"
          isActive={false}
          tooltip={tooltip}
          onClick={() => {
            setOpenMobile(false);
            requestTourResume();
          }}
        >
          <ListChecks />
          <span>{label}</span>
          <span className="ml-auto text-[11px] tabular-nums text-sidebar-foreground/45 group-data-[collapsible=icon]:hidden">
            {progress!.current}/{progress!.total}
          </span>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  }

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        asChild
        isActive={false}
        tooltip={tooltip}
        onClick={() => setOpenMobile(false)}
      >
        <Link href="/admin?guia=1">
          <ListChecks />
          <span>{label}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}
