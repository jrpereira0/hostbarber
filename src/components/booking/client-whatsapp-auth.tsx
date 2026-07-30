"use client";

import { useEffect, useId, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatWhatsapp } from "@/lib/format";
import { normalizeWhatsapp, whatsappLookupDelayMs } from "@/lib/whatsapp";
import { cn } from "@/lib/utils";

type ClientWhatsappAuthProps = {
  /** Slug da barbearia na agenda pública. */
  shopSlug: string;
  /** Título curto acima do campo. */
  title?: string;
  /** Texto de ajuda. */
  hint?: string;
  /** Chamado quando o WhatsApp foi informado (ou sessão já válida). */
  onAuthenticated: (whatsapp: string) => void;
  /** Se true, ao montar tenta reaproveitar a sessão existente. */
  resumeSession?: boolean;
  className?: string;
};

export function ClientWhatsappAuth({
  shopSlug,
  title = "WhatsApp",
  hint = "Informe seu WhatsApp pra continuar.",
  onAuthenticated,
  resumeSession = true,
  className,
}: ClientWhatsappAuthProps) {
  const fieldId = useId();
  const whatsappInputId = `${fieldId}-whatsapp`;
  const [whatsapp, setWhatsapp] = useState("");
  const [checkingSession, setCheckingSession] = useState(resumeSession);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!resumeSession) {
      const timer = setTimeout(() => setCheckingSession(false), 0);
      return () => clearTimeout(timer);
    }

    let cancelled = false;
    const timer = setTimeout(() => {
      fetch(`/api/agenda/session?shop=${encodeURIComponent(shopSlug)}`, {
        credentials: "include",
      })
        .then(async (res) => {
          const body = await res.json().catch(() => ({}));
          if (cancelled) return;
          if (body.authenticated && typeof body.whatsapp === "string") {
            onAuthenticated(body.whatsapp);
            return;
          }
          setCheckingSession(false);
        })
        .catch(() => {
          if (!cancelled) setCheckingSession(false);
        });
    }, 0);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [onAuthenticated, resumeSession, shopSlug]);

  async function continueWithWhatsapp() {
    const canonical = normalizeWhatsapp(whatsapp);
    if (!canonical || whatsappLookupDelayMs(whatsapp) === null) {
      toast.error("Informe um WhatsApp válido.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/agenda/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ whatsapp: canonical, shop: shopSlug }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error ?? "Não foi possível continuar.");
        return;
      }
      onAuthenticated(
        typeof body.whatsapp === "string" ? body.whatsapp : canonical
      );
    } catch {
      toast.error("Não foi possível continuar.");
    } finally {
      setSubmitting(false);
    }
  }

  if (checkingSession) {
    return (
      <div
        className={cn(
          "rounded-2xl bg-[#151618] px-4 py-5 ring-1 ring-white/8",
          className
        )}
      >
        <p className="text-sm text-muted-foreground">Verificando seu acesso...</p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-2xl bg-[#151618] px-4 py-4 ring-1 ring-white/8",
        className
      )}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={whatsappInputId} className="text-xs">
          {title}
        </Label>
        <Input
          id={whatsappInputId}
          inputMode="numeric"
          placeholder="(11) 99999-9999"
          value={whatsapp}
          onChange={(e) => setWhatsapp(formatWhatsapp(e.target.value))}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void continueWithWhatsapp();
            }
          }}
          autoComplete="tel"
          className="h-12 rounded-xl border-white/10 bg-[#0e0f11]"
        />
        <p className="text-xs leading-relaxed text-muted-foreground">{hint}</p>
      </div>
      <Button
        type="button"
        size="lg"
        disabled={submitting || whatsappLookupDelayMs(whatsapp) === null}
        onClick={() => void continueWithWhatsapp()}
        className="mt-4 h-12 w-full rounded-2xl font-semibold"
      >
        {submitting ? "Entrando..." : "Continuar"}
      </Button>
    </div>
  );
}

export async function logoutClientSession(): Promise<boolean> {
  try {
    const res = await fetch("/api/agenda/session", {
      method: "DELETE",
      credentials: "include",
    });
    return res.ok;
  } catch {
    return false;
  }
}
