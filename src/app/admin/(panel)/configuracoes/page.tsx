import { requireServerClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/admin/page-header";
import { SettingsView } from "@/components/admin/settings-view";
import { assertOwnerSettingsPage } from "@/lib/require-owner";
import { getAdminSession } from "@/lib/require-admin";
import { formatCep, formatTime } from "@/lib/format";
import { ADMIN_SURFACE } from "@/lib/admin-surface";
import { cn } from "@/lib/utils";
import type { BusinessDay } from "@/components/admin/business-hours-form";
import type { ExceptionItem } from "@/components/admin/exceptions-card";
import { DEFAULT_CONFIRMATION_WHATSAPP_MESSAGE } from "@/lib/confirmation-message";
import { loadReceptionStaffForSettings } from "@/app/admin/(panel)/configuracoes/reception-actions";
import { redirect } from "next/navigation";

export const metadata = { title: "Configurações" };

export default async function SettingsPage() {
  await assertOwnerSettingsPage();

  const session = await getAdminSession();
  if (!session?.isOwner) redirect("/admin");

  const supabase = await requireServerClient();
  const today = new Date().toISOString().slice(0, 10);
  const shopId = session.shopId;

  const [
    { data: businessHours },
    { data: professionals },
    { data: exceptions },
    { data: settings },
    receptionStaff,
  ] = await Promise.all([
    supabase
      .from("business_hours")
      .select("*")
      .eq("shop_id", shopId)
      .order("weekday"),
    supabase
      .from("professionals")
      .select("id, nickname")
      .eq("shop_id", shopId)
      .eq("active", true)
      .order("nickname"),
    supabase
      .from("schedule_exceptions")
      .select(
        "id, date, kind, start_time, end_time, note, professionals(nickname)"
      )
      .eq("shop_id", shopId)
      .gte("date", today)
      .order("date"),
    supabase.from("shops").select("*").eq("id", shopId).single(),
    loadReceptionStaffForSettings(shopId),
  ]);

  const businessDays: BusinessDay[] = (businessHours ?? []).map((b) => ({
    weekday: b.weekday,
    active: b.active,
    openTime: formatTime(b.open_time),
    closeTime: formatTime(b.close_time),
  }));

  const exceptionItems: ExceptionItem[] = (exceptions ?? []).map((e) => ({
    id: e.id,
    date: e.date,
    kind: e.kind as "closed" | "custom",
    startTime: e.start_time,
    endTime: e.end_time,
    note: e.note,
    professionalNickname:
      (e.professionals as { nickname: string }[] | null)?.[0]?.nickname ?? null,
  }));

  return (
    <div
      className={cn(
        "admin-page -m-4 flex min-h-full flex-col p-4 md:-m-8 md:p-8",
        ADMIN_SURFACE.page
      )}
    >
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 pb-8">
        <PageHeader
          tone="dark"
          title="Configurações"
          description="Perfil, horários, dias especiais, recepção, mensagens e integrações da barbearia."
        />

        <SettingsView
          slug={settings?.slug ?? ""}
          profile={{
            shopName: settings?.name ?? "",
            bio: settings?.bio ?? "",
            cep: settings?.cep ? formatCep(settings.cep) : "",
            street: settings?.street ?? "",
            addressNumber: settings?.address_number ?? "",
            addressComplement: settings?.address_complement ?? "",
            neighborhood: settings?.neighborhood ?? "",
            city: settings?.city ?? "",
            state: settings?.state ?? "",
            whatsapp: settings?.whatsapp ?? "",
            instagram: settings?.instagram ?? "",
            logoUrl: settings?.logo_url ?? null,
          }}
          businessDays={businessDays}
          slotStepMinutes={settings?.slot_step_minutes ?? 15}
          exceptions={exceptionItems}
          professionals={(professionals ?? []).map((p) => ({
            id: p.id,
            nickname: p.nickname,
          }))}
          confirmationWhatsappMessage={
            settings?.confirmation_whatsapp_message?.trim()
              ? settings.confirmation_whatsapp_message
              : DEFAULT_CONFIRMATION_WHATSAPP_MESSAGE
          }
          confirmationWhatsappEnabled={
            settings?.confirmation_whatsapp_enabled ?? true
          }
          receptionStaff={receptionStaff}
        />
      </div>
    </div>
  );
}
