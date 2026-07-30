import type { SupabaseClient } from "@supabase/supabase-js";

export type ProductSalesLine = {
  productId: string;
  productName: string;
  categoryName: string;
  quantitySold: number;
  revenueCents: number;
  commissionCents: number;
  saleCount: number;
};

export type ProductSalesByProfessional = {
  professionalId: string | null;
  professionalNickname: string;
  quantitySold: number;
  revenueCents: number;
  commissionCents: number;
};

export type ProductSalesDay = {
  date: string;
  quantitySold: number;
  revenueCents: number;
};

export type ProductSalesReport = {
  from: string;
  to: string;
  totalQuantity: number;
  totalRevenueCents: number;
  totalCommissionCents: number;
  saleLineCount: number;
  byProduct: ProductSalesLine[];
  byProfessional: ProductSalesByProfessional[];
  byDay: ProductSalesDay[];
};

function firstOrSelf<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export async function getProductSalesReport(
  admin: SupabaseClient,
  shopId: string,
  from: string,
  to: string
): Promise<ProductSalesReport> {
  const { data } = await admin
    .from("comanda_items")
    .select(
      `
      id,
      product_id,
      service_name,
      quantity,
      charged_price_cents,
      commission_percent_snapshot,
      professional_id,
      is_tip,
      professionals ( nickname ),
      products (
        id,
        name,
        product_categories ( name )
      ),
      comandas!inner (
        id,
        status,
        service_date,
        shop_id
      )
    `
    )
    .eq("comandas.status", "closed")
    .eq("comandas.shop_id", shopId)
    .not("product_id", "is", null)
    .gte("comandas.service_date", from)
    .lte("comandas.service_date", to);

  const byProduct = new Map<string, ProductSalesLine>();
  const byProfessional = new Map<string, ProductSalesByProfessional>();
  const byDay = new Map<string, ProductSalesDay>();

  let totalQuantity = 0;
  let totalRevenueCents = 0;
  let totalCommissionCents = 0;
  let saleLineCount = 0;

  for (const row of data ?? []) {
    if (row.is_tip || !row.product_id) continue;

    const comanda = firstOrSelf(
      row.comandas as
        | { id: string; status: string; service_date: string }
        | { id: string; status: string; service_date: string }[]
        | null
    );
    if (!comanda) continue;

    const product = firstOrSelf(
      row.products as
        | {
            id: string;
            name: string;
            product_categories:
              | { name: string }
              | { name: string }[]
              | null;
          }
        | {
            id: string;
            name: string;
            product_categories:
              | { name: string }
              | { name: string }[]
              | null;
          }[]
        | null
    );
    const category = firstOrSelf(product?.product_categories ?? null);
    const pro = firstOrSelf(
      row.professionals as
        | { nickname: string }
        | { nickname: string }[]
        | null
    );

    const quantity = Math.max(1, row.quantity ?? 1);
    const revenue = row.charged_price_cents ?? 0;
    const commissionPercent = row.commission_percent_snapshot ?? 0;
    const commission = Math.round((revenue * commissionPercent) / 100);
    const serviceDate = comanda.service_date as string;
    const productId = row.product_id as string;
    const productName = product?.name ?? row.service_name ?? "Produto";
    const categoryName = category?.name ?? "—";

    totalQuantity += quantity;
    totalRevenueCents += revenue;
    totalCommissionCents += commission;
    saleLineCount += 1;

    const productRow = byProduct.get(productId) ?? {
      productId,
      productName,
      categoryName,
      quantitySold: 0,
      revenueCents: 0,
      commissionCents: 0,
      saleCount: 0,
    };
    productRow.quantitySold += quantity;
    productRow.revenueCents += revenue;
    productRow.commissionCents += commission;
    productRow.saleCount += 1;
    byProduct.set(productId, productRow);

    const proKey = row.professional_id ?? "__none__";
    const proRow = byProfessional.get(proKey) ?? {
      professionalId: row.professional_id ?? null,
      professionalNickname: pro?.nickname ?? "Sem profissional",
      quantitySold: 0,
      revenueCents: 0,
      commissionCents: 0,
    };
    proRow.quantitySold += quantity;
    proRow.revenueCents += revenue;
    proRow.commissionCents += commission;
    byProfessional.set(proKey, proRow);

    const dayRow = byDay.get(serviceDate) ?? {
      date: serviceDate,
      quantitySold: 0,
      revenueCents: 0,
    };
    dayRow.quantitySold += quantity;
    dayRow.revenueCents += revenue;
    byDay.set(serviceDate, dayRow);
  }

  return {
    from,
    to,
    totalQuantity,
    totalRevenueCents,
    totalCommissionCents,
    saleLineCount,
    byProduct: [...byProduct.values()].sort(
      (a, b) => b.revenueCents - a.revenueCents || b.quantitySold - a.quantitySold
    ),
    byProfessional: [...byProfessional.values()].sort(
      (a, b) => b.revenueCents - a.revenueCents
    ),
    byDay: [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date)),
  };
}
