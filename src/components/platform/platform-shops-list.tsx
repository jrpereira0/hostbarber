"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Ban,
  Copy,
  ExternalLink,
  KeyRound,
  LogIn,
  MoreHorizontal,
  Pencil,
  Plus,
  Store,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchInput } from "@/components/admin/search-input";
import { EmptyState } from "@/components/admin/empty-state";
import { Switch } from "@/components/ui/switch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatDateTimeBR, formatWhatsapp } from "@/lib/format";
import { LOGIN_PATH } from "@/lib/login-path";
import { matchesSearch } from "@/lib/text";
import type { PlatformShop } from "@/lib/shops/types";
import {
  deleteShop,
  resetOwnerPassword,
  setShopActive,
} from "@/app/plataforma/(panel)/clientes/actions";
import { ADMIN_SURFACE } from "@/lib/admin-surface";
import { cn } from "@/lib/utils";

type StatusFilter = "all" | "active" | "inactive";

const FILTERS: { id: StatusFilter; label: string }[] = [
  { id: "all", label: "Todos" },
  { id: "active", label: "Ativos" },
  { id: "inactive", label: "Inativos" },
];

function formatCreatedAt(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "America/Sao_Paulo",
  });
}

function generatePassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  let out = "";
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out;
}

export function PlatformShopsList({ items }: { items: PlatformShop[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [pendingDeactivate, setPendingDeactivate] =
    useState<PlatformShop | null>(null);
  const [pendingPassword, setPendingPassword] = useState<PlatformShop | null>(
    null
  );
  const [pendingDelete, setPendingDelete] = useState<PlatformShop | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [deleteConfirmName, setDeleteConfirmName] = useState("");
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const counts = useMemo(() => {
    const active = items.filter((s) => s.active).length;
    return {
      total: items.length,
      active,
      inactive: items.length - active,
    };
  }, [items]);

  const filtered = useMemo(() => {
    return items.filter((item) => {
      if (statusFilter === "active" && !item.active) return false;
      if (statusFilter === "inactive" && item.active) return false;
      if (!query.trim()) return true;
      return matchesSearch(
        `${item.name} ${item.ownerEmail} ${item.ownerWhatsapp} ${item.city} ${item.slug}`,
        query
      );
    });
  }, [items, query, statusFilter]);

  function applyActive(shop: PlatformShop, active: boolean) {
    setTogglingId(shop.id);
    startTransition(async () => {
      const result = await setShopActive(shop.id, active);
      setTogglingId(null);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(active ? "Cliente ativado." : "Cliente desativado.");
      setPendingDeactivate(null);
      router.refresh();
    });
  }

  function onStatusChange(shop: PlatformShop, next: boolean) {
    if (!next) {
      setPendingDeactivate(shop);
      return;
    }
    applyActive(shop, true);
  }

  async function copyAgendaLink(shop: PlatformShop) {
    const url = `${window.location.origin}/agenda/${shop.slug}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link da agenda copiado.");
    } catch {
      toast.error("Não foi possível copiar o link.");
    }
  }

  async function copyOwnerEmail(shop: PlatformShop) {
    try {
      await navigator.clipboard.writeText(shop.ownerEmail);
      toast.success("E-mail do dono copiado.");
    } catch {
      toast.error("Não foi possível copiar o e-mail.");
    }
  }

  async function openPanelSupport(shop: PlatformShop) {
    try {
      await navigator.clipboard.writeText(shop.ownerEmail);
      toast.success(
        "E-mail copiado. Ao entrar no painel do cliente, a sessão da plataforma sai neste navegador."
      );
    } catch {
      toast.message(
        "Abrindo o login. Ao entrar no painel do cliente, a sessão da plataforma sai neste navegador."
      );
    }
    window.open(LOGIN_PATH, "_blank", "noopener,noreferrer");
  }

  function openPasswordDialog(shop: PlatformShop) {
    setNewPassword(generatePassword());
    setPendingPassword(shop);
  }

  function submitPasswordReset() {
    if (!pendingPassword) return;
    const shop = pendingPassword;
    startTransition(async () => {
      const result = await resetOwnerPassword(shop.id, newPassword);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      try {
        await navigator.clipboard.writeText(newPassword);
        toast.success("Senha atualizada e copiada.");
      } catch {
        toast.success(`Senha atualizada: ${newPassword}`);
      }
      setPendingPassword(null);
      setNewPassword("");
      router.refresh();
    });
  }

  function submitDelete() {
    if (!pendingDelete) return;
    const shop = pendingDelete;
    startTransition(async () => {
      const result = await deleteShop(shop.id, deleteConfirmName);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Cliente excluído.");
      setPendingDelete(null);
      setDeleteConfirmName("");
      router.refresh();
    });
  }

  if (items.length === 0) {
    return (
      <EmptyState
        icon={Store}
        title="Nenhum cliente ainda"
        description="Cadastre o primeiro cliente da plataforma. O dono recebe e-mail, WhatsApp e senha para entrar no painel da loja."
        action={
          <Button asChild className={ADMIN_SURFACE.btnPrimary}>
            <Link href="/plataforma/clientes/nova">
              <Plus className="size-4" />
              Novo cliente
            </Link>
          </Button>
        }
        className="border-white/10 bg-[#151618]"
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <span className="text-[#f5f5f5]">
          <span className="tabular-nums font-medium">{counts.total}</span>{" "}
          <span className={ADMIN_SURFACE.muted}>clientes</span>
        </span>
        <span className="text-white/15" aria-hidden>
          ·
        </span>
        <span className="text-[#ecf15e]">
          <span className="tabular-nums font-medium">{counts.active}</span>{" "}
          ativos
        </span>
        <span className="text-white/15" aria-hidden>
          ·
        </span>
        <span className={ADMIN_SURFACE.muted}>
          <span className="tabular-nums font-medium text-[#f5f5f5]">
            {counts.inactive}
          </span>{" "}
          inativos
        </span>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Buscar por nome, e-mail, WhatsApp, cidade…"
            inputClassName={ADMIN_SURFACE.input}
          />
        </div>
        <div className="flex shrink-0 gap-1 rounded-lg border border-white/10 bg-[#151618] p-0.5">
          {FILTERS.map((filter) => (
            <button
              key={filter.id}
              type="button"
              onClick={() => setStatusFilter(filter.id)}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                statusFilter === filter.id
                  ? "bg-[rgb(236_241_94_/_14%)] text-[#ecf15e]"
                  : "text-[#b4b6bb] hover:text-[#f5f5f5]"
              )}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className={cn("py-10 text-center text-sm", ADMIN_SURFACE.muted)}>
          Nenhum cliente encontrado com essa busca.
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-white/10 bg-[#151618]">
          <div className="hidden grid-cols-[minmax(0,1.3fr)_minmax(0,1.1fr)_minmax(0,0.9fr)_88px_52px] gap-3 border-b border-white/10 px-4 py-2.5 text-[11px] font-medium tracking-wide text-[#8b8d93] uppercase md:grid">
            <span>Loja</span>
            <span>Dono</span>
            <span>Cadastro / acesso</span>
            <span className="text-center">Status</span>
            <span className="sr-only">Ações</span>
          </div>

          <ul className="divide-y divide-white/10">
            {filtered.map((shop) => {
              const busy = isPending && togglingId === shop.id;
              const cityLabel = [shop.city, shop.state]
                .filter(Boolean)
                .join(" — ");

              return (
                <li
                  key={shop.id}
                  className={cn(
                    "grid grid-cols-1 gap-3 px-4 py-3.5 transition-colors hover:bg-white/[0.02] md:grid-cols-[minmax(0,1.3fr)_minmax(0,1.1fr)_minmax(0,0.9fr)_88px_52px] md:items-center md:gap-3",
                    !shop.active && "opacity-75"
                  )}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 md:block">
                      <Link
                        href={`/plataforma/clientes/${shop.id}`}
                        className="truncate text-sm font-medium text-[#f5f5f5] hover:text-[#ecf15e]"
                      >
                        {shop.name}
                      </Link>
                      <span className="md:hidden">
                        <StatusPill active={shop.active} />
                      </span>
                    </div>
                    <p className="mt-0.5 truncate font-mono text-xs text-[#8b8d93]">
                      /{shop.slug}
                    </p>
                    {cityLabel ? (
                      <p className="mt-0.5 truncate text-xs text-[#8b8d93] md:hidden">
                        {cityLabel}
                      </p>
                    ) : null}
                  </div>

                  <div className="min-w-0 text-sm">
                    <p className="truncate text-[#f5f5f5]">{shop.ownerEmail}</p>
                    <p
                      className={cn(
                        "mt-0.5 truncate text-xs",
                        ADMIN_SURFACE.muted
                      )}
                    >
                      {shop.ownerWhatsapp
                        ? formatWhatsapp(shop.ownerWhatsapp)
                        : "Sem WhatsApp"}
                    </p>
                  </div>

                  <div className="min-w-0 text-xs text-[#b4b6bb]">
                    <p>
                      Cadastro{" "}
                      <span className="text-[#f5f5f5]">
                        {formatCreatedAt(shop.createdAt)}
                      </span>
                    </p>
                    <p className="mt-0.5">
                      Último acesso{" "}
                      <span className="text-[#f5f5f5]">
                        {shop.ownerLastSignInAt
                          ? formatDateTimeBR(shop.ownerLastSignInAt)
                          : "nunca"}
                      </span>
                    </p>
                    {cityLabel ? (
                      <p className="mt-0.5 hidden truncate md:block">
                        {cityLabel}
                      </p>
                    ) : null}
                  </div>

                  <div className="flex items-center justify-between gap-3 md:justify-center">
                    <span className="text-xs text-[#b4b6bb] md:hidden">
                      {shop.active ? "Ativo" : "Inativo"}
                    </span>
                    <div className="hidden md:block">
                      <StatusPill active={shop.active} />
                    </div>
                    <Switch
                      checked={shop.active}
                      disabled={busy}
                      onCheckedChange={(checked) =>
                        onStatusChange(shop, checked)
                      }
                      aria-label={
                        shop.active
                          ? `Desativar ${shop.name}`
                          : `Ativar ${shop.name}`
                      }
                      className="data-checked:border-[#ecf15e] data-checked:bg-[#ecf15e]"
                    />
                  </div>

                  <div className="flex justify-end md:justify-center">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className={cn("size-8", ADMIN_SURFACE.btnGhost)}
                          disabled={busy || isPending}
                        >
                          <MoreHorizontal className="size-4" />
                          <span className="sr-only">Ações</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="end"
                        sideOffset={6}
                        className={cn(
                          ADMIN_SURFACE.popover,
                          "w-auto min-w-56 max-w-[min(18rem,calc(100vw-1.5rem))]"
                        )}
                      >
                        <DropdownMenuItem asChild className="whitespace-nowrap">
                          <Link href={`/plataforma/clientes/${shop.id}`}>
                            <Pencil className="size-4 shrink-0" />
                            Editar
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="whitespace-nowrap"
                          onSelect={(e) => {
                            e.preventDefault();
                            void openPanelSupport(shop);
                          }}
                        >
                          <LogIn className="size-4 shrink-0" />
                          Abrir login do painel
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="whitespace-nowrap"
                          onSelect={(e) => {
                            e.preventDefault();
                            void copyOwnerEmail(shop);
                          }}
                        >
                          <Copy className="size-4 shrink-0" />
                          Copiar e-mail do dono
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="whitespace-nowrap"
                          onSelect={(e) => {
                            e.preventDefault();
                            openPasswordDialog(shop);
                          }}
                        >
                          <KeyRound className="size-4 shrink-0" />
                          Nova senha do dono
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="whitespace-nowrap"
                          onSelect={(e) => {
                            e.preventDefault();
                            void copyAgendaLink(shop);
                          }}
                        >
                          <Copy className="size-4 shrink-0" />
                          Copiar link da agenda
                        </DropdownMenuItem>
                        {shop.active ? (
                          <DropdownMenuItem asChild className="whitespace-nowrap">
                            <a
                              href={`/agenda/${shop.slug}`}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              <ExternalLink className="size-4 shrink-0" />
                              Abrir agenda
                            </a>
                          </DropdownMenuItem>
                        ) : null}
                        <DropdownMenuSeparator />
                        {shop.active ? (
                          <DropdownMenuItem
                            className="whitespace-nowrap text-[#f87171] focus:text-[#fca5a5]"
                            onSelect={(e) => {
                              e.preventDefault();
                              setPendingDeactivate(shop);
                            }}
                          >
                            <Ban className="size-4 shrink-0" />
                            Desativar cliente
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem
                            className="whitespace-nowrap"
                            onSelect={(e) => {
                              e.preventDefault();
                              applyActive(shop, true);
                            }}
                          >
                            <Store className="size-4 shrink-0" />
                            Ativar cliente
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          className="whitespace-nowrap text-[#f87171] focus:text-[#fca5a5]"
                          onSelect={(e) => {
                            e.preventDefault();
                            setDeleteConfirmName("");
                            setPendingDelete(shop);
                          }}
                        >
                          <Trash2 className="size-4 shrink-0" />
                          Excluir cliente
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </li>
              );
            })}
          </ul>

          <div className="border-t border-white/10 px-4 py-2.5 text-xs text-[#8b8d93]">
            {filtered.length} de {counts.total} cliente
            {counts.total === 1 ? "" : "s"}
          </div>
        </div>
      )}

      <Dialog
        open={pendingDeactivate !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDeactivate(null);
        }}
      >
        <DialogContent className="border-white/10 bg-[#151618] text-[#f5f5f5] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Desativar cliente?</DialogTitle>
            <DialogDescription className="text-[#b4b6bb]">
              {pendingDeactivate
                ? `“${pendingDeactivate.name}” fica bloqueada: agenda pública, link de agendamento e login do painel (dono, barbeiros e recepção). Você pode reativar quando quiser.`
                : null}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="ghost"
              className={ADMIN_SURFACE.btnGhost}
              onClick={() => setPendingDeactivate(null)}
              disabled={isPending}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              className="bg-[#ef4444] text-white hover:bg-[#dc2626]"
              disabled={isPending || !pendingDeactivate}
              onClick={() => {
                if (pendingDeactivate) {
                  applyActive(pendingDeactivate, false);
                }
              }}
            >
              {isPending ? "Desativando…" : "Desativar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={pendingPassword !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPendingPassword(null);
            setNewPassword("");
          }
        }}
      >
        <DialogContent className="border-white/10 bg-[#151618] text-[#f5f5f5] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nova senha do dono</DialogTitle>
            <DialogDescription className="text-[#b4b6bb]">
              {pendingPassword
                ? `Define uma nova senha para ${pendingPassword.ownerEmail}. A senha gerada já vem pronta — você pode editar antes de salvar.`
                : null}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="owner-new-password" className="text-[#f5f5f5]">
              Nova senha
            </Label>
            <div className="flex gap-2">
              <Input
                id="owner-new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className={ADMIN_SURFACE.input}
                autoComplete="new-password"
              />
              <Button
                type="button"
                variant="ghost"
                className={ADMIN_SURFACE.btnGhost}
                onClick={() => setNewPassword(generatePassword())}
              >
                Gerar
              </Button>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="ghost"
              className={ADMIN_SURFACE.btnGhost}
              onClick={() => {
                setPendingPassword(null);
                setNewPassword("");
              }}
              disabled={isPending}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              className={ADMIN_SURFACE.btnPrimary}
              disabled={isPending || newPassword.trim().length < 6}
              onClick={submitPasswordReset}
            >
              {isPending ? "Salvando…" : "Salvar e copiar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPendingDelete(null);
            setDeleteConfirmName("");
          }
        }}
      >
        <DialogContent className="border-white/10 bg-[#151618] text-[#f5f5f5] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Excluir cliente?</DialogTitle>
            <DialogDescription className="text-[#b4b6bb]">
              {pendingDelete
                ? `Isso apaga “${pendingDelete.name}” de vez: agenda, clientes da loja, comandas, produtos e logins (dono, barbeiros e recepção). Não dá para desfazer.`
                : null}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="delete-confirm-name" className="text-[#f5f5f5]">
              Digite o nome da loja para confirmar
            </Label>
            <Input
              id="delete-confirm-name"
              value={deleteConfirmName}
              onChange={(e) => setDeleteConfirmName(e.target.value)}
              placeholder={pendingDelete?.name}
              className={ADMIN_SURFACE.input}
              autoComplete="off"
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="ghost"
              className={ADMIN_SURFACE.btnGhost}
              onClick={() => {
                setPendingDelete(null);
                setDeleteConfirmName("");
              }}
              disabled={isPending}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              className="bg-[#ef4444] text-white hover:bg-[#dc2626]"
              disabled={
                isPending ||
                !pendingDelete ||
                deleteConfirmName.trim() !== pendingDelete.name
              }
              onClick={submitDelete}
            >
              {isPending ? "Excluindo…" : "Excluir definitivamente"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatusPill({ active }: { active: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium tracking-wide uppercase",
        active
          ? "bg-[rgb(236_241_94_/_12%)] text-[#ecf15e]"
          : "bg-white/10 text-[#8b8d93]"
      )}
    >
      <span
        className={cn(
          "size-1.5 rounded-full",
          active ? "bg-[#ecf15e]" : "bg-[#8b8d93]"
        )}
      />
      {active ? "Ativo" : "Inativo"}
    </span>
  );
}
