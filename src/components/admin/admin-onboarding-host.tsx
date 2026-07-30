"use client";

import { useSearchParams } from "next/navigation";
import { OnboardingTour } from "@/components/admin/onboarding-tour";
import type { OnboardingStatus } from "@/lib/onboarding";

type AdminOnboardingHostProps = {
  shopId: string;
  shopName: string;
  status: OnboardingStatus;
};

export function AdminOnboardingHost({
  shopId,
  shopName,
  status,
}: AdminOnboardingHostProps) {
  const searchParams = useSearchParams();
  if (status.completed) return null;

  const guia = searchParams.get("guia");
  const forceWelcome = guia === "1";
  const forceResume = guia === "continuar";

  return (
    <OnboardingTour
      shopId={shopId}
      shopName={shopName}
      status={status}
      forceWelcome={forceWelcome}
      forceResume={forceResume}
    />
  );
}
