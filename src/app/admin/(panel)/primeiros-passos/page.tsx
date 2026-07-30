import { redirect } from "next/navigation";
import { requireServerClient } from "@/lib/supabase/server";
import { getAdminSession } from "@/lib/require-admin";
import { LOGIN_PATH } from "@/lib/login-path";
import { formatCep, formatTime } from "@/lib/format";
import { getOnboardingStatus } from "@/lib/onboarding";
import { OnboardingView } from "@/components/admin/onboarding-view";
import type { BusinessDay } from "@/components/admin/business-hours-form";
import { ensureDefaultProductCategory } from "./actions";

export const dynamic = "force-dynamic";

export const metadata = { title: "Primeiros passos" };

export default async function PrimeirosPassosPage() {
  const session = await getAdminSession();
  if (!session) redirect(LOGIN_PATH);
  if (!session.isOwner) redirect("/admin");

  const supabase = await requireServerClient();
  const shopId = session.shopId;

  await ensureDefaultProductCategory();

  const [
    status,
    { data: shop },
    { data: businessHours },
    { data: services },
    { data: professionals },
    { data: categories },
  ] = await Promise.all([
    getOnboardingStatus(supabase, shopId),
    supabase.from("shops").select("*").eq("id", shopId).maybeSingle(),
    supabase
      .from("business_hours")
      .select("*")
      .eq("shop_id", shopId)
      .order("weekday"),
    supabase
      .from("services")
      .select("id, name")
      .eq("shop_id", shopId)
      .eq("active", true)
      .order("name"),
    supabase
      .from("professionals")
      .select("id, nickname")
      .eq("shop_id", shopId)
      .eq("active", true)
      .order("nickname"),
    supabase
      .from("product_categories")
      .select("id, name")
      .eq("shop_id", shopId)
      .eq("active", true)
      .order("sort_order")
      .order("name"),
  ]);

  const businessDays: BusinessDay[] = (businessHours ?? []).map((b) => ({
    weekday: b.weekday,
    active: b.active,
    openTime: formatTime(b.open_time),
    closeTime: formatTime(b.close_time),
  }));

  return (
    <OnboardingView
      status={status}
      shopName={shop?.name?.trim() || "sua barbearia"}
      profile={{
        shopName: shop?.name ?? "",
        bio: shop?.bio ?? "",
        cep: shop?.cep ? formatCep(shop.cep) : "",
        street: shop?.street ?? "",
        addressNumber: shop?.address_number ?? "",
        addressComplement: shop?.address_complement ?? "",
        neighborhood: shop?.neighborhood ?? "",
        city: shop?.city ?? "",
        state: shop?.state ?? "",
        whatsapp: shop?.whatsapp ?? "",
        instagram: shop?.instagram ?? "",
        logoUrl: shop?.logo_url ?? null,
      }}
      businessDays={businessDays}
      slotStepMinutes={shop?.slot_step_minutes ?? 15}
      services={services ?? []}
      professionals={professionals ?? []}
      businessHours={(businessHours ?? []).map((b) => ({
        weekday: b.weekday,
        active: b.active,
      }))}
      categories={categories ?? []}
    />
  );
}
