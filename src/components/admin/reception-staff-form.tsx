"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { KeyRound, Trash2, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormSectionTitle } from "@/components/admin/form-section";
import { EmptyState } from "@/components/admin/empty-state";
import {
  createReceptionStaff,
  deleteReceptionStaff,
  resetReceptionPassword,
  type ReceptionStaffItem,
} from "@/app/admin/(panel)/configuracoes/reception-actions";
import { ADMIN_SURFACE } from "@/lib/admin-surface";
import { cn } from "@/lib/utils";

type ReceptionStaffFormProps = {
  initialStaff: ReceptionStaffItem[];
};

export function ReceptionStaffForm({ initialStaff }: ReceptionStaffFormProps) {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      const result = await createReceptionStaff({
        fullName,
        email,
        password,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Acesso de recepção criado.");
      setFullName("");
      setEmail("");
      setPassword("");
      router.refresh();
    } catch {
      toast.error("Não foi possível criar o acesso.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Remover este acesso de recepção?")) return;
    setBusyId(id);
    try {
      const result = await deleteReceptionStaff(id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Acesso removido.");
      router.refresh();
    } catch {
      toast.error("Não foi possível remover.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleResetPassword(id: string) {
    const next = window.prompt("Nova senha (mínimo 6 caracteres):");
    if (!next) return;
    setBusyId(id);
    try {
      const result = await resetReceptionPassword({
        profileId: id,
        password: next,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Senha atualizada.");
    } catch {
      toast.error("Não foi possível atualizar a senha.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <form
        data-tour="tour-settings-reception"
        onSubmit={handleCreate}
        className={cn(ADMIN_SURFACE.panel, "flex flex-col gap-5 p-4 sm:p-5")}
      >
        <FormSectionTitle
          tone="dark"
          icon={UserRound}
          title="Novo acesso de recepção"
          description="Vê a agenda de todos, marca e edita horários, cadastra clientes e prepara comandas (sem finalizar). Não acessa comissões, financeiro, produtos, profissionais nem configurações — e não mexe em crédito."
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="reception-name" className="text-[#f5f5f5]">
              Nome
            </Label>
            <Input
              id="reception-name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              className="border-white/10 bg-[#121316] text-[#f5f5f5]"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="reception-email" className="text-[#f5f5f5]">
              E-mail de login
            </Label>
            <Input
              id="reception-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="border-white/10 bg-[#121316] text-[#f5f5f5]"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="reception-password" className="text-[#f5f5f5]">
              Senha inicial
            </Label>
            <Input
              id="reception-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="border-white/10 bg-[#121316] text-[#f5f5f5]"
            />
          </div>
        </div>

        <div className="flex justify-end">
          <Button type="submit" disabled={saving}>
            {saving ? "Criando…" : "Criar acesso"}
          </Button>
        </div>
      </form>

      <div className={cn(ADMIN_SURFACE.panel, "p-4 sm:p-5")}>
        <FormSectionTitle
          tone="dark"
          icon={UserRound}
          title="Quem tem acesso de recepção"
          description="Logins ativos no painel."
        />

        {initialStaff.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              icon={UserRound}
              title="Nenhuma recepção cadastrada"
              description="Crie o primeiro acesso no formulário acima."
              className="border-white/10 bg-transparent"
            />
          </div>
        ) : (
          <ul className="mt-4 flex flex-col gap-2">
            {initialStaff.map((row) => (
              <li
                key={row.id}
                className="flex flex-col gap-3 rounded-xl border border-white/10 bg-[#121316] px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-[#f5f5f5]">
                    {row.fullName}
                  </p>
                  <p className={cn("truncate text-sm", ADMIN_SURFACE.muted)}>
                    {row.email ?? "Sem e-mail"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={busyId === row.id}
                    onClick={() => void handleResetPassword(row.id)}
                    className="border-white/15"
                  >
                    <KeyRound className="size-3.5" />
                    Nova senha
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={busyId === row.id}
                    onClick={() => void handleDelete(row.id)}
                    className="border-red-500/30 text-red-300 hover:bg-red-500/10"
                  >
                    <Trash2 className="size-3.5" />
                    Remover
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
