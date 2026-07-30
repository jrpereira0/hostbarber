"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarOff, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FormSectionTitle } from "@/components/admin/form-section";
import { formatDateBR, formatTime } from "@/lib/format";
import {
  createException,
  deleteException,
} from "@/app/admin/(panel)/configuracoes/actions";
import { ADMIN_SURFACE } from "@/lib/admin-surface";
import { cn } from "@/lib/utils";

export type ExceptionItem = {
  id: string;
  date: string;
  kind: "closed" | "custom";
  startTime: string | null;
  endTime: string | null;
  note: string;
  professionalNickname: string | null;
};

type ExceptionsCardProps = {
  exceptions: ExceptionItem[];
  professionals: { id: string; nickname: string }[];
  readOnly?: boolean;
};

const SHOP = "shop";

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

export function ExceptionsCard({
  exceptions,
  professionals,
  readOnly = false,
}: ExceptionsCardProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const [date, setDate] = useState("");
  const [scope, setScope] = useState(SHOP);
  const [kind, setKind] = useState<"closed" | "custom">("closed");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("19:00");
  const [note, setNote] = useState("");

  function resetForm() {
    setDate("");
    setScope(SHOP);
    setKind("closed");
    setStartTime("09:00");
    setEndTime("19:00");
    setNote("");
  }

  async function handleCreate() {
    if (!date) {
      toast.error("Escolha a data.");
      return;
    }
    setBusy(true);
    const result = await createException({
      date,
      professionalId: scope === SHOP ? null : scope,
      kind,
      startTime: kind === "custom" ? startTime : null,
      endTime: kind === "custom" ? endTime : null,
      note,
    });

    if (result.ok) {
      toast.success("Exceção criada.");
      setOpen(false);
      resetForm();
      router.refresh();
    } else {
      toast.error(result.error);
    }
    setBusy(false);
  }

  async function handleDelete(id: string) {
    setBusy(true);
    const result = await deleteException(id);
    if (result.ok) {
      toast.success("Exceção removida.");
      router.refresh();
    } else {
      toast.error(result.error);
    }
    setBusy(false);
  }

  return (
    <div
      data-tour="tour-settings-exceptions"
      className={cn(
        ADMIN_SURFACE.panel,
        "flex flex-col gap-4 p-4 sm:gap-5 sm:p-6"
      )}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
        <FormSectionTitle
          tone="dark"
          icon={CalendarOff}
          title="Dias especiais"
          description="Feriados, folgas pontuais e dias com horário diferente."
        />
        {!readOnly && (
          <Button
            variant="outline"
            onClick={() => setOpen(true)}
            className={cn(
              "h-10 w-full sm:h-8 sm:w-auto",
              ADMIN_SURFACE.btnGhost
            )}
          >
            <Plus />
            Nova exceção
          </Button>
        )}
      </div>

      {exceptions.length === 0 ? (
        <div
          className={cn(
            "rounded-xl border border-dashed border-white/10 px-4 py-8 text-center text-sm",
            ADMIN_SURFACE.muted
          )}
        >
          Nenhum dia especial cadastrado. Exemplo: feriado fechado, ou véspera
          de festa atendendo até mais tarde.
        </div>
      ) : (
        <ul className="-mx-4 divide-y divide-white/10 sm:-mx-6">
          {exceptions.map((e) => (
            <li
              key={e.id}
              className="flex items-start gap-3 px-4 py-3.5 sm:items-center sm:px-6"
            >
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-[15px] font-medium tracking-tight text-[#f5f5f5]">
                    {formatDateBR(e.date)}
                  </span>
                  {e.kind === "closed" ? (
                    <Badge className="border-[rgb(248_113_113_/_22%)] bg-[rgb(248_113_113_/_12%)] font-normal text-[#fca5a5]">
                      Fechado
                    </Badge>
                  ) : (
                    <Badge className="border-[rgb(236_241_94_/_22%)] bg-[rgb(236_241_94_/_12%)] font-normal text-[#ecf15e]">
                      {formatTime(e.startTime!)} às {formatTime(e.endTime!)}
                    </Badge>
                  )}
                </div>
                <p className={cn("text-xs", ADMIN_SURFACE.muted)}>
                  {e.professionalNickname ?? "Barbearia toda"}
                  {e.note ? ` · ${e.note}` : ""}
                </p>
              </div>
              {!readOnly && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="shrink-0 text-[#fca5a5] hover:bg-[rgb(248_113_113_/_12%)] hover:text-[#fecaca]"
                  onClick={() => handleDelete(e.id)}
                  disabled={busy}
                  aria-label="Remover exceção"
                >
                  <Trash2 />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="border-white/10 bg-[#151618] text-[#f5f5f5] ring-white/10">
          <DialogHeader>
            <DialogTitle className="text-[#f5f5f5]">Nova exceção</DialogTitle>
            <DialogDescription className={ADMIN_SURFACE.muted}>
              Vale só pra data escolhida e substitui o horário normal.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <DarkLabel htmlFor="exception-date">Data</DarkLabel>
                <Input
                  id="exception-date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className={ADMIN_SURFACE.input}
                />
              </div>
              <div className="space-y-2">
                <DarkLabel>Vale pra quem?</DarkLabel>
                <Select value={scope} onValueChange={setScope}>
                  <SelectTrigger className={ADMIN_SURFACE.selectTrigger}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className={ADMIN_SURFACE.popover}>
                    <SelectItem value={SHOP}>Barbearia toda</SelectItem>
                    {professionals.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.nickname}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <DarkLabel>O que acontece nesse dia?</DarkLabel>
              <Select
                value={kind}
                onValueChange={(v) => setKind(v as "closed" | "custom")}
              >
                <SelectTrigger className={ADMIN_SURFACE.selectTrigger}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className={ADMIN_SURFACE.popover}>
                  <SelectItem value="closed">
                    Fechado / folga o dia todo
                  </SelectItem>
                  <SelectItem value="custom">
                    Horário diferente do normal
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {kind === "custom" && (
              <div className="flex items-center gap-2">
                <Input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className={cn("w-28", ADMIN_SURFACE.input)}
                />
                <span className={cn("text-sm", ADMIN_SURFACE.muted)}>às</span>
                <Input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className={cn("w-28", ADMIN_SURFACE.input)}
                />
              </div>
            )}

            <div className="space-y-2">
              <DarkLabel htmlFor="exception-note">Motivo (opcional)</DarkLabel>
              <Input
                id="exception-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Ex: Feriado, médico, evento..."
                maxLength={200}
                className={ADMIN_SURFACE.input}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={busy}
              className={ADMIN_SURFACE.btnGhost}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleCreate}
              disabled={busy}
              className={ADMIN_SURFACE.btnPrimary}
            >
              {busy ? "Salvando..." : "Criar exceção"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
