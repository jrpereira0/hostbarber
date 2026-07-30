import { redirect } from "next/navigation";
import { requireServerClient } from "@/lib/supabase/server";
import { getAdminSession } from "@/lib/require-admin";
import { LOGIN_PATH } from "@/lib/login-path";
import {
  getOnboardingStatus,
  type OnboardingStepId,
} from "@/lib/onboarding";
import { OnboardingView } from "@/components/admin/onboarding-view";

export const dynamic = "force-dynamic";

const STEP_IDS: OnboardingStepId[] = [
  "shop",
  "team",
  "services",
  "products",
  "cash",
];

type PageProps = {
  searchParams: Promise<{ passo?: string }>;
};

export default async function PrimeirosPassosPage({ searchParams }: PageProps) {
  const session = await getAdminSession();
  if (!session) redirect(LOGIN_PATH);
  if (!session.isOwner) redirect("/admin");

  const { passo } = await searchParams;
  const initialStep =
    passo && STEP_IDS.includes(passo as OnboardingStepId)
      ? (passo as OnboardingStepId)
      : undefined;

  const supabase = await requireServerClient();
  const [{ data: shop }, status] = await Promise.all([
    supabase
      .from("shops")
      .select("name")
      .eq("id", session.shopId)
      .maybeSingle(),
    getOnboardingStatus(supabase, session.shopId),
  ]);

  return (
    <OnboardingView
      status={status}
      shopName={shop?.name?.trim() || "sua barbearia"}
      initialStep={initialStep}
    />
  );
}
