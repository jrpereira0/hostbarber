"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, Store, Wallet } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { BrandLogo } from "@/components/brand-logo";
import { platformSignOut } from "@/app/plataforma/(panel)/actions";
import { cn } from "@/lib/utils";

const navItems = [
  { title: "Clientes", url: "/plataforma", icon: Store },
  { title: "Financeiro", url: "/plataforma/financeiro", icon: Wallet },
];

type PlatformSidebarProps = {
  userName: string;
  userEmail: string;
};

function isNavActive(pathname: string, url: string): boolean {
  if (url === "/plataforma") {
    return (
      pathname === "/plataforma" ||
      pathname.startsWith("/plataforma/clientes") ||
      pathname.startsWith("/plataforma/barbearias")
    );
  }
  return pathname === url || pathname.startsWith(`${url}/`);
}

export function PlatformSidebar({
  userName,
  userEmail,
}: PlatformSidebarProps) {
  const pathname = usePathname();
  const { setOpenMobile } = useSidebar();

  const initials = userName
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <Sidebar
      collapsible="icon"
      mobileSide="right"
      className={cn("admin-sidebar border-sidebar-border")}
    >
      <SidebarHeader className="border-b border-sidebar-border">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href="/plataforma" className="min-w-0">
                <BrandLogo
                  size="md"
                  subtitle="Plataforma"
                  className="min-w-0 text-sidebar-foreground"
                  nameClassName="admin-sidebar-brand-name text-sidebar-foreground"
                  subtitleClassName="text-sidebar-foreground/50"
                />
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Gestão</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton
                    asChild
                    isActive={isNavActive(pathname, item.url)}
                    tooltip={item.title}
                    onClick={() => setOpenMobile(false)}
                  >
                    <Link href={item.url}>
                      <item.icon />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border">
        <SidebarMenu>
          <SidebarMenuItem>
            <div className="flex w-full items-center gap-2 overflow-hidden rounded-md p-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0">
              <Avatar className="size-8 shrink-0 rounded-md ring-1 ring-[rgb(236_241_94_/_25%)]">
                <AvatarFallback className="admin-sidebar-avatar rounded-md text-xs font-medium">
                  {initials || "SA"}
                </AvatarFallback>
              </Avatar>
              <div className="grid min-w-0 flex-1 text-left leading-tight group-data-[collapsible=icon]:hidden">
                <span className="truncate text-sm font-medium">{userName}</span>
                <span
                  className="truncate text-xs text-sidebar-foreground/50"
                  title={userEmail}
                >
                  Superadmin
                </span>
              </div>
            </div>
          </SidebarMenuItem>

          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="Sair"
              onClick={() => platformSignOut()}
              className="text-[#f87171] hover:bg-[rgb(248_113_113_/_12%)] hover:text-[#fca5a5]"
            >
              <LogOut />
              <span>Sair</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
