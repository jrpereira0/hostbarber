import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/require-admin";
import { LOGIN_PATH } from "@/lib/login-path";

export const dynamic = "force-dynamic";

export const metadata = { title: "Primeiros passos" };

/** Mantém a URL antiga; o guia vive nas telas reais do painel. */
export default async function PrimeirosPassosPage() {
  const session = await getAdminSession();
  if (!session) redirect(LOGIN_PATH);
  if (!session.isOwner) redirect("/admin");
  redirect("/admin?guia=1");
}
