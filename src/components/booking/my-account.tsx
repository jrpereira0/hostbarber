"use client";

import { useCallback, useRef, useState } from "react";
import Image from "next/image";
import { toast } from "sonner";
import { Calendar, Phone, UserRound, Wallet } from "lucide-react";
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
  ClientWhatsappAuth,
  logoutClientSession,
} from "@/components/booking/client-whatsapp-auth";
import { PhotoField } from "@/components/admin/photo-field";
import { formatPriceBRL, formatWhatsapp } from "@/lib/format";
import { withShopQuery } from "@/lib/booking-path";
import {
  DEFAULT_PHOTO_POSITION,
  normalizePhotoPosition,
} from "@/lib/photo-position";

type Phase = "auth" | "profile";

export function MyAccount({ shopSlug }: { shopSlug: string }) {

  const [phase, setPhase] = useState<Phase>("auth");
  const [whatsapp, setWhatsapp] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [creditCents, setCreditCents] = useState(0);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoPosition, setPhotoPosition] = useState(DEFAULT_PHOTO_POSITION);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [hasProfile, setHasProfile] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const resetPhotoDraft = useCallback((url: string | null, position: string) => {
    setPhotoUrl(url);
    setPhotoPreview(url);
    setPhotoPosition(normalizePhotoPosition(position));
  }, []);

  const loadProfile = useCallback(
    async (wa: string) => {
      setLoading(true);
      setWhatsapp(wa);
      try {
        const res = await fetch(withShopQuery("/api/v1/customers/me", shopSlug), {
          credentials: "include",
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          toast.error(body.error ?? "Não foi possível carregar sua conta.");
          setFirstName("");
          setLastName("");
          setCreditCents(0);
          resetPhotoDraft(null, DEFAULT_PHOTO_POSITION);
          setHasProfile(false);
          setEditing(false);
          setPhase("profile");
          return;
        }
        if (body.found && body.customer) {
          setFirstName(body.customer.firstName?.trim() ?? "");
          setLastName(body.customer.lastName?.trim() ?? "");
          setCreditCents(
            typeof body.customer.creditBalanceCents === "number"
              ? body.customer.creditBalanceCents
              : 0
          );
          resetPhotoDraft(
            typeof body.customer.photoUrl === "string"
              ? body.customer.photoUrl
              : null,
            typeof body.customer.photoPosition === "string"
              ? body.customer.photoPosition
              : DEFAULT_PHOTO_POSITION
          );
          setHasProfile(true);
        } else {
          setFirstName("");
          setLastName("");
          setCreditCents(0);
          resetPhotoDraft(null, DEFAULT_PHOTO_POSITION);
          setHasProfile(false);
        }
        setEditing(false);
        setPhase("profile");
      } catch {
        toast.error("Não foi possível carregar sua conta.");
        setPhase("profile");
      } finally {
        setLoading(false);
      }
    },
    [resetPhotoDraft, shopSlug]
  );

  const handleAuthenticated = useCallback(
    (wa: string) => {
      void loadProfile(wa);
    },
    [loadProfile]
  );

  async function handleSave() {
    const nome = firstName.trim();
    const sobrenome = lastName.trim();
    if (!nome || !sobrenome) {
      toast.error("Preencha nome e sobrenome.");
      return;
    }

    setSaving(true);
    try {
      const formData = new FormData();
      formData.set("firstName", nome);
      formData.set("lastName", sobrenome);
      formData.set("photoPosition", photoPosition);

      const photoInput = formRef.current?.querySelector(
        'input[name="photo"]'
      ) as HTMLInputElement | null;
      const file = photoInput?.files?.[0];
      if (file && file.size > 0) {
        formData.set("photo", file);
      }

      const res = await fetch(withShopQuery("/api/v1/customers/me", shopSlug), {
        method: "PATCH",
        credentials: "include",
        body: formData,
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error ?? "Não foi possível salvar.");
        return;
      }
      setFirstName(body.customer?.firstName ?? nome);
      setLastName(body.customer?.lastName ?? sobrenome);
      if (typeof body.customer?.creditBalanceCents === "number") {
        setCreditCents(body.customer.creditBalanceCents);
      }
      resetPhotoDraft(
        typeof body.customer?.photoUrl === "string"
          ? body.customer.photoUrl
          : photoUrl,
        typeof body.customer?.photoPosition === "string"
          ? body.customer.photoPosition
          : photoPosition
      );
      setHasProfile(true);
      setEditing(false);
      toast.success("Dados salvos com sucesso.");
    } catch {
      toast.error("Não foi possível salvar.");
    } finally {
      setSaving(false);
    }
  }

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await logoutClientSession();
      setLogoutOpen(false);
      setPhase("auth");
      setWhatsapp("");
      setFirstName("");
      setLastName("");
      setCreditCents(0);
      resetPhotoDraft(null, DEFAULT_PHOTO_POSITION);
      setHasProfile(false);
      setEditing(false);
    } finally {
      setLoggingOut(false);
    }
  }

  if (phase === "auth") {
    return (
      <div className="flex min-h-0 flex-1 flex-col px-5 pt-6">
        <h2 className="booking-display text-[1.75rem] font-medium leading-tight tracking-tight">
          Conta
        </h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Confirme o WhatsApp pra ver crédito e seus dados.
        </p>

        <div className="mt-8">
          <ClientWhatsappAuth
        shopSlug={shopSlug}
            onAuthenticated={handleAuthenticated}
            hint="Informe seu WhatsApp pra acessar sua conta neste aparelho."
          />
        </div>
      </div>
    );
  }

  const displayName =
    firstName || lastName ? `${firstName} ${lastName}`.trim() : "Cliente";
  const avatarSrc = photoPreview ?? photoUrl;

  return (
    <div className="flex min-h-0 flex-1 flex-col px-5 pt-5 pb-8">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-start gap-3 pr-3">
          <div className="relative size-14 shrink-0 overflow-hidden rounded-full border border-white/10 bg-[#151618]">
            {avatarSrc ? (
              <Image
                src={avatarSrc}
                alt={displayName}
                fill
                className="object-cover"
                style={{ objectPosition: photoPosition }}
                sizes="56px"
                unoptimized
              />
            ) : (
              <div className="flex size-full items-center justify-center">
                <UserRound
                  className="size-6 text-muted-foreground"
                  strokeWidth={1.75}
                />
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="booking-display text-[1.75rem] font-medium leading-tight tracking-tight">
              Conta
            </h2>
            <p className="mt-1 truncate text-base font-semibold text-[#f5f5f5]">
              {displayName}
            </p>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
              <Phone className="size-3.5 shrink-0" strokeWidth={1.75} />
              <span className="tabular-nums">{formatWhatsapp(whatsapp)}</span>
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setLogoutOpen(true)}
          className="shrink-0 rounded-[10px] bg-white/[0.06] px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-white/[0.1] hover:text-[#f5f5f5]"
        >
          Sair
        </button>
      </div>

      {loading ? (
        <p className="mt-10 text-sm text-muted-foreground">Carregando…</p>
      ) : (
        <>
          <div className="rounded-[18px] bg-[#ecf15e] p-[18px]">
            <div className="flex items-center gap-2.5">
              <div className="flex size-9 items-center justify-center rounded-full bg-[#0e0f11]/20">
                <Wallet className="size-5 text-[#0e0f11]" strokeWidth={1.75} />
              </div>
              <p className="text-sm font-semibold text-[#0e0f11]/85">
                Crédito na loja
              </p>
            </div>
            <p className="mt-3 text-[2rem] font-bold tabular-nums leading-none text-[#0e0f11]">
              {formatPriceBRL(creditCents)}
            </p>
            <p className="mt-2 text-xs leading-relaxed text-[#0e0f11]/72">
              Disponível pra usar na barbearia. O saldo é atualizado no
              atendimento.
            </p>
          </div>

          <div className="mt-6 mb-2.5 flex items-center justify-between gap-3">
            <h3 className="text-base font-semibold text-[#f5f5f5]">
              Dados pessoais
            </h3>
            {!editing ? (
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="text-sm font-medium text-[#ecf15e] transition-opacity hover:opacity-80"
              >
                Editar
              </button>
            ) : null}
          </div>

          <div className="rounded-[18px] border border-white/[0.08] bg-[#151618] p-4">
            {editing ? (
              <form
                ref={formRef}
                className="space-y-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  void handleSave();
                }}
              >
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {hasProfile
                    ? "Altere foto, nome e sobrenome. O WhatsApp não muda."
                    : "Complete seu cadastro com nome e sobrenome. Foto é opcional."}
                </p>

                <PhotoField
                  preview={photoPreview}
                  position={photoPosition}
                  onPreviewChange={setPhotoPreview}
                  onPositionChange={setPhotoPosition}
                  shape="circle"
                  tone="dark"
                  hint="Opcional. Recorte e arraste pra enquadrar o rosto."
                />

                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="account-first-name">Nome</Label>
                    <Input
                      id="account-first-name"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      autoComplete="given-name"
                      className="h-11 rounded-xl border-white/10 bg-[#0e0f11]"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="account-last-name">
                      Sobrenome
                    </Label>
                    <Input
                      id="account-last-name"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      autoComplete="family-name"
                      className="h-11 rounded-xl border-white/10 bg-[#0e0f11]"
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-11 flex-1 rounded-2xl"
                    disabled={saving}
                    onClick={() => {
                      setEditing(false);
                      void loadProfile(whatsapp);
                    }}
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="submit"
                    className="h-11 flex-1 rounded-2xl font-semibold"
                    disabled={saving}
                  >
                    {saving ? "Salvando…" : "Salvar"}
                  </Button>
                </div>
              </form>
            ) : (
              <>
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                    Nome
                  </p>
                  <p className="mt-1 text-base font-semibold text-[#f5f5f5]">
                    {hasProfile ? displayName : "Ainda não cadastrado"}
                  </p>
                </div>
                <div className="my-3.5 h-px bg-white/[0.08]" />
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                    WhatsApp
                  </p>
                  <p className="mt-1 text-base font-semibold tabular-nums text-[#f5f5f5]">
                    {formatWhatsapp(whatsapp)}
                  </p>
                </div>
                {!photoUrl ? (
                  <>
                    <div className="my-3.5 h-px bg-white/[0.08]" />
                    <p className="text-sm text-muted-foreground">
                      Sem foto ainda. Toque em Editar pra adicionar.
                    </p>
                  </>
                ) : null}
              </>
            )}
          </div>

          <div className="mt-5 flex items-start gap-2.5 rounded-xl bg-white/[0.06] p-3.5">
            <Calendar
              className="mt-0.5 size-[18px] shrink-0 text-muted-foreground"
              strokeWidth={1.75}
            />
            <p className="text-sm leading-relaxed text-muted-foreground">
              Pra remarcar, cancelar ou ver o histórico, use a aba{" "}
              <button
                type="button"
                className="font-semibold text-[#f5f5f5] underline-offset-2 hover:underline"
                onClick={() => {
                  window.location.hash = "meus-agendamentos";
                }}
              >
                Horários
              </button>
              .
            </p>
          </div>
        </>
      )}

      <Dialog open={logoutOpen} onOpenChange={setLogoutOpen}>
        <DialogContent className="booking-dialog gap-0 overflow-hidden p-0 sm:max-w-md">
          <DialogHeader className="space-y-2 border-b px-6 py-6 pr-12 text-left">
            <DialogTitle className="text-lg font-semibold">
              Sair da conta?
            </DialogTitle>
            <DialogDescription className="mt-2 text-sm leading-relaxed">
              Você vai precisar confirmar o WhatsApp de novo pra ver horários e
              dados.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-row gap-2 px-6 py-5 sm:justify-stretch">
            <Button
              type="button"
              variant="secondary"
              className="h-11 flex-1 rounded-2xl"
              disabled={loggingOut}
              onClick={() => setLogoutOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="h-11 flex-1 rounded-2xl font-semibold"
              disabled={loggingOut}
              onClick={() => void handleLogout()}
            >
              {loggingOut ? "Saindo…" : "Sim, sair"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
