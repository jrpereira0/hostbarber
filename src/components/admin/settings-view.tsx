"use client";

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
};

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
}: SettingsViewProps) {
  return (
    <Tabs defaultValue="perfil" className="flex w-full flex-col gap-4">
      <div className="-mx-1 overflow-x-auto px-1 pb-0.5">
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

      <TabsContent value="perfil" className="mt-0">
        <ShopProfileForm initialValues={profile} />
      </TabsContent>

      <TabsContent value="link" className="mt-0">
        <BookingLinkForm initialSlug={slug} />
      </TabsContent>

      <TabsContent value="horarios" className="mt-0">
        <BusinessHoursForm
          initialDays={businessDays}
          initialSlotStep={slotStepMinutes}
        />
      </TabsContent>

      <TabsContent value="excecoes" className="mt-0">
        <ExceptionsCard
          exceptions={exceptions}
          professionals={professionals}
        />
      </TabsContent>

      <TabsContent value="mensagens" className="mt-0">
        <ConfirmationMessageForm
          initialMessage={confirmationWhatsappMessage}
          initialEnabled={confirmationWhatsappEnabled}
          shopName={profile.shopName}
        />
      </TabsContent>

      <TabsContent value="recepcao" className="mt-0">
        <ReceptionStaffForm initialStaff={receptionStaff} />
      </TabsContent>
    </Tabs>
  );
}
