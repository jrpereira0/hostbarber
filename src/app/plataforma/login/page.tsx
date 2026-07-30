import type { Metadata } from "next";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { PlatformLoginScreen } from "@/components/platform/platform-login-screen";
import { SYSTEM_NAME } from "@/lib/brand";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Login — Plataforma",
  description: `Acesse o painel da plataforma ${SYSTEM_NAME}.`,
  robots: { index: false, follow: false },
};

const ERROR_MESSAGES: Record<string, string> = {
  credenciais: "E-mail ou senha não conferem. Confira e tente de novo.",
  campos: "Preencha e-mail e senha para entrar.",
  perfil:
    "Este login não tem acesso à plataforma. Use a conta de superadmin.",
  config:
    "O painel ainda não está ligado ao banco. Cadastre as variáveis do Supabase e reinicie o app.",
};

type PageProps = {
  searchParams: Promise<{ erro?: string }>;
};

export default async function PlatformLoginPage({ searchParams }: PageProps) {
  const configured = isSupabaseConfigured();
  const { erro } = await searchParams;
  const errorMessage = erro ? ERROR_MESSAGES[erro] : undefined;

  return (
    <PlatformLoginScreen configured={configured} errorMessage={errorMessage} />
  );
}
