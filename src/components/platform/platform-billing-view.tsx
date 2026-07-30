"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlertTriangle,
  Banknote,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CircleDashed,
  MoreHorizontal,
  Plus,
  Trash2,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SearchInput } from "@/components/admin/search-input";
import { EmptyState } from "@/components/admin/empty-state";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
import { formatDateBR, formatPriceBRL, parsePriceBRLInput } from "@/lib/format";
import { matchesSearch } from "@/lib/text";
import {
  billingStatusLabel,
  formatBillingMonthLabel,
  monthKey,
  paymentKindLabel,
  type BillingShopRow,
  type BillingStatusKind,
  type PlatformPaymentRow,
} from "@/lib/platform-billing";
import {
  deletePayment,
  registerPayment,
} from "@/app/plataforma/(panel)/financeiro/actions";
import { ADMIN_SURFACE } from "@/lib/admin-surface";
import { cn } from "@/lib/utils";

type StatusFilter = "all" | BillingStatusKind;

const STATUS_FILTERS: { id: StatusFilter; label: string }[] = [
  { id: "all", label: "Todos" },
  { id: "paid", label: "Em dia" },
  { id: "pending", label: "No prazo" },
  { id: "overdue", label: "Atrasados" },
  { id: "unconfigured", label: "Sem cobrança" },
];

type Summary = {
  receivedThisMonthCents: number;
  expectedThisMonthCents: number;
  paidCount: number;
  overdueCount: number;
  configuredCount: number;
  totalShops: number;
};

type PlatformBillingViewProps = {
  shops: BillingShopRow[];
  payments: PlatformPaymentRow[];
  summary: Summary;
};

function DarkLabel({
  htmlFor,
  children,
}: {
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <Label htmlFor={htmlFor} className="text-[#f5f5f5]">
      {children}
    </Label>
  );
}

function formatCentsInput(cents: number): string {
  if (cents <= 0) return "";
  return formatPriceBRL(cents);
}

function statusBadgeClass(kind: BillingStatusKind): string {
  switch (kind) {
    case "paid":
      return "bg-[rgb(74_222_128_/_14%)] text-[#4ade80]";
    case "pending":
      return "bg-[rgb(236_241_94_/_14%)] text-[#ecf15e]";
    case "overdue":
      return "bg-[rgb(248_113_113_/_14%)] text-[#f87171]";
    case "unconfigured":
      return "bg-white/5 text-[#b4b6bb]";
  }
}

function StatusIcon({ kind }: { kind: BillingStatusKind }) {
  if (kind === "paid") return <CheckCircle2 className="size-3.5" />;
  if (kind === "overdue") return <AlertTriangle className="size-3.5" />;
  if (kind === "pending") return <CalendarDays className="size-3.5" />;
  return <CircleDashed className="size-3.5" />;
}

function SummaryCard({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: boolean;
}) {
  return (
    <div className={cn(ADMIN_SURFACE.panel, "flex flex-col gap-1 px-4 py-3.5")}>
      <p
        className={cn(
          "text-xs font-medium tracking-wide uppercase",
          ADMIN_SURFACE.muted
        )}
      >
        {label}
      </p>
      <p
        className={cn(
          "text-xl font-semibold tabular-nums",
          accent ? "text-[#ecf15e]" : "text-[#f5f5f5]"
        )}
      >
        {value}
      </p>
      {hint ? (
        <p className={cn("text-xs", ADMIN_SURFACE.muted)}>{hint}</p>
      ) : null}
    </div>
  );
}

