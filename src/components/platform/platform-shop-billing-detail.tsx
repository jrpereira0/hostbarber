"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlertTriangle,
  Banknote,
  CalendarDays,
  CheckCircle2,
  CircleDashed,
  ExternalLink,
  Mail,
  MoreHorizontal,
  Phone,
  Store,
  Trash2,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/admin/empty-state";
import { FormSectionTitle } from "@/components/admin/form-section";
import {
  AdminFormFields,
  AdminFormPage,
  AdminFormSectionCard,
} from "@/components/admin/admin-form-layout";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  formatDateBR,
  formatPriceBRL,
  formatWhatsapp,
  parsePriceBRLInput,
} from "@/lib/format";
import { bookingPathForSlug } from "@/lib/booking-path";
import {
  billingStatusLabel,
  formatBillingMonthLabel,
  monthKey,
  type BillingShopRow,
  type BillingStatusKind,
  type PlatformPaymentRow,
} from "@/lib/platform-billing";
import {
  clearShopBilling,
  deletePayment,
  registerPayment,
  saveShopBilling,
} from "@/app/plataforma/(panel)/financeiro/actions";
import { PlatformDeleteShopControl } from "@/components/platform/platform-delete-shop-control";
import { ADMIN_SURFACE } from "@/lib/admin-surface";
import { cn } from "@/lib/utils";

const DUE_DAYS = Array.from({ length: 28 }, (_, i) => i + 1);

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

function FieldHint({ children }: { children: React.ReactNode }) {
  return <p className={cn("text-xs", ADMIN_SURFACE.muted)}>{children}</p>;
}

function formatCentsInput(cents: number): string {
  if (cents <= 0) return "";
  return formatPriceBRL(cents);
}

function statusBadgeClass(kind: BillingStatusKind): string {
  switch (kind) {
    case "paid":
      return "bg-[rgb(74_222_128_/_14%)] text-[#4ade80] border-[rgb(74_222_128_/_25%)]";
    case "pending":
      return "bg-[rgb(236_241_94_/_14%)] text-[#ecf15e] border-[rgb(236_241_94_/_25%)]";
    case "overdue":
      return "bg-[rgb(248_113_113_/_14%)] text-[#f87171] border-[rgb(248_113_113_/_25%)]";
    case "unconfigured":
      return "bg-white/5 text-[#b4b6bb] border-white/10";
  }
}

function StatusIcon({ kind }: { kind: BillingStatusKind }) {
  if (kind === "paid") return <CheckCircle2 className="size-4" />;
  if (kind === "overdue") return <AlertTriangle className="size-4" />;
  if (kind === "pending") return <CalendarDays className="size-4" />;
  return <CircleDashed className="size-4" />;
}

type PlatformShopBillingDetailProps = {
  shop: BillingShopRow;
  payments: PlatformPaymentRow[];
  totalReceivedCents: number;
};

