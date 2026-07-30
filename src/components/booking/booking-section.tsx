"use client";

import { useEffect, useState } from "react";
import { Calendar, CirclePlus, MapPin, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { BookingFlow } from "@/components/booking/booking-flow";
import { MyAppointments } from "@/components/booking/my-appointments";
import { MyAccount } from "@/components/booking/my-account";
import { ShopInfoPanel } from "@/components/booking/shop-info-panel";
import { ClientSessionProvider } from "@/components/booking/client-session-context";
import type { ShopCatalog } from "@/lib/get-shop-catalog";

type Mode = "book" | "manage" | "account" | "info";

type BookingSectionProps = {
  catalog: ShopCatalog;
  today: string;
};

/** Ordem e labels iguais ao app (`app/(tabs)/_layout.tsx`). */
const tabs: {
  id: Mode;
  label: string;
  icon: typeof CirclePlus;
  hash: string | null;
}[] = [
  { id: "book", label: "Agendar", icon: CirclePlus, hash: null },
  {
    id: "manage",
    label: "Horários",
    icon: Calendar,
    hash: "#meus-agendamentos",
  },
  { id: "account", label: "Conta", icon: User, hash: "#conta" },
  { id: "info", label: "Local", icon: MapPin, hash: "#local" },
];

function modeFromHash(hash: string): Mode {
  if (hash === "#meus-agendamentos") return "manage";
  if (hash === "#conta") return "account";
  if (hash === "#local") return "info";
  return "book";
}

export function BookingSection({ catalog, today }: BookingSectionProps) {
  const [mode, setMode] = useState<Mode>("book");

  useEffect(() => {
    function syncFromHash() {
      setMode(modeFromHash(window.location.hash));
    }

    syncFromHash();
    window.addEventListener("hashchange", syncFromHash);
    return () => window.removeEventListener("hashchange", syncFromHash);
  }, []);

  function selectMode(next: Mode) {
    setMode(next);
    const tab = tabs.find((item) => item.id === next);
    window.history.replaceState(
      null,
      "",
      tab?.hash ?? window.location.pathname
    );
  }

  return (
    <ClientSessionProvider shopSlug={catalog.shop.slug}>
      <div className="booking-app-shell flex h-dvh flex-col overflow-hidden pt-[env(safe-area-inset-top)]">
        <main
          id="agendar"
          className="relative z-10 mx-auto flex min-h-0 w-full max-w-lg flex-1 flex-col"
        >
          <div id="meus-agendamentos" className="flex min-h-0 flex-1 flex-col">
            <div
              className={cn(
                "min-h-0 flex-1 flex-col",
                mode === "book" ? "flex" : "hidden"
              )}
              aria-hidden={mode !== "book"}
              inert={mode !== "book" ? true : undefined}
            >
              <BookingFlow catalog={catalog} today={today} />
            </div>
            <div
              className={cn(
                "min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain",
                mode === "manage" ? "flex" : "hidden"
              )}
              aria-hidden={mode !== "manage"}
              inert={mode !== "manage" ? true : undefined}
            >
              <MyAppointments catalog={catalog} today={today} />
            </div>
            <div
              id="conta"
              className={cn(
                "min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain",
                mode === "account" ? "flex" : "hidden"
              )}
              aria-hidden={mode !== "account"}
              inert={mode !== "account" ? true : undefined}
            >
              <MyAccount shopSlug={catalog.shop.slug} />
            </div>
            <div
              className={cn(
                "min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain",
                mode === "info" ? "flex" : "hidden"
              )}
              aria-hidden={mode !== "info"}
              inert={mode !== "info" ? true : undefined}
            >
              <ShopInfoPanel
                shop={catalog.shop}
                businessHours={catalog.businessHours}
              />
            </div>
          </div>
        </main>

        <nav
          aria-label="Menu principal"
          className="relative z-20 shrink-0 border-t border-white/10 bg-[#0e0f11]"
        >
          <div className="mx-auto grid max-w-lg grid-cols-4 px-1 pb-[max(0.625rem,env(safe-area-inset-bottom))] pt-1.5">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const active = mode === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => selectMode(tab.id)}
                  className={cn(
                    "flex min-h-[3.25rem] flex-col items-center justify-center gap-0.5 px-1 text-[10px] font-medium tracking-[0.03em] transition-colors",
                    active
                      ? "text-primary"
                      : "text-muted-foreground active:text-foreground"
                  )}
                >
                  <Icon
                    className="size-[22px]"
                    strokeWidth={active ? 2.25 : 1.75}
                    fill={
                      active && tab.id !== "book" ? "currentColor" : "none"
                    }
                  />
                  <span className="mt-0.5">{tab.label}</span>
                </button>
              );
            })}
          </div>
        </nav>
      </div>
    </ClientSessionProvider>
  );
}