export function PlatformBillingView({
  shops,
  payments,
  summary,
}: PlatformBillingViewProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [paymentQuery, setPaymentQuery] = useState("");

  const [payShop, setPayShop] = useState<BillingShopRow | null>(null);
  const [payAmountInput, setPayAmountInput] = useState("");
  const [payReferenceMonth, setPayReferenceMonth] = useState(
    monthKey(new Date()).slice(0, 7)
  );
  const [payPaidAt, setPayPaidAt] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [payNote, setPayNote] = useState("");

  const [pendingDeletePayment, setPendingDeletePayment] =
    useState<PlatformPaymentRow | null>(null);

  const filteredShops = useMemo(() => {
    return shops.filter((shop) => {
      if (statusFilter !== "all" && shop.status.kind !== statusFilter) {
        return false;
      }
      if (!query.trim()) return true;
      return (
        matchesSearch(shop.name, query) ||
        matchesSearch(shop.slug, query) ||
        matchesSearch(shop.city, query) ||
        matchesSearch(shop.ownerWhatsapp, query) ||
        matchesSearch(shop.ownerEmail, query)
      );
    });
  }, [shops, query, statusFilter]);

  const filteredPayments = useMemo(() => {
    if (!paymentQuery.trim()) return payments;
    return payments.filter(
      (p) =>
        matchesSearch(p.shopName, paymentQuery) ||
        matchesSearch(p.note ?? "", paymentQuery) ||
        matchesSearch(paymentKindLabel(p.kind), paymentQuery)
    );
  }, [payments, paymentQuery]);

  function openPayDialog(shop: BillingShopRow) {
    setPayShop(shop);
    setPayAmountInput(
      shop.monthlyFeeCents ? formatCentsInput(shop.monthlyFeeCents) : ""
    );
    setPayReferenceMonth(monthKey(new Date()).slice(0, 7));
    setPayPaidAt(new Date().toISOString().slice(0, 10));
    setPayNote("");
  }

  function submitPayment() {
    if (!payShop) return;
    const cents = parsePriceBRLInput(payAmountInput);
    startTransition(async () => {
      const result = await registerPayment({
        shopId: payShop.id,
        amountCents: cents,
        referenceMonth: payReferenceMonth,
        paidAt: payPaidAt,
        note: payNote,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Pagamento registrado.");
      setPayShop(null);
      router.refresh();
    });
  }

  function confirmDeletePayment() {
    if (!pendingDeletePayment) return;
    startTransition(async () => {
      const result = await deletePayment(pendingDeletePayment.id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Lançamento excluído.");
      setPendingDeletePayment(null);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          label="Recebido no mês"
          value={formatPriceBRL(summary.receivedThisMonthCents)}
          hint="Somando o que caiu no mês de referência atual"
          accent
        />
        <SummaryCard
          label="Prevista no mês"
          value={formatPriceBRL(summary.expectedThisMonthCents)}
          hint={`${summary.configuredCount} cliente${summary.configuredCount === 1 ? "" : "s"} com cobrança`}
        />
        <SummaryCard
          label="Em dia"
          value={String(summary.paidCount)}
          hint="Já cobriram a mensalidade deste mês"
        />
        <SummaryCard
          label="Atrasados"
          value={String(summary.overdueCount)}
          hint="Passou do vencimento e ainda não pagaram"
        />
      </div>

      <Tabs defaultValue="clientes" className="flex w-full flex-col gap-4">
        <div className="-mx-1 overflow-x-auto px-1 pb-0.5">
          <TabsList className="h-auto w-max min-w-full flex-nowrap justify-start gap-1 rounded-xl border border-white/10 bg-white/[0.04] p-1">
            <TabsTrigger value="clientes" className="flex-none px-3">
              Clientes
            </TabsTrigger>
            <TabsTrigger value="pagamentos" className="flex-none px-3">
              Pagamentos
              {payments.length > 0 ? (
                <span className={cn("tabular-nums", ADMIN_SURFACE.muted)}>
                  ({payments.length})
                </span>
              ) : null}
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="clientes" className="mt-0 flex flex-col gap-4">
          {shops.length === 0 ? (
            <EmptyState
              icon={Wallet}
              title="Nenhum cliente ainda"
              description="Cadastre um cliente na plataforma pra começar a controlar as mensalidades."
              className="border-white/10 bg-[#151618]"
            />
          ) : (
            <>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <SearchInput
                    value={query}
                    onChange={setQuery}
                    placeholder="Buscar por nome, cidade, e-mail, WhatsApp…"
                    inputClassName={ADMIN_SURFACE.input}
                  />
                </div>
                <div className="flex shrink-0 gap-1 overflow-x-auto rounded-lg border border-white/10 bg-[#151618] p-0.5">
                  {STATUS_FILTERS.map((filter) => (
                    <button
                      key={filter.id}
                      type="button"
                      onClick={() => setStatusFilter(filter.id)}
                      className={cn(
                        "rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors",
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

              {filteredShops.length === 0 ? (
                <p
                  className={cn("py-10 text-center text-sm", ADMIN_SURFACE.muted)}
                >
                  Nenhum cliente encontrado com esse filtro.
                </p>
              ) : (
                <div className="overflow-hidden rounded-xl border border-white/10 bg-[#151618]">
                  <div className="hidden grid-cols-[minmax(0,1.4fr)_minmax(0,0.8fr)_80px_minmax(0,1fr)_minmax(0,0.9fr)_52px] gap-3 border-b border-white/10 px-4 py-2.5 text-[11px] font-medium tracking-wide text-[#8b8d93] uppercase md:grid">
                    <span>Cliente</span>
                    <span>Mensalidade</span>
                    <span className="text-center">Vence</span>
                    <span>Status</span>
                    <span>Último pagamento</span>
                    <span className="sr-only">Ações</span>
                  </div>

                  <ul className="divide-y divide-white/10">
                    {filteredShops.map((shop) => {
                      const cityLabel = [shop.city, shop.state]
                        .filter(Boolean)
                        .join(" — ");
                      return (
                        <li
                          key={shop.id}
                          className={cn(
                            "grid grid-cols-1 gap-3 px-4 py-3.5 transition-colors hover:bg-white/[0.02] md:grid-cols-[minmax(0,1.4fr)_minmax(0,0.8fr)_80px_minmax(0,1fr)_minmax(0,0.9fr)_52px] md:items-center md:gap-3",
                            !shop.active && "opacity-70"
                          )}
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <Link
                                href={`/plataforma/financeiro/${shop.id}`}
                                className="truncate text-sm font-medium text-[#f5f5f5] hover:text-[#ecf15e]"
                              >
                                {shop.name}
                              </Link>
                              {!shop.active ? (
                                <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-medium text-[#b4b6bb]">
                                  Inativo
                                </span>
                              ) : null}
                            </div>
                            {cityLabel ? (
                              <p
                                className={cn(
                                  "truncate text-xs",
                                  ADMIN_SURFACE.muted
                                )}
                              >
                                {cityLabel}
                              </p>
                            ) : null}
                          </div>

                          <div className="text-sm tabular-nums text-[#f5f5f5]">
                            {shop.monthlyFeeCents != null ? (
                              formatPriceBRL(shop.monthlyFeeCents)
                            ) : (
                              <span className={ADMIN_SURFACE.muted}>—</span>
                            )}
                          </div>

                          <div className="text-center text-sm tabular-nums text-[#f5f5f5]">
                            {shop.billingDueDay != null ? (
                              `dia ${shop.billingDueDay}`
                            ) : (
                              <span className={ADMIN_SURFACE.muted}>—</span>
                            )}
                          </div>

                          <div>
                            <span
                              className={cn(
                                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
                                statusBadgeClass(shop.status.kind)
                              )}
                            >
                              <StatusIcon kind={shop.status.kind} />
                              {billingStatusLabel(shop.status)}
                            </span>
                          </div>

                          <div className="text-sm text-[#f5f5f5]">
                            {shop.lastPaymentAt ? (
                              <>
                                <span className="tabular-nums">
                                  {formatDateBR(shop.lastPaymentAt)}
                                </span>
                                {shop.lastPaymentCents != null ? (
                                  <span
                                    className={cn(
                                      "ml-1.5 text-xs",
                                      ADMIN_SURFACE.muted
                                    )}
                                  >
                                    {formatPriceBRL(shop.lastPaymentCents)}
                                  </span>
                                ) : null}
                              </>
                            ) : (
                              <span className={ADMIN_SURFACE.muted}>
                                Nenhum
                              </span>
                            )}
                          </div>

                          <div className="flex justify-end">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="size-8 text-[#b4b6bb] hover:bg-white/5 hover:text-[#f5f5f5]"
                                  aria-label="Ações"
                                >
                                  <MoreHorizontal className="size-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent
                                align="end"
                                className="admin-popover min-w-52"
                              >
                                <DropdownMenuItem asChild>
                                  <Link
                                    href={`/plataforma/financeiro/${shop.id}`}
                                  >
                                    <ChevronRight className="size-4" />
                                    Gerenciar cobrança
                                  </Link>
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => openPayDialog(shop)}
                                  disabled={shop.monthlyFeeCents == null}
                                >
                                  <Plus className="size-4" />
                                  Registrar pagamento
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </>
          )}
        </TabsContent>

        <TabsContent value="pagamentos" className="mt-0 flex flex-col gap-4">
          {payments.length === 0 ? (
            <EmptyState
              icon={Banknote}
              title="Nenhum pagamento registrado"
              description="Abra a cobrança de um cliente pra configurar o valor e registrar o que entrou."
              className="border-white/10 bg-[#151618]"
            />
          ) : (
            <>
              <SearchInput
                value={paymentQuery}
                onChange={setPaymentQuery}
                placeholder="Buscar por cliente ou observação…"
                inputClassName={ADMIN_SURFACE.input}
              />

              {filteredPayments.length === 0 ? (
                <p
                  className={cn(
                    "py-10 text-center text-sm",
                    ADMIN_SURFACE.muted
                  )}
                >
                  Nenhum lançamento encontrado com essa busca.
                </p>
              ) : (
                <div className="overflow-hidden rounded-xl border border-white/10 bg-[#151618]">
                  <div className="hidden grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.85fr)_minmax(0,0.75fr)_minmax(0,0.85fr)_minmax(0,1fr)_52px] gap-3 border-b border-white/10 px-4 py-2.5 text-[11px] font-medium tracking-wide text-[#8b8d93] uppercase md:grid">
                    <span>Data</span>
                    <span>Cliente</span>
                    <span>Tipo</span>
                    <span>Valor</span>
                    <span>Referência</span>
                    <span>Observação</span>
                    <span className="sr-only">Ações</span>
                  </div>
                  <ul className="divide-y divide-white/10">
                    {filteredPayments.map((payment) => (
                      <li
                        key={payment.id}
                        className="grid grid-cols-1 gap-2 px-4 py-3.5 transition-colors hover:bg-white/[0.02] md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.85fr)_minmax(0,0.75fr)_minmax(0,0.85fr)_minmax(0,1fr)_52px] md:items-center md:gap-3"
                      >
                        <div className="text-sm tabular-nums text-[#f5f5f5]">
                          {formatDateBR(payment.paidAt)}
                        </div>
                        <div className="min-w-0">
                          <Link
                            href={`/plataforma/financeiro/${payment.shopId}`}
                            className="truncate text-sm font-medium text-[#f5f5f5] hover:text-[#ecf15e]"
                          >
                            {payment.shopName}
                          </Link>
                        </div>
                        <div>
                          <span
                            className={cn(
                              "inline-flex rounded-full border px-2 py-0.5 text-xs font-medium",
                              payment.kind === "payment"
                                ? "border-white/10 bg-white/5 text-[#f5f5f5]"
                                : "border-[rgb(236_241_94_/_25%)] bg-[rgb(236_241_94_/_10%)] text-[#ecf15e]"
                            )}
                          >
                            {paymentKindLabel(payment.kind)}
                          </span>
                        </div>
                        <div
                          className={cn(
                            "text-sm font-medium tabular-nums",
                            payment.kind === "payment"
                              ? "text-[#ecf15e]"
                              : "text-[#b4b6bb]"
                          )}
                        >
                          {formatPriceBRL(payment.amountCents)}
                        </div>
                        <div className={cn("text-sm", ADMIN_SURFACE.muted)}>
                          {formatBillingMonthLabel(payment.referenceMonth)}
                        </div>
                        <div
                          className={cn("truncate text-sm", ADMIN_SURFACE.muted)}
                        >
                          {payment.note || "—"}
                        </div>
                        <div className="flex justify-end">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="size-8 text-[#b4b6bb] hover:bg-white/5 hover:text-[#f5f5f5]"
                                aria-label="Ações"
                              >
                                <MoreHorizontal className="size-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent
                              align="end"
                              className="admin-popover min-w-44"
                            >
                              <DropdownMenuItem asChild>
                                <Link
                                  href={`/plataforma/financeiro/${payment.shopId}`}
                                >
                                  <ChevronRight className="size-4" />
                                  Ver cobrança
                                </Link>
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="text-[#f87171] focus:text-[#f87171]"
                                onClick={() =>
                                  setPendingDeletePayment(payment)
                                }
                              >
                                <Trash2 className="size-4" />
                                Excluir lançamento
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </TabsContent>
      </Tabs>

      <Dialog
        open={Boolean(payShop)}
        onOpenChange={(open) => {
          if (!open) setPayShop(null);
        }}
      >
        <DialogContent className="admin-popover border-white/10 bg-[#151618] text-[#f5f5f5] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Registrar pagamento</DialogTitle>
            <DialogDescription className={ADMIN_SURFACE.muted}>
              {payShop
                ? `Lançamento rápido de ${payShop.name}. Pra ver o histórico completo, abra a cobrança do cliente.`
                : null}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="space-y-2">
              <DarkLabel htmlFor="payAmount">Valor recebido</DarkLabel>
              <Input
                id="payAmount"
                inputMode="numeric"
                value={payAmountInput}
                onChange={(e) =>
                  setPayAmountInput(
                    formatCentsInput(parsePriceBRLInput(e.target.value))
                  )
                }
                placeholder="R$ 0,00"
                className={ADMIN_SURFACE.input}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <DarkLabel htmlFor="payMonth">Mês de referência</DarkLabel>
                <Input
                  id="payMonth"
                  type="month"
                  value={payReferenceMonth}
                  onChange={(e) => setPayReferenceMonth(e.target.value)}
                  className={ADMIN_SURFACE.input}
                />
              </div>
              <div className="space-y-2">
                <DarkLabel htmlFor="payDate">Data do pagamento</DarkLabel>
                <Input
                  id="payDate"
                  type="date"
                  value={payPaidAt}
                  onChange={(e) => setPayPaidAt(e.target.value)}
                  className={ADMIN_SURFACE.input}
                />
              </div>
            </div>
            <div className="space-y-2">
              <DarkLabel htmlFor="payNote">Observação (opcional)</DarkLabel>
              <Textarea
                id="payNote"
                rows={2}
                value={payNote}
                onChange={(e) => setPayNote(e.target.value)}
                placeholder="Ex.: Pix, boleto, pagamento parcial…"
                className={ADMIN_SURFACE.input}
                maxLength={500}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={() => setPayShop(null)}
              className={ADMIN_SURFACE.btnGhost}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={isPending || parsePriceBRLInput(payAmountInput) <= 0}
              onClick={submitPayment}
              className={ADMIN_SURFACE.btnPrimary}
            >
              {isPending ? "Salvando..." : "Registrar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(pendingDeletePayment)}
        onOpenChange={(open) => {
          if (!open) setPendingDeletePayment(null);
        }}
      >
        <DialogContent className="admin-popover border-white/10 bg-[#151618] text-[#f5f5f5] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Excluir lançamento?</DialogTitle>
            <DialogDescription className={ADMIN_SURFACE.muted}>
              {pendingDeletePayment
                ? `Vai remover o pagamento de ${formatPriceBRL(pendingDeletePayment.amountCents)} de ${pendingDeletePayment.shopName} (${formatBillingMonthLabel(pendingDeletePayment.referenceMonth)}). Isso não tem volta.`
                : null}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={() => setPendingDeletePayment(null)}
              className={ADMIN_SURFACE.btnGhost}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={isPending}
              onClick={confirmDeletePayment}
              className="!border-transparent !bg-[#f87171] !text-[#0e0f11] hover:!bg-[#ef4444]"
            >
              {isPending ? "Excluindo..." : "Excluir"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
