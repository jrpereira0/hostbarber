"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { lookupCustomerByWhatsapp } from "@/lib/lookup-customer";
import { requireAdmin } from "@/lib/require-admin";
import { matchesCustomerSearch, capitalizePersonName } from "@/lib/text";
import {
  normalizeWhatsapp,
  WHATSAPP_INVALID_MESSAGE,
} from "@/lib/whatsapp";

export type AdminCustomerLookupResult =
  | { ok: true; found: true; firstName: string; lastName: string }
  | { ok: true; found: false }
  | { ok: false; error: string };

export type AdminCustomerMatch = {
  id: string;
  firstName: string;
  lastName: string;
  whatsapp: string;
};

export type AdminCustomerSearchResult =
  | { ok: true; customers: AdminCustomerMatch[] }
  | { ok: false; error: string };

export type CustomerAgendaSummaryResult =
  | {
      ok: true;
      customerId: string | null;
      creditBalanceCents: number;
    }
  | { ok: false; error: string };

/** Saldo de crédito + id do cliente para o modal da agenda. */
export async function getCustomerAgendaSummary(
  rawWhatsapp: string
): Promise<CustomerAgendaSummaryResult> {
  const session = await requireAdmin();
  if (!("userId" in session)) {
    return {
      ok: false,
      error: "error" in session ? session.error : "Faça login de novo.",
    };
  }

  const whatsapp = normalizeWhatsapp(rawWhatsapp);
  if (!whatsapp) {
    return { ok: true, customerId: null, creditBalanceCents: 0 };
  }

  const admin = createAdminClient();
  if (!admin) {
    return { ok: false, error: "Sistema indisponível no momento." };
  }

  const { data } = await admin
    .from("customers")
    .select("id, credit_balance_cents")
    .eq("shop_id", session.shopId)
    .eq("whatsapp", whatsapp)
    .maybeSingle();

  return {
    ok: true,
    customerId: data?.id ?? null,
    creditBalanceCents: data?.credit_balance_cents ?? 0,
  };
}

/** Busca cliente pelo WhatsApp completo no painel — sem limite da API pública. */
export async function lookupCustomerForAdmin(
  rawWhatsapp: string
): Promise<AdminCustomerLookupResult> {
  const session = await requireAdmin();
  if (!("userId" in session)) {
    return {
      ok: false,
      error: "error" in session ? session.error : "Faça login de novo.",
    };
  }

  const whatsapp = normalizeWhatsapp(rawWhatsapp);
  if (!whatsapp) {
    return { ok: false, error: WHATSAPP_INVALID_MESSAGE };
  }

  const result = await lookupCustomerByWhatsapp(whatsapp, session.shopId);
  if (!result.found) {
    return { ok: true, found: false };
  }

  return {
    ok: true,
    found: true,
    firstName: result.firstName,
    lastName: result.lastName,
  };
}

/**
 * Busca clientes por nome ou pedaço do WhatsApp (ex.: últimos 4 dígitos).
 * Usado no modal de agendamento para escolher entre opções.
 */
export async function searchCustomersForAdmin(
  rawQuery: string
): Promise<AdminCustomerSearchResult> {
  const session = await requireAdmin();
  if (!("userId" in session)) {
    return {
      ok: false,
      error: "error" in session ? session.error : "Faça login de novo.",
    };
  }

  const q = rawQuery.trim();
  if (q.length < 2) {
    return { ok: true, customers: [] };
  }

  const admin = createAdminClient();
  if (!admin) {
    return { ok: false, error: "Sistema indisponível no momento." };
  }

  const digits = q.replace(/\D/g, "");
  const hasLetters = /[a-zA-ZÀ-ÿ]/.test(q);
  const safeTerm = q.replace(/[%_,]/g, "").slice(0, 40);

  let rows: {
    id: string;
    first_name: string;
    last_name: string;
    whatsapp: string;
  }[] = [];

  if (!hasLetters && digits.length >= 2) {
    const { data, error } = await admin
      .from("customers")
      .select("id, first_name, last_name, whatsapp")
      .eq("shop_id", session.shopId)
      .like("whatsapp", `%${digits}`)
      .order("first_name")
      .limit(30);

    if (error) {
      return { ok: false, error: "Não foi possível buscar clientes." };
    }
    rows = data ?? [];
  } else {
    const filters = [
      `first_name.ilike.%${safeTerm}%`,
      `last_name.ilike.%${safeTerm}%`,
    ];
    if (digits.length >= 2) {
      filters.push(`whatsapp.like.%${digits}%`);
    }

    const { data, error } = await admin
      .from("customers")
      .select("id, first_name, last_name, whatsapp")
      .eq("shop_id", session.shopId)
      .or(filters.join(","))
      .order("first_name")
      .limit(40);

    if (error) {
      return { ok: false, error: "Não foi possível buscar clientes." };
    }
    rows = data ?? [];
  }

  const customers = rows
    .map((row) => ({
      id: row.id,
      firstName: capitalizePersonName(row.first_name),
      lastName: capitalizePersonName(row.last_name),
      whatsapp: row.whatsapp,
    }))
    .filter((customer) => matchesCustomerSearch(customer, q))
    .slice(0, 8);

  return { ok: true, customers };
}
