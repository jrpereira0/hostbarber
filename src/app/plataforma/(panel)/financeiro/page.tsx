import { PageHeader } from "@/components/admin/page-header";
import { PlatformBillingView } from "@/components/platform/platform-billing-view";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  mapPlatformShop,
  type PlatformShopRow,
} from "@/lib/shops/types";
import {
  computeShopBillingStatus,
  monthKey,
  sumPaymentsByShopMonth,
  type BillingShopRow,
  type PlatformPaymentRow,
} from "@/lib/platform-billing";
import { ADMIN_SURFACE } from "@/lib/admin-surface";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Financeiro" };

export type { BillingShopRow, PlatformPaymentRow };

export default async function PlatformFinanceiroPage() {
  const admin = createAdminClient();
  if (!admin) {
    return (
      <div className={cn("flex flex-col gap-4", ADMIN_SURFACE.page)}>
        <PageHeader
          tone="dark"
          title="Financeiro"
          description="Não foi possível conectar ao banco."
        />
      </div>
    );
  }

  const [{ data: shopRows }, { data: paymentRows }] = await Promise.all([
    admin
      .from("shops")
      .select(
        "id, name, slug, owner_email, owner_whatsapp, owner_user_id, phone, cep, street, address_number, address_complement, neighborhood, city, state, instagram, facebook, website, bio, logo_url, active, created_at, monthly_fee_cents, billing_due_day"
      )
      .order("name"),
    admin
      .from("platform_payments")
      .select(
        "id, shop_id, amount_cents, reference_month, paid_at, note, created_at, shops(name)"
      )
      .order("paid_at", { ascending: false })
      .order("created_at", { ascending: false }),
  ]);

  const shops = (shopRows ?? []).map((row) =>
    mapPlatformShop(row as PlatformShopRow)
  );

  const payments: PlatformPaymentRow[] = (paymentRows ?? []).map((row) => {
    const shopRel = row.shops as
      | { name: string }
      | { name: string }[]
      | null;
    const shopName = Array.isArray(shopRel)
      ? (shopRel[0]?.name ?? "—")
      : (shopRel?.name ?? "—");
    return {
      id: row.id,
      shopId: row.shop_id,
      shopName,
      amountCents: row.amount_cents,
      referenceMonth: String(row.reference_month).slice(0, 10),
      paidAt: String(row.paid_at).slice(0, 10),
      note: row.note,
      createdAt: row.created_at,
    };
  });

  const paymentsByShop = sumPaymentsByShopMonth(
    payments.map((p) => ({
      shopId: p.shopId,
      referenceMonth: p.referenceMonth,
      amountCents: p.amountCents,
    }))
  );

  const lastPaymentByShop = new Map<
    string,
    { paidAt: string; amountCents: number }
  >();
  for (const payment of payments) {
    if (!lastPaymentByShop.has(payment.shopId)) {
      lastPaymentByShop.set(payment.shopId, {
        paidAt: payment.paidAt,
        amountCents: payment.amountCents,
      });
    }
  }

  const today = new Date();
  const currentMonth = monthKey(today);

  const billingShops: BillingShopRow[] = shops.map((shop) => {
    const byMonth = paymentsByShop.get(shop.id) ?? new Map();
    const status = computeShopBillingStatus(
      {
        id: shop.id,
        monthlyFeeCents: shop.monthlyFeeCents,
        billingDueDay: shop.billingDueDay,
        createdAt: shop.createdAt,
      },
      byMonth,
      today
    );
    const last = lastPaymentByShop.get(shop.id);
    return {
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
  });

  const configured = billingShops.filter(
    (s) => s.status.kind !== "unconfigured"
  );
  const receivedThisMonth = payments
    .filter((p) => p.referenceMonth === currentMonth)
    .reduce((sum, p) => sum + p.amountCents, 0);
  const expectedThisMonth = configured.reduce(
    (sum, s) => sum + (s.monthlyFeeCents ?? 0),
    0
  );
  const paidCount = configured.filter((s) => s.status.kind === "paid").length;
  const overdueCount = configured.filter(
    (s) => s.status.kind === "overdue"
  ).length;

  return (
    <div className="flex w-full flex-col gap-6">
      <PageHeader
        tone="dark"
        title="Financeiro"
        description="Mensalidades dos clientes: quem está em dia, o que entrou e o que falta receber."
      />
      <PlatformBillingView
        shops={billingShops}
        payments={payments}
        summary={{
          receivedThisMonthCents: receivedThisMonth,
          expectedThisMonthCents: expectedThisMonth,
          paidCount,
          overdueCount,
          configuredCount: configured.length,
          totalShops: billingShops.length,
        }}
      />
    </div>
  );
}
