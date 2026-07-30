import { redirect } from "next/navigation";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function LegacyEditarBarbeariaRedirect({
  params,
}: PageProps) {
  const { id } = await params;
  redirect(`/plataforma/clientes/${id}`);
}
