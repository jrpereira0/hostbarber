import { redirect } from "next/navigation";
import { requireServerClient } from "@/lib/supabase/server";
import { LOGIN_PATH, loginUrl } from "@/lib/login-path";
import { SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppSidebar } from "@/components/admin/app-sidebar";
import { AdminMobileMenu } from "@/components/admin/admin-mobile-menu";
import { AdminSidebarToggle } from "@/components/admin/admin-sidebar-toggle";
import { AdminPanelContent } from "@/components/admin/admin-panel-content";
import { AdminPanelInset } from "@/components/admin/admin-panel-inset";
import { bookingPathForSlug } from "@/lib/booking-path";

// Painel exige sessão e banco: não pré-renderiza no build da Vercel.
export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await requireServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(LOGIN_PATH);
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role, shop_id")
    .eq("id", user.id)
    .single();

  if (
    !profile ||
    !profile.shop_id ||
    (profile.role !== "owner" &&
      profile.role !== "barber" &&
      profile.role !== "reception")
  ) {
    const { data: platformAdmin } = await supabase
      .from("platform_admins")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (platformAdmin) {
      redirect("/plataforma");
    }

    redirect(loginUrl("perfil"));
  }

  const role =
    profile.role === "owner" ||
    profile.role === "barber" ||
    profile.role === "reception"
      ? profile.role
      : "barber";

  const { data: shop } = await supabase
    .from("shops")
    .select("slug, active")
    .eq("id", profile.shop_id)
    .maybeSingle();

  if (!shop?.active) {
    await supabase.auth.signOut();
    redirect(loginUrl("inativa"));
  }

  const bookingHref = shop.slug
    ? bookingPathForSlug(shop.slug)
    : "/agenda";

  const showOnboarding = role === "owner";

  return (
    <TooltipProvider>
      <SidebarProvider>
        <AppSidebar
          role={role}
          userName={profile?.full_name || "Usuário"}
          userEmail={user.email ?? ""}
          bookingHref={bookingHref}
          showOnboarding={showOnboarding}
        />
        <AdminPanelInset>
          <AdminSidebarToggle />
          <AdminMobileMenu />
          <AdminPanelContent>{children}</AdminPanelContent>
        </AdminPanelInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}
