import { notFound } from "next/navigation";
import { PageHeader } from "@/components/admin/page-header";
import { PlatformShopBillingDetail } from "@/components/platform/platform-shop-billing-detail";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  mapPlatformShop,
  type PlatformShopRow,
} from "@/lib/shops/types";
import {
  computeShopBillingStatus,
  normalizePaymentKind,
  sumPaymentsByShopMonth,
  type BillingShopRow,
  type PlatformPaymentRow,
} from "@/lib/platform-billing";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ shopId: string }>;
};

export async function generateMetadata({ params }: PageProps) {
  const { shopId } = await params;
  const admin = createAdminClient();
  if (!admin) return { title: "Cobrança" };
  const { data } = await admin
    .from("shops")
    .select("name")
    .eq("id", shopId)
    .maybeSingle();
  return { title: data?.name ? `Cobrança — ${data.name}` : "Cobrança" };
}

export default async function PlatformShopBillingPage({ params }: PageProps) {
  const { shopId } = await params;
  const admin = createAdminClient();
  if (!admin) notFound();

  const [{ data: shopRow }, { data: paymentRows }] = await Promise.all([
    admin
      .from("shops")
      .select(
        "id, name, slug, owner_email, owner_whatsapp, owner_user_id, phone, cep, street, address_number, address_complement, neighborhood, city, state, instagram, facebook, website, bio, logo_url, active, created_at, monthly_fee_cents, billing_due_day"
      )
      .eq("id", shopId)
      .maybeSingle(),
    admin
      .from("platform_payments")
      .select(
        "id, shop_id, amount_cents, reference_month, paid_at, note, kind, created_at"
      )
      .eq("shop_id", shopId)
      .order("paid_at", { ascending: false })
      .order("created_at", { ascending: false }),
  ]);

  if (!shopRow) notFound();

  const shop = mapPlatformShop(shopRow as PlatformShopRow);

  const payments: PlatformPaymentRow[] = (paymentRows ?? []).map((row) => ({
    id: row.id,
    shopId: row.shop_id,
    shopName: shop.name,
    amountCents: row.amount_cents,
    referenceMonth: String(row.reference_month).slice(0, 10),
    paidAt: String(row.paid_at).slice(0, 10),
    note: row.note,
    kind: normalizePaymentKind(row.kind),
    createdAt: row.created_at,
  }));

  const byMonth =
    sumPaymentsByShopMonth(
      payments.map((p) => ({
        shopId: p.shopId,
        referenceMonth: p.referenceMonth,
        amountCents: p.amountCents,
      }))
    ).get(shop.id) ?? new Map();

  const status = computeShopBillingStatus(
    {
      id: shop.id,
      monthlyFeeCents: shop.monthlyFeeCents,
      billingDueDay: shop.billingDueDay,
      createdAt: shop.createdAt,
    },
    byMonth
  );

  const last = payments[0] ?? null;

  const billingShop: BillingShopRow = {
    id: shop.id,
    name: shop.name,
    slug: shop.slug,
    active: shop.active,
    city: shop.city,
    state: shop.state,
    ownerEmail: shop.ownerEmail,
    ownerWhatsapp: shop.ownerWhatsapp,
    monthlyFeeCents: shop.monthlyFeeCents,
    billingDueDay: shop.billingDueDay,
    createdAt: shop.createdAt,
    status,
    lastPaymentAt: last?.paidAt ?? null,
    lastPaymentCents: last?.amountCents ?? null,
  };

  const totalReceivedCents = payments
    .filter((p) => p.kind === "payment")
    .reduce((sum, p) => sum + p.amountCents, 0);

  return (
    <div className="flex w-full flex-col gap-6">
      <PageHeader
        tone="dark"
        title={shop.name}
        description="Cobrança da mensalidade deste cliente na plataforma."
        backHref="/plataforma/financeiro"
      />
      <PlatformShopBillingDetail
        shop={billingShop}
        payments={payments}
        totalReceivedCents={totalReceivedCents}
      />
    </div>
  );
}
