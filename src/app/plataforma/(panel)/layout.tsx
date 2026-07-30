import { redirect } from "next/navigation";
import { getPlatformAdminSession } from "@/lib/require-platform-admin";
import { platformLoginUrl } from "@/lib/platform-login-path";
import { requireServerClient } from "@/lib/supabase/server";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AdminSidebarToggle } from "@/components/admin/admin-sidebar-toggle";
import { PlatformSidebar } from "@/components/platform/platform-sidebar";
import { PlatformMobileMenu } from "@/components/platform/platform-mobile-menu";
import { ADMIN_SURFACE } from "@/lib/admin-surface";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function PlataformaPanelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await requireServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(platformLoginUrl());
  }

  const session = await getPlatformAdminSession();
  if (!session) {
    await supabase.auth.signOut();
    redirect(platformLoginUrl("perfil"));
  }

  const metaName =
    typeof user.user_metadata?.full_name === "string"
      ? user.user_metadata.full_name.trim()
      : "";
  const userName =
    metaName || session.email.split("@")[0] || "Superadmin";

  return (
    <TooltipProvider>
      <SidebarProvider>
        <PlatformSidebar userName={userName} userEmail={session.email} />
        <SidebarInset
          className={cn(
            "flex min-h-svh min-w-0 flex-col overflow-x-hidden",
            ADMIN_SURFACE.page
          )}
        >
          <AdminSidebarToggle />
          <PlatformMobileMenu />
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto overflow-x-hidden p-4 md:p-8">
            {children}
          </div>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}
