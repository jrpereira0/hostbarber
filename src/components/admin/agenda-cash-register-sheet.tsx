"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  ArrowRight,
  ChevronRight,
  Lock,
  RefreshCw,
  RotateCcw,
  Trash2,
  Unlock,
  Wallet,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetTitle,
} from "@/components/ui/sheet";
import { SearchInput } from "@/components/admin/search-input";
import {
  OpenCashRegisterDialog,
  type CashRegisterResponsibleOption,
} from "@/components/admin/open-cash-register-dialog";
import { closeCashRegisterAction } from "@/app/admin/(panel)/financeiro/actions";
import { deleteOpenWalkInComandaAction } from "@/app/admin/(panel)/comandas/actions";
import {
  formatPaymentMethodLabel,
  type CashRegisterSummary,
} from "@/lib/finance-reports";
import type { CashRegisterSession } from "@/lib/cash-register-service";
import {
  PAYMENT_METHODS,
  CASH_INFLOW_PAYMENT_METHODS,
  type PaymentMethod,
} from "@/lib/comanda-types";
import { formatDateBR, formatPriceBRL, formatTime } from "@/lib/format";
import { matchesSearch } from "@/lib/text";
import { cn } from "@/lib/utils";

type AgendaCashRegisterSheetProps = {
  date: string;
  today: string;
  cash: CashRegisterSummary;
  cashSession: CashRegisterSession | null;
  openCashRegister: CashRegisterSession | null;
  responsibleOptions: CashRegisterResponsibleOption[];
  onComandaClick?: (
    comandaId: string,
    appointmentId: string | null
  ) => void;
};

function formatClosedTime(iso: string): string {
  const match = iso.match(/T(\d{2}):(\d{2})/);
  if (!match) return "";
  return formatTime(`${match[1]}:${match[2]}:00`);
}

