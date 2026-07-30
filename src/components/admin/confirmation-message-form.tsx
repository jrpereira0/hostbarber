"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { FormSectionTitle } from "@/components/admin/form-section";
import { saveConfirmationWhatsappMessage } from "@/app/admin/(panel)/configuracoes/actions";
import {
  applyConfirmationTags,
  CONFIRMATION_MESSAGE_TAGS,
  DEFAULT_CONFIRMATION_WHATSAPP_MESSAGE,
} from "@/lib/confirmation-message";
import { ADMIN_SURFACE } from "@/lib/admin-surface";
import { cn } from "@/lib/utils";

type ConfirmationMessageFormProps = {
  initialMessage: string;
  initialEnabled: boolean;
  shopName: string;
};

export function ConfirmationMessageForm({
  initialMessage,
  initialEnabled,
  shopName,
}: ConfirmationMessageFormProps) {
  const router = useRouter();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [enabled, setEnabled] = useState(initialEnabled);
  const [message, setMessage] = useState(
    initialMessage || DEFAULT_CONFIRMATION_WHATSAPP_MESSAGE
  );
  const [saving, setSaving] = useState(false);

  const preview = applyConfirmationTags(message, {
    customerFirstName: "João",
    customerLastName: "Silva",
    professionalNickname: "Chico",
    date: "2026-07-28",
    startTime: "15:00",
    serviceNames: ["Corte", "Barba"],
    shopName: shopName || "Barbearia",
  });

  function insertTag(tag: string) {
    const el = textareaRef.current;
    if (!el) {
      setMessage((prev) => `${prev}${tag}`);
      return;
    }

    const start = el.selectionStart;
    const end = el.selectionEnd;
    const next = message.slice(0, start) + tag + message.slice(end);
    setMessage(next);

    requestAnimationFrame(() => {
      el.focus();
      const cursor = start + tag.length;
      el.setSelectionRange(cursor, cursor);
    });
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    try {
      const result = await saveConfirmationWhatsappMessage({
        message,
        enabled,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(
        enabled
          ? "Confirmação no WhatsApp ativada e salva."
          : "Confirmação no WhatsApp desativada."
      );
      router.refresh();
    } catch {
      toast.error("Não foi possível salvar a mensagem.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      data-tour="tour-settings-messages"
      onSubmit={handleSubmit}
      className={cn(ADMIN_SURFACE.panel, "flex flex-col gap-6 p-4 sm:p-5")}
    >
      <FormSectionTitle
        tone="dark"
        icon={MessageCircle}
        title="Confirmação no WhatsApp"
        description="Quando estiver ativa, o card do atendimento mostra o botão Confirmar no WhatsApp e abre o zap com a mensagem pronta."
      />

      <div
        className={cn(
          "flex items-center justify-between gap-4 rounded-xl border px-4 py-4",
          enabled
            ? "border-[var(--agenda-accent,#ecf15e)]/35 bg-[rgb(236_241_94_/_8%)]"
            : "border-white/20 bg-[#1a1b1e]"
        )}
      >
        <div className="min-w-0 space-y-1">
          <Label htmlFor="confirmation-enabled" className="text-[#f5f5f5]">
            Ativar confirmação no WhatsApp
          </Label>
          <p className={cn("text-xs", ADMIN_SURFACE.muted)}>
            {enabled
              ? "Ligado: o botão aparece no card do atendimento."
              : "Desligado: some o botão no card e a mensagem não é usada."}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2.5">
          <span
            className={cn(
              "text-xs font-semibold uppercase tracking-wide",
              enabled
                ? "text-[var(--agenda-accent,#ecf15e)]"
                : "text-[#8b8d93]"
            )}
          >
            {enabled ? "Ativo" : "Off"}
          </span>
          <Switch
            id="confirmation-enabled"
            checked={enabled}
            onCheckedChange={setEnabled}
            disabled={saving}
            className={cn(
              "h-6 w-11 border-2 shadow-sm",
              "data-checked:border-[var(--agenda-accent,#ecf15e)] data-checked:bg-[var(--agenda-accent,#ecf15e)]",
              "data-unchecked:border-white/40 data-unchecked:bg-[#3a3b40]",
              "[&_[data-slot=switch-thumb]]:size-5 [&_[data-slot=switch-thumb]]:bg-white",
              "data-checked:[&_[data-slot=switch-thumb]]:translate-x-[22px] data-checked:[&_[data-slot=switch-thumb]]:bg-[#0e0f11]",
              "data-unchecked:[&_[data-slot=switch-thumb]]:translate-x-0.5"
            )}
          />
        </div>
      </div>

      <div
        className={cn(
          "flex flex-col gap-6",
          !enabled && "pointer-events-none opacity-45"
        )}
        aria-disabled={!enabled}
      >
        <div className="space-y-2">
          <Label className="text-[#f5f5f5]">Tags disponíveis</Label>
          <p className={cn("text-xs", ADMIN_SURFACE.muted)}>
            Clique pra inserir no ponto do cursor.
          </p>
          <div className="flex flex-wrap gap-2">
            {CONFIRMATION_MESSAGE_TAGS.map((item) => (
              <button
                key={item.tag}
                type="button"
                title={item.description}
                onClick={() => insertTag(item.tag)}
                disabled={!enabled || saving}
                className="rounded-md border border-white/25 bg-[#1a1b1e] px-2.5 py-1.5 text-left text-xs shadow-sm transition-colors hover:border-[var(--agenda-accent,#ecf15e)]/70 hover:bg-[#222327] disabled:cursor-not-allowed"
              >
                <span className="font-medium text-[#f5f5f5]">{item.label}</span>
                <span className="ml-1.5 font-mono text-[#a8a9ad]">
                  {item.tag}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="confirmation-message" className="text-[#f5f5f5]">
            Mensagem
          </Label>
          <Textarea
            id="confirmation-message"
            ref={textareaRef}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            rows={10}
            maxLength={2000}
            disabled={!enabled || saving}
            className="min-h-48 resize-y border-white/10 bg-[#121316] font-mono text-sm text-[#f5f5f5]"
          />
          <p className={cn("text-xs tabular-nums", ADMIN_SURFACE.muted)}>
            {message.length}/2000
          </p>
        </div>

        <div className="space-y-2">
          <Label className="text-[#f5f5f5]">Prévia com dados de exemplo</Label>
          <div
            className={cn(
              "whitespace-pre-wrap rounded-xl border border-white/10 bg-[#121316] p-3 text-sm leading-relaxed text-[#e8e8ea]"
            )}
          >
            {preview.trim()
              ? preview
              : "Escreva a mensagem acima pra ver a prévia."}
          </div>
        </div>
      </div>

      <div className="sticky bottom-0 -mx-4 flex justify-end border-t border-white/10 bg-[rgb(14_15_17_/_96%)] px-4 py-3 backdrop-blur-md sm:-mx-5 sm:px-5">
        <Button type="submit" disabled={saving} className="min-w-28">
          {saving ? "Salvando…" : "Salvar"}
        </Button>
      </div>
    </form>
  );
}
