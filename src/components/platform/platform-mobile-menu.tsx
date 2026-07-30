"use client";

import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Menu } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { useSidebar } from "@/components/ui/sidebar";

function noopSubscribe() {
  return () => {};
}

function useMounted() {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false
  );
}

export function PlatformMobileMenu() {
  const { setOpenMobile } = useSidebar();
  const mounted = useMounted();

  const header = (
    <header className="admin-mobile-topbar fixed top-0 left-0 z-50 flex h-14 w-full items-center justify-between gap-3 px-3 md:hidden">
      <BrandLogo
        href="/plataforma"
        size="md"
        subtitle="Plataforma"
        className="min-w-0 shrink"
        nameClassName="admin-sidebar-brand-name text-[13px] text-[#f5f5f5]"
        subtitleClassName="text-[10px] tracking-wide text-[#8b8d93]"
      />

      <button
        type="button"
        onClick={() => setOpenMobile(true)}
        aria-label="Abrir menu"
        className="admin-mobile-menu-btn inline-flex size-10 shrink-0 items-center justify-center rounded-xl border border-white/12 bg-[#151618] text-[#ecf15e] transition-colors hover:border-[rgb(236_241_94_/_35%)] hover:bg-[rgb(236_241_94_/_10%)]"
      >
        <Menu className="size-[18px]" strokeWidth={2} aria-hidden />
      </button>
    </header>
  );

  return (
    <>
      {mounted ? createPortal(header, document.body) : null}
      <div className="h-14 shrink-0 md:hidden" aria-hidden />
    </>
  );
}