export function PlatformShopBillingDetail({
  shop,
  payments,
  totalReceivedCents,
}: PlatformShopBillingDetailProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [feeInput, setFeeInput] = useState(
    shop.monthlyFeeCents ? formatCentsInput(shop.monthlyFeeCents) : ""
  );
  const [dueDay, setDueDay] = useState(String(shop.billingDueDay ?? 5));

  const [payAmountInput, setPayAmountInput] = useState(
    shop.monthlyFeeCents ? formatCentsInput(shop.monthlyFeeCents) : ""
  );
  const [payReferenceMonth, setPayReferenceMonth] = useState(
    monthKey(new Date()).slice(0, 7)
  );
  const [payPaidAt, setPayPaidAt] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [payNote, setPayNote] = useState("");

  const [pendingDelete, setPendingDelete] = useState<PlatformPaymentRow | null>(
    null
  );
  const [confirmClear, setConfirmClear] = useState(false);

  const cityLabel = [shop.city, shop.state].filter(Boolean).join(" — ");
  const feeDirty =
    parsePriceBRLInput(feeInput) !== (shop.monthlyFeeCents ?? 0) ||
    Number(dueDay) !== (shop.billingDueDay ?? 5);

  function submitBilling() {
    const cents = parsePriceBRLInput(feeInput);
    const day = Number(dueDay);
    startTransition(async () => {
      const result = await saveShopBilling({
        shopId: shop.id,
        monthlyFeeCents: cents,
        billingDueDay: day,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Cobrança salva.");
      router.refresh();
    });
  }

  function submitClearBilling() {
    startTransition(async () => {
      const result = await clearShopBilling(shop.id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Cobrança removida deste cliente.");
      setConfirmClear(false);
      setFeeInput("");
      setDueDay("5");
      router.refresh();
    });
  }

  function submitPayment() {
    const cents = parsePriceBRLInput(payAmountInput);
    startTransition(async () => {
      const result = await registerPayment({
        shopId: shop.id,
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
      setPayNote("");
      setPayAmountInput(
        shop.monthlyFeeCents ? formatCentsInput(shop.monthlyFeeCents) : ""
      );
      setPayReferenceMonth(monthKey(new Date()).slice(0, 7));
      setPayPaidAt(new Date().toISOString().slice(0, 10));
      router.refresh();
    });
  }

  function confirmDeletePayment() {
    if (!pendingDelete) return;
    startTransition(async () => {
      const result = await deletePayment(pendingDelete.id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Lançamento excluído.");
      setPendingDelete(null);
      router.refresh();
    });
  }

  return (
    <AdminFormPage tone="dark">
      {/* Resumo do cliente */}
      <section
        className={cn(
          ADMIN_SURFACE.panel,
          "overflow-hidden"
        )}
      >
        <div className="border-b border-white/10 bg-white/[0.03] px-5 py-4 sm:px-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
                    statusBadgeClass(shop.status.kind)
                  )}
                >
                  <StatusIcon kind={shop.status.kind} />
                  {billingStatusLabel(shop.status)}
                </span>
                {!shop.active ? (
                  <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-medium text-[#b4b6bb]">
                    Cliente inativo
                  </span>
                ) : null}
              </div>
              <p className={cn("text-sm", ADMIN_SURFACE.muted)}>
                {cityLabel || "Cidade não informada"}
                {" · "}
                <span className="tabular-nums">/{shop.slug}</span>
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                asChild
                className={cn("h-9", ADMIN_SURFACE.btnGhost)}
              >
                <Link href={`/plataforma/clientes/${shop.id}`}>
                  <Store className="size-4" />
                  Cadastro
                </Link>
              </Button>
              <Button
                type="button"
                variant="outline"
                asChild
                className={cn("h-9", ADMIN_SURFACE.btnGhost)}
              >
                <a
                  href={bookingPathForSlug(shop.slug)}
                  target="_blank"
                  rel="noreferrer"
                >
                  <ExternalLink className="size-4" />
                  Agenda
                </a>
              </Button>
            </div>
          </div>
        </div>

        <div className="grid gap-px bg-white/10 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCell
            label="Mensalidade"
            value={
              shop.monthlyFeeCents != null
                ? formatPriceBRL(shop.monthlyFeeCents)
                : "—"
            }
            accent
          />
          <MetricCell
            label="Vencimento"
            value={
              shop.billingDueDay != null ? `Todo dia ${shop.billingDueDay}` : "—"
            }
          />
          <MetricCell
            label="Pago neste mês"
            value={formatPriceBRL(shop.status.paidThisMonthCents)}
          />
          <MetricCell
            label="Falta neste mês"
            value={
              shop.status.kind === "unconfigured"
                ? "—"
                : formatPriceBRL(shop.status.remainingThisMonthCents)
            }
          />
        </div>

        <div className="grid gap-3 border-t border-white/10 px-5 py-4 sm:grid-cols-2 sm:px-6">
          <div className="flex items-start gap-2.5 text-sm">
            <Mail className={cn("mt-0.5 size-4 shrink-0", ADMIN_SURFACE.muted)} />
            <div className="min-w-0">
              <p className={cn("text-xs", ADMIN_SURFACE.muted)}>E-mail do dono</p>
              <p className="truncate text-[#f5f5f5]">{shop.ownerEmail || "—"}</p>
            </div>
          </div>
          <div className="flex items-start gap-2.5 text-sm">
            <Phone className={cn("mt-0.5 size-4 shrink-0", ADMIN_SURFACE.muted)} />
            <div className="min-w-0">
              <p className={cn("text-xs", ADMIN_SURFACE.muted)}>WhatsApp do dono</p>
              <p className="tabular-nums text-[#f5f5f5]">
                {shop.ownerWhatsapp
                  ? formatWhatsapp(shop.ownerWhatsapp)
                  : "—"}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Plano de cobrança */}
      <AdminFormSectionCard
        tone="dark"
        title="Plano de cobrança"
        description="Valor mensal e dia de vencimento deste cliente. Só você vê essas informações."
      >
        <div className="mb-4">
          <FormSectionTitle
            tone="dark"
            icon={Wallet}
            title="Mensalidade"
            description="Use o valor combinado com o cliente. O status (em dia / atrasado) usa esses dados."
          />
        </div>
        <AdminFormFields columns={2}>
          <div className="space-y-2">
            <DarkLabel htmlFor="fee">Valor da mensalidade</DarkLabel>
            <Input
              id="fee"
              inputMode="numeric"
              value={feeInput}
              onChange={(e) =>
                setFeeInput(formatCentsInput(parsePriceBRLInput(e.target.value)))
              }
              placeholder="R$ 0,00"
              className={ADMIN_SURFACE.input}
              disabled={isPending}
            />
            <FieldHint>Ex.: R$ 97,00 por mês.</FieldHint>
          </div>
          <div className="space-y-2">
            <DarkLabel htmlFor="dueDay">Dia de vencimento</DarkLabel>
            <Select
              value={dueDay}
              onValueChange={setDueDay}
              disabled={isPending}
            >
              <SelectTrigger id="dueDay" className={ADMIN_SURFACE.selectTrigger}>
                <SelectValue placeholder="Escolha o dia" />
              </SelectTrigger>
              <SelectContent className="admin-popover">
                {DUE_DAYS.map((day) => (
                  <SelectItem key={day} value={String(day)}>
                    Todo dia {day}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldHint>
              Limitado ao dia 28 pra funcionar em fevereiro e nos outros meses.
            </FieldHint>
          </div>
        </AdminFormFields>

        <div className="mt-5 flex flex-col gap-2 border-t border-white/10 pt-4 sm:flex-row sm:items-center sm:justify-between">
          {shop.monthlyFeeCents != null ? (
            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={() => setConfirmClear(true)}
              className={cn(
                "w-full sm:w-auto",
                "!border-[rgb(248_113_113_/_35%)] !bg-transparent !text-[#f87171] hover:!bg-[rgb(248_113_113_/_12%)]"
              )}
            >
              Remover cobrança
            </Button>
          ) : (
            <span className={cn("text-sm", ADMIN_SURFACE.muted)}>
              Ainda sem cobrança configurada.
            </span>
          )}
          <Button
            type="button"
            disabled={isPending || parsePriceBRLInput(feeInput) <= 0 || !feeDirty}
            onClick={submitBilling}
            className={cn("w-full sm:w-auto", ADMIN_SURFACE.btnPrimary)}
          >
            {isPending ? "Salvando..." : "Salvar plano"}
          </Button>
        </div>
      </AdminFormSectionCard>

      {/* Registrar pagamento */}
      <AdminFormSectionCard
        tone="dark"
        title="Registrar pagamento"
        description="Lance o que você já recebeu deste cliente. Pode registrar pagamento parcial se precisar."
      >
        <div className="mb-4">
          <FormSectionTitle
            tone="dark"
            icon={Banknote}
            title="Novo lançamento"
            description="O valor entra no extrato e atualiza o status do mês de referência."
          />
        </div>
        <AdminFormFields columns={2}>
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
              disabled={isPending}
            />
          </div>
          <div className="space-y-2">
            <DarkLabel htmlFor="payMonth">Mês de referência</DarkLabel>
            <Input
              id="payMonth"
              type="month"
              value={payReferenceMonth}
              onChange={(e) => setPayReferenceMonth(e.target.value)}
              className={ADMIN_SURFACE.input}
              disabled={isPending}
            />
            <FieldHint>
              Qual mês essa mensalidade cobre (ex.: julho/2026).
            </FieldHint>
          </div>
          <div className="space-y-2">
            <DarkLabel htmlFor="payDate">Data do pagamento</DarkLabel>
            <Input
              id="payDate"
              type="date"
              value={payPaidAt}
              onChange={(e) => setPayPaidAt(e.target.value)}
              className={ADMIN_SURFACE.input}
              disabled={isPending}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <DarkLabel htmlFor="payNote">Observação (opcional)</DarkLabel>
            <Textarea
              id="payNote"
              rows={2}
              value={payNote}
              onChange={(e) => setPayNote(e.target.value)}
              placeholder="Ex.: Pix, boleto, pagamento parcial…"
              className={ADMIN_SURFACE.input}
              maxLength={500}
              disabled={isPending}
            />
          </div>
        </AdminFormFields>
        <div className="mt-5 flex justify-end border-t border-white/10 pt-4">
          <Button
            type="button"
            disabled={isPending || parsePriceBRLInput(payAmountInput) <= 0}
            onClick={submitPayment}
            className={cn("w-full sm:w-auto", ADMIN_SURFACE.btnPrimary)}
          >
            {isPending ? "Registrando..." : "Registrar pagamento"}
          </Button>
        </div>
      </AdminFormSectionCard>

      {/* Histórico */}
      <AdminFormSectionCard
        tone="dark"
        title="Histórico de pagamentos"
        description={
          payments.length === 0
            ? "Nenhum lançamento ainda."
            : `${payments.length} lançamento${payments.length === 1 ? "" : "s"} · total recebido ${formatPriceBRL(totalReceivedCents)}`
        }
      >
        {payments.length === 0 ? (
          <EmptyState
            icon={Banknote}
            title="Nenhum pagamento"
            description="Quando o cliente pagar, registre acima. O histórico aparece aqui."
            className="border-white/10 bg-[#0e0f11]"
          />
        ) : (
          <div className="-mx-5 overflow-hidden sm:-mx-6">
            <div className="hidden grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)_minmax(0,1fr)_minmax(0,1.4fr)_52px] gap-3 border-b border-white/10 px-5 py-2.5 text-[11px] font-medium tracking-wide text-[#8b8d93] uppercase sm:px-6 md:grid">
              <span>Data</span>
              <span>Valor</span>
              <span>Referência</span>
              <span>Observação</span>
              <span className="sr-only">Ações</span>
            </div>
            <ul className="divide-y divide-white/10">
              {payments.map((payment) => (
                <li
                  key={payment.id}
                  className="grid grid-cols-1 gap-2 px-5 py-3.5 sm:px-6 md:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)_minmax(0,1fr)_minmax(0,1.4fr)_52px] md:items-center md:gap-3"
                >
                  <div className="text-sm tabular-nums text-[#f5f5f5]">
                    {formatDateBR(payment.paidAt)}
                  </div>
                  <div className="text-sm font-medium tabular-nums text-[#ecf15e]">
                    {formatPriceBRL(payment.amountCents)}
                  </div>
                  <div className={cn("text-sm", ADMIN_SURFACE.muted)}>
                    {formatBillingMonthLabel(payment.referenceMonth)}
                  </div>
                  <div className={cn("truncate text-sm", ADMIN_SURFACE.muted)}>
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
                        <DropdownMenuItem
                          className="text-[#f87171] focus:text-[#f87171]"
                          onClick={() => setPendingDelete(payment)}
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
      </AdminFormSectionCard>

      {/* Zona de perigo */}
      <PlatformDeleteShopControl
        shopId={shop.id}
        shopName={shop.name}
        redirectTo="/plataforma/financeiro"
      />

      <div className="sticky bottom-0 z-10 -mx-4 mt-2 border-t border-white/10 bg-[#0e0f11]/95 px-4 py-3.5 backdrop-blur supports-[backdrop-filter]:bg-[#0e0f11]/80 md:-mx-8 md:px-8 pb-[max(0.875rem,env(safe-area-inset-bottom))]">
        <div className="flex w-full items-center justify-end gap-3">
          <Button
            type="button"
            variant="outline"
            disabled={isPending}
            onClick={() => router.push("/plataforma/financeiro")}
            className={cn("h-10 min-w-24 sm:h-9", ADMIN_SURFACE.btnGhost)}
          >
            Voltar
          </Button>
          <Button
            type="button"
            disabled={
              isPending || parsePriceBRLInput(feeInput) <= 0 || !feeDirty
            }
            onClick={submitBilling}
            className={cn("h-10 min-w-40 sm:h-9", ADMIN_SURFACE.btnPrimary)}
          >
            {isPending ? "Salvando..." : "Salvar plano"}
          </Button>
        </div>
      </div>

      <Dialog
        open={confirmClear}
        onOpenChange={(open) => {
          if (!open) setConfirmClear(false);
        }}
      >
        <DialogContent className="admin-popover border-white/10 bg-[#151618] text-[#f5f5f5] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Remover cobrança?</DialogTitle>
            <DialogDescription className={ADMIN_SURFACE.muted}>
              O cliente volta a aparecer como “Sem cobrança”. O histórico de
              pagamentos continua salvo.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={() => setConfirmClear(false)}
              className={ADMIN_SURFACE.btnGhost}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={isPending}
              onClick={submitClearBilling}
              className="!border-transparent !bg-[#f87171] !text-[#0e0f11] hover:!bg-[#ef4444]"
            >
              {isPending ? "Removendo..." : "Remover"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
      >
        <DialogContent className="admin-popover border-white/10 bg-[#151618] text-[#f5f5f5] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Excluir lançamento?</DialogTitle>
            <DialogDescription className={ADMIN_SURFACE.muted}>
              {pendingDelete
                ? `Vai remover ${formatPriceBRL(pendingDelete.amountCents)} de ${formatBillingMonthLabel(pendingDelete.referenceMonth)}. Isso não tem volta.`
                : null}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={() => setPendingDelete(null)}
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
    </AdminFormPage>
  );
}

function MetricCell({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="bg-[#151618] px-5 py-4 sm:px-6">
      <p
        className={cn(
          "text-[11px] font-medium tracking-wide uppercase",
          ADMIN_SURFACE.muted
        )}
      >
        {label}
      </p>
      <p
        className={cn(
          "mt-1 text-lg font-semibold tabular-nums",
          accent ? "text-[#ecf15e]" : "text-[#f5f5f5]"
        )}
      >
        {value}
      </p>
    </div>
  );
}