export function AgendaCashRegisterSheet({
  date,
  today,
  cash,
  cashSession,
  openCashRegister,
  responsibleOptions,
  onComandaClick,
}: AgendaCashRegisterSheetProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [openDialog, setOpenDialog] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [deleteWalkInId, setDeleteWalkInId] = useState<string | null>(null);
  const [deletingWalkIn, setDeletingWalkIn] = useState(false);
  const [openMode, setOpenMode] = useState<"open" | "reopen">("open");
  const [search, setSearch] = useState("");
  const [pending, startTransition] = useTransition();
  const wasOpenRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (wasOpenRef.current && !open) setSearch("");
    wasOpenRef.current = open;
  }, [open]);

  const otherDayOpen =
    openCashRegister && openCashRegister.serviceDate !== date
      ? openCashRegister
      : null;

  const defaultResponsibleId = responsibleOptions.find(
    (option) => option.label === cashSession?.responsibleName
  )?.id;

  const filteredComandas = useMemo(() => {
    if (!search.trim()) return cash.comandas;
    return cash.comandas.filter(
      (row) =>
        matchesSearch(row.customerName, search) ||
        matchesSearch(row.professionalNickname, search)
    );
  }, [cash.comandas, search]);

  const activePaymentMethods = useMemo(
    () =>
      PAYMENT_METHODS.filter((method) => {
        if (method === "store_credit") {
          return cash.byPaymentMethod.store_credit > 0;
        }
        const inflowMethod = method as (typeof CASH_INFLOW_PAYMENT_METHODS)[number];
        return (
          cash.byPaymentMethod[inflowMethod] > 0 ||
          cash.creditDepositsByMethod[inflowMethod] > 0
        );
      }),
    [cash.byPaymentMethod, cash.creditDepositsByMethod]
  );

  const paymentMethodTotal = (method: PaymentMethod): number => {
    if (method === "store_credit") return cash.byPaymentMethod.store_credit;
    const inflowMethod = method as (typeof CASH_INFLOW_PAYMENT_METHODS)[number];
    return (
      cash.byPaymentMethod[inflowMethod] +
      cash.creditDepositsByMethod[inflowMethod]
    );
  };

  const isCashOpen = cashSession?.status === "open";
  const balanceCents = cash.cashInflowCents;

  function startOpenCash(mode: "open" | "reopen") {
    setOpenMode(mode);
    setOpenDialog(true);
  }

  function refreshSoon() {
    if (!mountedRef.current) return;
    startTransition(() => router.refresh());
  }

  async function handleCloseCash() {
    const result = await closeCashRegisterAction(date);
    if (!mountedRef.current) return;
    if (result.ok) {
      toast.success("Caixa encerrado.");
      setConfirmClose(false);
      window.setTimeout(() => refreshSoon(), 0);
    } else {
      toast.error(result.error);
    }
  }

  function handleComandaClick(
    comandaId: string,
    appointmentId: string | null
  ) {
    onComandaClick?.(comandaId, appointmentId);
    setOpen(false);
  }

  async function handleDeleteWalkIn() {
    if (!deleteWalkInId || deletingWalkIn) return;
    setDeletingWalkIn(true);
    try {
      const result = await deleteOpenWalkInComandaAction(deleteWalkInId);
      if (!mountedRef.current) return;
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Venda rápida excluída.");
      setDeleteWalkInId(null);
      window.setTimeout(() => refreshSoon(), 0);
    } catch {
      if (mountedRef.current) {
        toast.error("Não foi possível excluir a venda rápida.");
      }
    } finally {
      if (mountedRef.current) setDeletingWalkIn(false);
    }
  }

  return (
    <>
      {!open && (
        <button
          type="button"
          data-tour="tour-agenda-cash"
          onClick={() => setOpen(true)}
          className={cn(
            "fixed right-0 top-[42%] z-40 flex -translate-y-1/2 flex-col items-center gap-2",
            "rounded-l-lg border border-r-0 border-white/10 bg-[#151618] px-2 py-3",
            "text-[#f5f5f5] transition-colors hover:bg-[#1a1b1e]"
          )}
          aria-label="Abrir caixa do dia"
        >
          <span
            className={cn(
              "size-1.5 rounded-full",
              isCashOpen ? "bg-[#ecf15e]" : "bg-white/25"
            )}
            aria-hidden
          />
          <span
            className="text-[10px] font-medium tracking-[0.16em] text-[#c8c9cc]"
            style={{ writingMode: "vertical-rl" }}
          >
            CAIXA
          </span>
          {cash.openComandas.length > 0 ? (
            <span className="flex size-4 items-center justify-center rounded-full bg-[#ecf15e] text-[9px] font-semibold text-[#151618]">
              {cash.openComandas.length > 9 ? "9+" : cash.openComandas.length}
            </span>
          ) : null}
        </button>
      )}

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="right"
          showCloseButton={false}
          className="admin-booking-dialog flex h-full w-full flex-col gap-0 overflow-hidden border-l p-0 sm:max-w-md"
        >
          <SheetTitle className="sr-only">Caixa do dia</SheetTitle>

          {/* Header curto */}
          <header className="booking-header shrink-0 border-b px-5 py-4">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="booking-display text-lg font-medium tracking-tight text-[#f5f5f5]">
                    Caixa do dia
                  </h2>
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-[11px] font-medium",
                      isCashOpen
                        ? "text-[#ecf15e]"
                        : "text-muted-foreground"
                    )}
                  >
                    <span
                      className={cn(
                        "size-1.5 rounded-full",
                        isCashOpen ? "bg-[#ecf15e]" : "bg-white/30"
                      )}
                      aria-hidden
                    />
                    {isCashOpen ? "Aberto" : "Fechado"}
                  </span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {formatDateBR(date)}
                  {cashSession?.responsibleName
                    ? ` · ${cashSession.responsibleName}`
                    : ""}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="booking-btn-ghost size-8 rounded-lg"
                  disabled={pending}
                  onClick={() => refreshSoon()}
                  aria-label="Atualizar caixa"
                >
                  <RefreshCw
                    className={cn("size-3.5", pending && "animate-spin")}
                  />
                </Button>
                <SheetClose asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="booking-btn-ghost size-8 rounded-lg"
                    aria-label="Fechar"
                  >
                    <X className="size-3.5" />
                  </Button>
                </SheetClose>
              </div>
            </div>

            {otherDayOpen ? (
              <p className="mt-3 rounded-lg border border-[#ecf15e]/35 bg-[#1c1e12] px-3 py-2.5 text-xs leading-relaxed text-[#f5f5f5]">
                O caixa de{" "}
                <Link
                  href={`/admin?date=${otherDayOpen.serviceDate}`}
                  className="font-medium text-[#ecf15e] underline-offset-2 hover:underline"
                  onClick={() => setOpen(false)}
                >
                  {formatDateBR(otherDayOpen.serviceDate)}
                </Link>{" "}
                ainda está aberto.
              </p>
            ) : null}
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {/* Saldo */}
            <section className="border-b border-white/8 px-5 py-5">
              <p className="text-xs text-muted-foreground">Saldo do dia</p>
              <p className="mt-1 text-[1.75rem] font-semibold tracking-tight tabular-nums text-[#f5f5f5]">
                {formatPriceBRL(balanceCents)}
              </p>

              {activePaymentMethods.length > 0 ? (
                <dl className="mt-4 space-y-2 border-t border-white/8 pt-4 text-sm">
                  {activePaymentMethods.map((method) => (
                    <div
                      key={method}
                      className="flex items-baseline justify-between gap-3"
                    >
                      <dt className="truncate text-muted-foreground">
                        {formatPaymentMethodLabel(method)}
                      </dt>
                      <dd className="shrink-0 tabular-nums text-[#f5f5f5]">
                        {formatPriceBRL(paymentMethodTotal(method))}
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : null}
            </section>

            {/* Comandas em aberto */}
            {cash.openComandas.length > 0 ? (
              <section className="border-b border-white/8 px-5 py-4">
                <div className="mb-3 flex items-baseline justify-between gap-2">
                  <h3 className="text-sm font-medium text-[#f5f5f5]">
                    Em aberto
                  </h3>
                  <span className="text-xs tabular-nums text-[#ecf15e]">
                    {cash.openComandas.length}
                  </span>
                </div>
                <ul className="divide-y divide-white/8 overflow-hidden rounded-xl border border-[#ecf15e]/25 bg-[#151618]">
                  {cash.openComandas.map((openComanda) => {
                    const clickable = Boolean(onComandaClick);
                    return (
                      <li key={openComanda.id}>
                        <div className="flex items-stretch">
                          <button
                            type="button"
                            disabled={!clickable}
                            onClick={() =>
                              handleComandaClick(
                                openComanda.id,
                                openComanda.appointmentId
                              )
                            }
                            className={cn(
                              "flex min-w-0 flex-1 items-center gap-3 px-3.5 py-3 text-left transition-colors",
                              clickable && "hover:bg-white/[0.03]"
                            )}
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex items-baseline justify-between gap-2">
                                <p className="truncate text-sm font-medium text-[#f5f5f5]">
                                  {openComanda.customerName}
                                </p>
                                <p className="shrink-0 text-sm font-medium tabular-nums text-[#f5f5f5]">
                                  {formatPriceBRL(openComanda.totalCents)}
                                </p>
                              </div>
                              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                                {openComanda.itemPreview}
                                {" · "}
                                <span className="text-[#ecf15e]">
                                  Toque para finalizar
                                </span>
                              </p>
                            </div>
                            {clickable ? (
                              <ChevronRight
                                className="size-4 shrink-0 text-muted-foreground"
                                aria-hidden
                              />
                            ) : null}
                          </button>
                          {openComanda.isWalkIn ? (
                            <button
                              type="button"
                              aria-label="Excluir venda rápida"
                              onClick={() => setDeleteWalkInId(openComanda.id)}
                              className="flex shrink-0 items-center border-l border-white/8 px-3 text-[#f87171] transition-colors hover:bg-white/[0.03]"
                            >
                              <Trash2 className="size-4" />
                            </button>
                          ) : null}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ) : null}

            {/* Comandas */}
            <section className="px-5 py-4">
              <div className="mb-3 flex items-baseline justify-between gap-2">
                <h3 className="text-sm font-medium text-[#f5f5f5]">
                  Comandas fechadas
                </h3>
                {cash.comandas.length > 0 ? (
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {filteredComandas.length === cash.comandas.length
                      ? cash.comandas.length
                      : `${filteredComandas.length}/${cash.comandas.length}`}
                  </span>
                ) : null}
              </div>

              {cash.comandas.length > 3 ? (
                <div className="mb-3">
                  <SearchInput
                    value={search}
                    onChange={setSearch}
                    placeholder="Buscar cliente ou barbeiro…"
                  />
                </div>
              ) : null}

              {!isCashOpen &&
              cash.comandas.length === 0 &&
              cash.openComandas.length === 0 ? (
                <div className="rounded-xl border border-white/8 bg-[#151618] px-4 py-10 text-center">
                  <Wallet
                    className="mx-auto size-5 text-muted-foreground"
                    strokeWidth={1.5}
                  />
                  <p className="mt-3 text-sm font-medium text-[#f5f5f5]">
                    Caixa fechado
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    Abra o caixa pra finalizar comandas neste dia.
                  </p>
                </div>
              ) : cash.comandas.length === 0 ? (
                <div className="rounded-xl border border-white/8 bg-[#151618] px-4 py-8 text-center">
                  <p className="text-sm font-medium text-[#f5f5f5]">
                    Nenhuma comanda fechada ainda
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    {cash.openComandas.length > 0
                      ? "Finalize as comandas em aberto acima para entrar no caixa."
                      : "Feche comandas na agenda e elas aparecem aqui."}
                  </p>
                </div>
              ) : filteredComandas.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  Nenhum resultado para &ldquo;{search}&rdquo;.
                </p>
              ) : (
                <ul className="divide-y divide-white/8 overflow-hidden rounded-xl border border-white/8 bg-[#151618]">
                  {filteredComandas.map((comanda) => {
                    const closedTime = formatClosedTime(comanda.closedAt);
                    const clickable = Boolean(onComandaClick);
                    const paymentLabel = comanda.payments
                      .map((p) => formatPaymentMethodLabel(p.method))
                      .join(" · ");

                    return (
                      <li key={comanda.id}>
                        <button
                          type="button"
                          disabled={!clickable}
                          onClick={() =>
                            handleComandaClick(
                              comanda.id,
                              comanda.appointmentId
                            )
                          }
                          className={cn(
                            "flex w-full items-center gap-3 px-3.5 py-3 text-left transition-colors",
                            clickable && "hover:bg-white/[0.03]"
                          )}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-baseline justify-between gap-3">
                              <p className="truncate text-sm font-medium text-[#f5f5f5]">
                                {comanda.customerName}
                              </p>
                              <p className="shrink-0 text-sm font-semibold tabular-nums text-[#f5f5f5]">
                                {formatPriceBRL(comanda.totalCents)}
                              </p>
                            </div>
                            <p className="mt-0.5 truncate text-xs text-muted-foreground">
                              {comanda.professionalNickname}
                              {closedTime ? ` · ${closedTime}` : ""}
                              {paymentLabel ? ` · ${paymentLabel}` : ""}
                            </p>
                          </div>
                          {clickable ? (
                            <ChevronRight className="size-4 shrink-0 text-white/25" />
                          ) : null}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </div>

          <footer className="booking-footer shrink-0 border-t px-5 py-3.5">
            {isCashOpen ? (
              <div className="space-y-2">
                <Button
                  type="button"
                  className="booking-btn-ghost h-11 w-full rounded-xl border"
                  disabled={pending || cash.openComandas.length > 0}
                  onClick={() => setConfirmClose(true)}
                >
                  <Lock className="size-4" />
                  Encerrar caixa
                </Button>
                {cash.openComandas.length > 0 ? (
                  <p className="text-center text-xs text-[#ecf15e]">
                    Finalize as {cash.openComandas.length}{" "}
                    {cash.openComandas.length === 1
                      ? "comanda aberta"
                      : "comandas abertas"}{" "}
                    antes de encerrar.
                  </p>
                ) : null}
              </div>
            ) : cashSession ? (
              <Button
                type="button"
                className="booking-btn-primary h-11 w-full rounded-xl"
                disabled={pending || Boolean(otherDayOpen)}
                onClick={() => startOpenCash("reopen")}
              >
                <RotateCcw className="size-4" />
                Reabrir caixa
              </Button>
            ) : (
              <Button
                type="button"
                className="booking-btn-primary h-11 w-full rounded-xl"
                disabled={pending || Boolean(otherDayOpen)}
                onClick={() => startOpenCash("open")}
              >
                <Unlock className="size-4" />
                Abrir caixa do dia
              </Button>
            )}

            <Link
              href={`/admin/financeiro?from=${date}&to=${date}`}
              onClick={() => setOpen(false)}
              className="mt-2.5 flex items-center justify-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-[#f5f5f5]"
            >
              Ver métricas do dia
              <ArrowRight className="size-3.5" />
            </Link>
          </footer>
        </SheetContent>
      </Sheet>

      <Dialog open={confirmClose} onOpenChange={setConfirmClose}>
        <DialogContent className="admin-booking-dialog max-w-sm rounded-2xl ring-0">
          <DialogHeader>
            <DialogTitle>Encerrar caixa?</DialogTitle>
            <DialogDescription>
              Depois de encerrar, não dá pra finalizar novas comandas neste dia
              até reabrir o caixa.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              className="booking-btn-ghost rounded-xl border"
              onClick={() => setConfirmClose(false)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              className="booking-btn-primary rounded-xl"
              disabled={pending}
              onClick={() => void handleCloseCash()}
            >
              Encerrar caixa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={deleteWalkInId !== null}
        onOpenChange={(next) => {
          if (!next && !deletingWalkIn) setDeleteWalkInId(null);
        }}
      >
        <DialogContent className="admin-booking-dialog max-w-sm rounded-2xl ring-0">
          <DialogHeader>
            <DialogTitle>Excluir venda rápida?</DialogTitle>
            <DialogDescription>
              Os produtos desta comanda serão removidos. Isso não dá para
              desfazer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              className="booking-btn-ghost rounded-xl border"
              disabled={deletingWalkIn}
              onClick={() => setDeleteWalkInId(null)}
            >
              Manter
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="rounded-xl"
              disabled={deletingWalkIn}
              onClick={() => void handleDeleteWalkIn()}
            >
              {deletingWalkIn ? "Excluindo…" : "Excluir"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <OpenCashRegisterDialog
        key={`${openDialog}-${openMode}`}
        open={openDialog}
        onOpenChange={setOpenDialog}
        serviceDate={date}
        today={today}
        mode={openMode}
        lockServiceDate={openMode === "reopen"}
        responsibleOptions={responsibleOptions}
        defaultResponsibleId={defaultResponsibleId}
        defaultOpeningBalanceCents={cashSession?.openingBalanceCents ?? 0}
        tone="dark"
        onSuccess={(openedDate) => {
          window.setTimeout(() => {
            if (!mountedRef.current) return;
            if (openedDate !== date) {
              router.push(`/admin?date=${openedDate}`);
            } else {
              refreshSoon();
            }
          }, 0);
        }}
      />
    </>
  );
}
