"use client";

import { useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Copy, ExternalLink, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { FormSectionTitle } from "@/components/admin/form-section";
import { saveShopSlug } from "@/app/admin/(panel)/configuracoes/actions";
import { bookingPathForSlug } from "@/lib/booking-path";
import { normalizeSlugInput } from "@/lib/shops/slug";
import { ADMIN_SURFACE } from "@/lib/admin-surface";
import { cn } from "@/lib/utils";

type BookingLinkFormProps = {
  initialSlug: string;
};

function subscribeNoop() {
  return () => {};
}

function useOrigin(): string {
  return useSyncExternalStore(
    subscribeNoop,
    () => window.location.origin,
    () => ""
  );
}

export function BookingLinkForm({ initialSlug }: BookingLinkFormProps) {
  const router = useRouter();
  const [slug, setSlug] = useState(initialSlug);
  const origin = useOrigin();
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  const fullUrl = `${origin}${bookingPathForSlug(slug || "sua-barbearia")}`;
  const dirty = slug !== initialSlug;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopied(true);
      toast.success("Link copiado.");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Não foi possível copiar o link.");
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);

    const result = await saveShopSlug({ slug });

    if (result.ok) {
      toast.success("Link de agendamento atualizado.");
      router.refresh();
    } else {
      toast.error(result.error);
    }
    setSaving(false);
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-4"
      autoComplete="off"
    >
      <div
        className={cn(
          ADMIN_SURFACE.panel,
          "flex flex-col gap-5 p-4 sm:gap-6 sm:p-6"
        )}
      >
        <FormSectionTitle
          tone="dark"
          icon={Link2}
          title="Link de agendamento"
          description="O endereço que você compartilha com os clientes para marcar horário."
        />

        <div className="space-y-2">
          <Label className="text-[#f5f5f5]">Link atual</Label>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div
              className={cn(
                "min-w-0 flex-1 truncate rounded-lg border px-3 py-2 text-sm",
                ADMIN_SURFACE.input
              )}
            >
              {fullUrl}
            </div>
            <div className="flex shrink-0 gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={copyLink}
                className={cn("h-9 flex-1 sm:flex-none", ADMIN_SURFACE.btnGhost)}
              >
                {copied ? (
                  <Check className="size-4" />
                ) : (
                  <Copy className="size-4" />
                )}
                Copiar
              </Button>
              <Button
                type="button"
                variant="outline"
                asChild
                className={cn("h-9 flex-1 sm:flex-none", ADMIN_SURFACE.btnGhost)}
              >
                <a href={fullUrl} target="_blank" rel="noreferrer">
                  <ExternalLink className="size-4" />
                  Abrir
                </a>
              </Button>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="slug" className="text-[#f5f5f5]">
            Endereço personalizado
          </Label>
          <div
            className={cn(
              "flex items-center gap-1 rounded-lg border px-3 py-2",
              ADMIN_SURFACE.input
            )}
          >
            <span className={cn("shrink-0 text-sm", ADMIN_SURFACE.muted)}>
              /agenda/
            </span>
            <input
              id="slug"
              value={slug}
              onChange={(e) => setSlug(normalizeSlugInput(e.target.value))}
              placeholder="sua-barbearia"
              disabled={saving}
              maxLength={60}
              className="w-full min-w-0 bg-transparent text-sm text-[#f5f5f5] outline-none placeholder:text-[#b4b6bb]"
            />
          </div>
          <p className={cn("text-xs", ADMIN_SURFACE.muted)}>
            Só letras minúsculas, números e hífen. Se você já divulgou o link
            atual, ele para de funcionar assim que trocar.
          </p>
        </div>
      </div>

      {dirty ? (
        <div className="sticky bottom-0 z-10 -mx-4 border-t border-white/10 bg-[#0e0f11]/95 px-4 py-3.5 backdrop-blur supports-[backdrop-filter]:bg-[#0e0f11]/80 sm:-mx-0 sm:rounded-2xl sm:border sm:px-5 sm:py-4">
          <div className="flex justify-end">
            <Button
              type="submit"
              disabled={saving || slug.trim().length < 3}
              className={cn(
                "h-10 w-full sm:h-9 sm:w-auto",
                ADMIN_SURFACE.btnPrimary
              )}
            >
              {saving ? "Salvando..." : "Salvar link"}
            </Button>
          </div>
        </div>
      ) : null}
    </form>
  );
}
