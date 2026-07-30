"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ShopProfileForm,
  type ShopProfileValues,
} from "@/components/admin/shop-profile-form";
import {
  BusinessHoursForm,
  type BusinessDay,
} from "@/components/admin/business-hours-form";
import {
  ExceptionsCard,
  type ExceptionItem,
} from "@/components/admin/exceptions-card";
import { ConfirmationMessageForm } from "@/components/admin/confirmation-message-form";
import { ReceptionStaffForm } from "@/components/admin/reception-staff-form";
import { BookingLinkForm } from "@/components/admin/booking-link-form";
import type { ReceptionStaffItem } from "@/app/admin/(panel)/configuracoes/reception-actions";
import { ADMIN_SURFACE } from "@/lib/admin-surface";
import { cn } from "@/lib/utils";

type SettingsViewProps = {
  profile: ShopProfileValues;
  slug: string;
  businessDays: BusinessDay[];
  slotStepMinutes: number;
  exceptions: ExceptionItem[];
  professionals: { id: string; nickname: string }[];
  confirmationWhatsappMessage: string;
  confirmationWhatsappEnabled: boolean;
  receptionStaff: ReceptionStaffItem[];
  defaultTab?: string;
};

const SETTINGS_TABS = [
  "perfil",
  "link",
  "horarios",
  "excecoes",
  "mensagens",
  "recepcao",
] as const;

type SettingsTab = (typeof SETTINGS_TABS)[number];

function resolveTab(value: string | null | undefined): SettingsTab {
  if (value && SETTINGS_TABS.includes(value as SettingsTab)) {
    return value as SettingsTab;
  }
  return "perfil";
}

export function SettingsView({
  profile,
  slug,
  businessDays,
  slotStepMinutes,
  exceptions,
  professionals,
  confirmationWhatsappMessage,
  confirmationWhatsappEnabled,
  receptionStaff,
  defaultTab = "perfil",
}: SettingsViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = resolveTab(searchParams.get("tab") ?? defaultTab);

  function handleTabChange(next: string) {
    const resolved = resolveTab(next);
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", resolved);
    router.replace(`/admin/configuracoes?${params.toString()}`, {
      scroll: false,
    });
  }

  return (
    <Tabs
      value={tab}
      onValueChange={handleTabChange}
      className="flex w-full flex-col gap-4"
    >
      <div
        data-tour="tour-settings-tabs"
        className="-mx-1 overflow-x-auto px-1 pb-0.5"
      >
        <TabsList className="h-auto w-max min-w-full flex-nowrap justify-start gap-1 rounded-xl border border-white/10 bg-white/[0.04] p-1">
          <TabsTrigger value="perfil" className="flex-none px-3">
            Perfil
          </TabsTrigger>
          <TabsTrigger value="link" className="flex-none px-3">
            Link
          </TabsTrigger>
          <TabsTrigger value="horarios" className="flex-none px-3">
            Horários
          </TabsTrigger>
          <TabsTrigger value="excecoes" className="flex-none px-3">
            Dias especiais
            {exceptions.length > 0 ? (
              <span className={cn("tabular-nums", ADMIN_SURFACE.muted)}>
                ({exceptions.length})
              </span>
            ) : null}
          </TabsTrigger>
          <TabsTrigger value="mensagens" className="flex-none px-3">
            Mensagens
          </TabsTrigger>
          <TabsTrigger value="recepcao" className="flex-none px-3">
            Recepção
          </TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="perfil" className="mt-0" forceMount>
        <div className={cn(tab !== "perfil" && "hidden")}>
          <ShopProfileForm initialValues={profile} />
        </div>
      </TabsContent>

      <TabsContent value="link" className="mt-0" forceMount>
        <div className={cn(tab !== "link" && "hidden")}>
          <BookingLinkForm initialSlug={slug} />
        </div>
      </TabsContent>

      <TabsContent value="horarios" className="mt-0" forceMount>
        <div className={cn(tab !== "horarios" && "hidden")}>
          <BusinessHoursForm
            initialDays={businessDays}
            initialSlotStep={slotStepMinutes}
          />
        </div>
      </TabsContent>

      <TabsContent value="excecoes" className="mt-0" forceMount>
        <div className={cn(tab !== "excecoes" && "hidden")}>
          <ExceptionsCard
            exceptions={exceptions}
            professionals={professionals}
          />
        </div>
      </TabsContent>

      <TabsContent value="mensagens" className="mt-0" forceMount>
        <div className={cn(tab !== "mensagens" && "hidden")}>
          <ConfirmationMessageForm
            initialMessage={confirmationWhatsappMessage}
            initialEnabled={confirmationWhatsappEnabled}
            shopName={profile.shopName}
          />
        </div>
      </TabsContent>

      <TabsContent value="recepcao" className="mt-0" forceMount>
        <div className={cn(tab !== "recepcao" && "hidden")}>
          <ReceptionStaffForm initialStaff={receptionStaff} />
        </div>
      </TabsContent>
    </Tabs>
  );
}
