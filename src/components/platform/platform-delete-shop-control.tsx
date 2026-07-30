"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, Trash2 } from "lucide-react";
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
import { deleteShop } from "@/app/plataforma/(panel)/clientes/actions";
import { ADMIN_SURFACE } from "@/lib/admin-surface";
import { cn } from "@/lib/utils";

type PlatformDeleteShopControlProps = {
  shopId: string;
  shopName: string;
  /** Depois de excluir, pra onde voltar (padrão: /plataforma). */
  redirectTo?: string;
};

/**
 * Zona de perigo pra apagar o cliente por completo
 * (loja + dados + logins). Pede o nome pra confirmar.
 */
export function PlatformDeleteShopControl({
  shopId,
  shopName,
  redirectTo = "/plataforma",
}: PlatformDeleteShopControlProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmName, setConfirmName] = useState("");
  const [isPending, startTransition] = useTransition();

  const canDelete = confirmName.trim() === shopName;

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) setConfirmName("");
  }

  function submitDelete() {
    if (!canDelete) return;
    startTransition(async () => {
      const result = await deleteShop(shopId, confirmName);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Cliente excluído por completo.");
      setOpen(false);
      router.push(redirectTo);
      router.refresh();
    });
  }

  return (
    <>
      <section
        className={cn(
          "overflow-hidden rounded-2xl border border-[rgb(248_113_113_/_35%)] bg-[rgb(248_113_113_/_6%)]"
        )}
      >
        <div className="border-b border-[rgb(248_113_113_/_25%)] px-5 py-4">
          <div className="flex items-start gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-md border border-[rgb(248_113_113_/_35%)] bg-[rgb(248_113_113_/_12%)] text-[#f87171]">
              <AlertTriangle className="size-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-[#f5f5f5]">
                Zona de perigo
              </h2>
              <p className={cn("mt-1 text-sm", ADMIN_SURFACE.muted)}>
                Apaga a barbearia por completo: agenda, clientes, comandas,
                produtos, fotos e todos os logins (dono, barbeiros e recepção).
                Não dá pra desfazer.
              </p>
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className={cn("text-sm", ADMIN_SURFACE.muted)}>
            Prefira <span className="text-[#f5f5f5]">desativar</span> o cliente
            se for só pausar o acesso. Excluir é definitivo.
          </p>
          <Button
            type="button"
            variant="outline"
            onClick={() => setOpen(true)}
            className={cn(
              "w-full shrink-0 sm:w-auto",
              "!border-[rgb(248_113_113_/_45%)] !bg-transparent !text-[#f87171] hover:!bg-[rgb(248_113_113_/_12%)]"
            )}
          >
            <Trash2 className="size-4" />
            Excluir barbearia
          </Button>
        </div>
      </section>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="admin-popover border-white/10 bg-[#151618] text-[#f5f5f5] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Excluir “{shopName}”?</DialogTitle>
            <DialogDescription className={ADMIN_SURFACE.muted}>
              Isso apaga a loja de vez: agenda, clientes, comandas, produtos e
              logins. Digite o nome exato da loja pra confirmar.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-1">
            <Label htmlFor="delete-shop-confirm" className="text-[#f5f5f5]">
              Nome da loja
            </Label>
            <Input
              id="delete-shop-confirm"
              value={confirmName}
              onChange={(e) => setConfirmName(e.target.value)}
              placeholder={shopName}
              className={ADMIN_SURFACE.input}
              autoComplete="off"
              disabled={isPending}
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={() => handleOpenChange(false)}
              className={ADMIN_SURFACE.btnGhost}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={isPending || !canDelete}
              onClick={submitDelete}
              className="!border-transparent !bg-[#ef4444] !text-white hover:!bg-[#dc2626]"
            >
              {isPending ? "Excluindo…" : "Excluir definitivamente"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
