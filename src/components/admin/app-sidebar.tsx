"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  CalendarDays,
  Contact,
  ExternalLink,
  History,
  ListChecks,
  LogOut,
  Package,
  Percent,
  Scissors,
  Settings,
  UserRound,
  Users,
} from "lucide-react";
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
import { signOut } from "@/app/admin/(panel)/actions";
import { BrandLogo } from "@/components/brand-logo";
import { BOOKING_PATH } from "@/lib/booking-path";
import { cn } from "@/lib/utils";
import type { AdminRole } from "@/lib/require-admin";

const dayToDayItems = [
  { title: "Agenda", url: "/admin", icon: CalendarDays },
  {
    title: "Comissões",
    url: "/admin/financeiro/comissoes",
    icon: Percent,
    barberTitle: "Minhas comissões",
    roles: ["owner", "barber"] as AdminRole[],
  },
  {
    title: "Caixas",
    url: "/admin/financeiro/caixas",
    icon: History,
    roles: ["owner"] as AdminRole[],
  },
  {
    title: "Financeiro",
    url: "/admin/financeiro",
    icon: BarChart3,
    roles: ["owner"] as AdminRole[],
  },
];

const managementItems = [
  {
    title: "Profissionais",
    url: "/admin/profissionais",
    icon: Users,
    roles: ["owner"] as AdminRole[],
  },
  {
    title: "Serviços",
    url: "/admin/servicos",
    icon: Scissors,
    roles: ["owner"] as AdminRole[],
  },
  {
    title: "Produtos",
    url: "/admin/produtos",
    icon: Package,
    roles: ["owner"] as AdminRole[],
  },
  {
    title: "Clientes",
    url: "/admin/clientes",
    icon: Contact,
    roles: ["owner", "reception"] as AdminRole[],
  },
];

type NavItem = {
  title: string;
  url: string;
  icon: typeof CalendarDays;
  roles?: AdminRole[];
  barberTitle?: string;
};

type AppSidebarProps = {
  role: AdminRole;
  userName: string;
  userEmail: string;
  /** Link público da agenda desta loja (`/agenda/{slug}`). */
  bookingHref?: string;
  /** Mostra atalho de onboarding para o dono. */
  showOnboarding?: boolean;
};

function isNavActive(pathname: string, url: string): boolean {
  if (url === "/admin") return pathname === "/admin";
  if (url === "/admin/financeiro") return pathname === "/admin/financeiro";
  return pathname === url || pathname.startsWith(`${url}/`);
}

function roleLabel(role: AdminRole): string {
  if (role === "owner") return "Dono";
  if (role === "reception") return "Recepção";
  return "Barbeiro";
}

export function AppSidebar({
  role,
  userName,
  userEmail,
  bookingHref = BOOKING_PATH,
  showOnboarding = false,
}: AppSidebarProps) {
  const pathname = usePathname();
  const { setOpenMobile } = useSidebar();
  const isOwner = role === "owner";
  const isReception = role === "reception";

  const initials = userName
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  function renderItems(items: NavItem[]) {
    return items
      .filter((item) => !item.roles || item.roles.includes(role))
      .map((item) => {
        const label =
          role === "barber" && item.barberTitle ? item.barberTitle : item.title;
        return (
          <SidebarMenuItem key={item.url}>
            <SidebarMenuButton
              asChild
              isActive={isNavActive(pathname, item.url)}
              tooltip={label}
              onClick={() => setOpenMobile(false)}
            >
              <Link href={item.url}>
                <item.icon />
                <span>{label}</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        );
      });
  }

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
              <Link href="/admin" className="min-w-0">
                <BrandLogo
                  size="md"
                  subtitle="Painel"
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
          <SidebarGroupLabel>Dia a dia</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>{renderItems(dayToDayItems)}</SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {isOwner || isReception ? (
          <SidebarGroup>
            <SidebarGroupLabel>Gerenciamento</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>{renderItems(managementItems)}</SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ) : null}

        <SidebarGroup>
          <SidebarGroupLabel>Conta</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {isOwner && showOnboarding ? (
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={false}
                    tooltip="Guia inicial"
                    onClick={() => setOpenMobile(false)}
                  >
                    <Link href="/admin?guia=1">
                      <ListChecks />
                      <span>Guia inicial</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ) : null}

              {isOwner ? (
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={isNavActive(pathname, "/admin/configuracoes")}
                    tooltip="Configurações"
                    onClick={() => setOpenMobile(false)}
                  >
                    <Link href="/admin/configuracoes">
                      <Settings />
                      <span>Configurações</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ) : (
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={isNavActive(pathname, "/admin/minha-conta")}
                    tooltip="Minha conta"
                    onClick={() => setOpenMobile(false)}
                  >
                    <Link href="/admin/minha-conta">
                      <UserRound />
                      <span>Minha conta</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}

              {!isReception ? (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild tooltip="Página de agendamento">
                    <a
                      href={bookingHref}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <ExternalLink />
                      <span>Página de agendamento</span>
                    </a>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ) : null}
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
                  {initials || "DB"}
                </AvatarFallback>
              </Avatar>
              <div className="grid min-w-0 flex-1 text-left leading-tight group-data-[collapsible=icon]:hidden">
                <span className="truncate text-sm font-medium">{userName}</span>
                <span
                  className="truncate text-xs text-sidebar-foreground/50"
                  title={userEmail}
                >
                  {roleLabel(role)}
                </span>
              </div>
            </div>
          </SidebarMenuItem>

          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="Sair"
              onClick={() => signOut()}
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
