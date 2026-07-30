import { isSupabaseConfigured } from "@/lib/supabase/env";
import { AdminLoginScreen } from "@/components/admin/admin-login-screen";
import { SYSTEM_NAME } from "@/lib/brand";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Login",
  description: `Acesse o painel do ${SYSTEM_NAME}.`,
};

const ERROR_MESSAGES: Record<string, string> = {
  credenciais: "E-mail ou senha não conferem. Confira e tente de novo.",
  campos: "Preencha e-mail e senha para entrar.",
  perfil:
    "Este login não tem acesso ao painel. Fale com o dono da barbearia.",
  inativa:
    "Esta barbearia está desativada. O painel e a agenda pública ficam bloqueados até a plataforma reativar.",
  config:
    "O painel ainda não está ligado ao banco. Cadastre as variáveis do Supabase e reinicie o app.",
};

type PageProps = {
  searchParams: Promise<{ erro?: string }>;
};

export default async function LoginAdminPage({ searchParams }: PageProps) {
  const configured = isSupabaseConfigured();
  const { erro } = await searchParams;
  const errorMessage = erro ? ERROR_MESSAGES[erro] : undefined;

  return (
    <AdminLoginScreen configured={configured} errorMessage={errorMessage} />
  );
}
