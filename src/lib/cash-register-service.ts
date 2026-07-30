import type { SupabaseClient } from "@supabase/supabase-js";
import { getCashRegisterSummary, countOpenComandasWithItems } from "@/lib/finance-reports";
import { formatDateBR } from "@/lib/format";

export type CashRegisterSessionStatus = "open" | "closed";

export type CashRegisterSession = {
  id: string;
  serviceDate: string;
  status: CashRegisterSessionStatus;
  openingBalanceCents: number;
  responsibleName: string | null;
  openedAt: string | null;
  closedAt: string | null;
  openedByName: string | null;
  closedByName: string | null;
  /** Valor dos serviços fechados neste caixa (base das comissões). */
  totalCents: number;
  /** Dinheiro que entrou no caixa (pagamentos + depósitos de crédito). */
  cashInflowCents: number;
  creditDepositsCents: number;
  comandaCount: number;
};

type DbSessionRow = {
  id: string;
  service_date: string;
  status: CashRegisterSessionStatus;
  opening_balance_cents: number;
  responsible_name: string | null;
  opened_at: string | null;
  closed_at: string | null;
  opened_by: string | null;
  closed_by: string | null;
};

async function loadProfileNames(
  admin: SupabaseClient,
  ids: string[]
): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return new Map();

  const { data } = await admin
    .from("profiles")
    .select("id, full_name")
    .in("id", unique);

  return new Map(
    (data ?? []).map((row) => [row.id, row.full_name?.trim() || "—"])
  );
}

async function enrichSessions(
  admin: SupabaseClient,
  shopId: string,
  rows: DbSessionRow[]
): Promise<CashRegisterSession[]> {
  const names = await loadProfileNames(
    admin,
    rows.flatMap((row) => [row.opened_by, row.closed_by].filter(Boolean) as string[])
  );

  return Promise.all(
    rows.map(async (row) => {
      const summary = await getCashRegisterSummary(admin, shopId, row.service_date, {
        cashRegisterSessionId: row.id,
      });
      return {
        id: row.id,
        serviceDate: row.service_date,
        status: row.status,
        openingBalanceCents: row.opening_balance_cents,
        responsibleName: row.responsible_name,
        openedAt: row.opened_at,
        closedAt: row.closed_at,
        openedByName: row.responsible_name
          ?? (row.opened_by ? names.get(row.opened_by) ?? null : null),
        closedByName: row.closed_by ? names.get(row.closed_by) ?? null : null,
        totalCents: summary.totalCents,
        cashInflowCents: summary.cashInflowCents,
        creditDepositsCents: summary.creditDepositsCents,
        comandaCount: summary.comandaCount,
      };
    })
  );
}

async function enrichSession(
  admin: SupabaseClient,
  shopId: string,
  row: DbSessionRow
): Promise<CashRegisterSession> {
  const [session] = await enrichSessions(admin, shopId, [row]);
  return session;
}

export async function getCashRegisterSession(
  admin: SupabaseClient,
  shopId: string,
  serviceDate: string
): Promise<CashRegisterSession | null> {
  const { data } = await admin
    .from("cash_register_sessions")
    .select(
      "id, service_date, status, opening_balance_cents, responsible_name, opened_at, closed_at, opened_by, closed_by"
    )
    .eq("shop_id", shopId)
    .eq("service_date", serviceDate)
    .maybeSingle();

  if (!data) return null;
  return enrichSession(admin, shopId, data as DbSessionRow);
}

export type OpenCashRegisterBasic = {
  id: string;
  serviceDate: string;
};

/** Caixa aberto sem totais do dia (rápido — só checagem de data). */
export async function getOpenCashRegisterSessionBasic(
  admin: SupabaseClient,
  shopId: string
): Promise<OpenCashRegisterBasic | null> {
  const { data } = await admin
    .from("cash_register_sessions")
    .select("id, service_date")
    .eq("shop_id", shopId)
    .eq("status", "open")
    .limit(1)
    .maybeSingle();

  if (!data) return null;
  return { id: data.id, serviceDate: data.service_date };
}

/** Retorna o único caixa aberto da loja, se existir. */
export async function getOpenCashRegisterSession(
  admin: SupabaseClient,
  shopId: string
): Promise<CashRegisterSession | null> {
  const { data } = await admin
    .from("cash_register_sessions")
    .select(
      "id, service_date, status, opening_balance_cents, responsible_name, opened_at, closed_at, opened_by, closed_by"
    )
    .eq("shop_id", shopId)
    .eq("status", "open")
    .limit(1)
    .maybeSingle();

  if (!data) return null;
  return enrichSession(admin, shopId, data as DbSessionRow);
}

async function assertNoOtherOpenCashRegister(
  admin: SupabaseClient,
  shopId: string,
  serviceDate: string
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const openElsewhere = await getOpenCashRegisterSession(admin, shopId);
  if (openElsewhere && openElsewhere.serviceDate !== serviceDate) {
    return {
      ok: false,
      error: `Já existe um caixa aberto (${formatDateBR(openElsewhere.serviceDate)}). Feche-o antes de abrir outro.`,
      status: 409,
    };
  }
  return { ok: true };
}

export async function listCashRegisterSessions(
  admin: SupabaseClient,
  shopId: string,
  from: string,
  to: string
): Promise<CashRegisterSession[]> {
  const { data } = await admin
    .from("cash_register_sessions")
    .select(
      "id, service_date, status, opening_balance_cents, responsible_name, opened_at, closed_at, opened_by, closed_by"
    )
    .eq("shop_id", shopId)
    .gte("service_date", from)
    .lte("service_date", to)
    .order("service_date", { ascending: false });

  const rows = (data ?? []) as DbSessionRow[];
  return enrichSessions(admin, shopId, rows);
}

function parseUserId(userId: string): string | null {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    userId
  )
    ? userId
    : null;
}

export type OpenCashRegisterInput = {
  responsibleName: string;
  openingBalanceCents: number;
};

export type ComandaCashRegisterCheck =
  | { ok: true; sessionId: string; serviceDate: string }
  | { ok: false; error: string; status: number };

/** Comanda só fecha se houver caixa aberto (da mesma loja) e for do mesmo dia do caixa. */
export async function assertComandaClosableInOpenCashRegister(
  admin: SupabaseClient,
  shopId: string,
  comandaServiceDate: string
): Promise<ComandaCashRegisterCheck> {
  const openSession = await getOpenCashRegisterSessionBasic(admin, shopId);

  if (!openSession) {
    return {
      ok: false,
      error: "Não há caixa aberto. Abra o caixa antes de fechar comandas.",
      status: 409,
    };
  }

  if (openSession.serviceDate !== comandaServiceDate) {
    return {
      ok: false,
      error: `O caixa aberto é do dia ${formatDateBR(openSession.serviceDate)}. Só é possível fechar comandas desse dia.`,
      status: 409,
    };
  }

  return {
    ok: true,
    sessionId: openSession.id,
    serviceDate: openSession.serviceDate,
  };
}

export async function canCloseComandaInOpenCashRegister(
  admin: SupabaseClient,
  shopId: string,
  comandaServiceDate: string,
  openSession?: OpenCashRegisterBasic | null
): Promise<boolean> {
  const session =
    openSession === undefined
      ? await getOpenCashRegisterSessionBasic(admin, shopId)
      : openSession;
  return session !== null && session.serviceDate === comandaServiceDate;
}

export async function openCashRegister(
  admin: SupabaseClient,
  shopId: string,
  serviceDate: string,
  userId: string,
  input: OpenCashRegisterInput
): Promise<
  { ok: true; session: CashRegisterSession } | { ok: false; error: string; status: number }
> {
  const responsibleName = input.responsibleName.trim();
  if (!responsibleName) {
    return {
      ok: false,
      error: "Informe quem está responsável pelo caixa.",
      status: 400,
    };
  }

  if (input.openingBalanceCents < 0) {
    return {
      ok: false,
      error: "O valor em dinheiro não pode ser negativo.",
      status: 400,
    };
  }

  const existing = await getCashRegisterSession(admin, shopId, serviceDate);
  const now = new Date().toISOString();
  const openedBy = parseUserId(userId);

  if (existing?.status === "open") {
    return { ok: false, error: "O caixa deste dia já está aberto.", status: 409 };
  }

  const noOtherOpen = await assertNoOtherOpenCashRegister(admin, shopId, serviceDate);
  if (!noOtherOpen.ok) return noOtherOpen;

  const payload = {
    status: "open" as const,
    opening_balance_cents: input.openingBalanceCents,
    responsible_name: responsibleName,
    opened_at: now,
    opened_by: openedBy,
    closed_at: null,
    closed_by: null,
    updated_at: now,
  };

  if (existing) {
    const { error } = await admin
      .from("cash_register_sessions")
      .update(payload)
      .eq("id", existing.id)
      .eq("shop_id", shopId);

    if (error) {
      return { ok: false, error: "Não foi possível abrir o caixa.", status: 500 };
    }
  } else {
    const { error } = await admin.from("cash_register_sessions").insert({
      shop_id: shopId,
      service_date: serviceDate,
      ...payload,
    });

    if (error) {
      return { ok: false, error: "Não foi possível abrir o caixa.", status: 500 };
    }
  }

  const session = await getCashRegisterSession(admin, shopId, serviceDate);
  if (!session) {
    return { ok: false, error: "Não foi possível abrir o caixa.", status: 500 };
  }

  return { ok: true, session };
}

export async function closeCashRegister(
  admin: SupabaseClient,
  shopId: string,
  serviceDate: string,
  userId: string
): Promise<
  { ok: true; session: CashRegisterSession } | { ok: false; error: string; status: number }
> {
  const existing = await getCashRegisterSession(admin, shopId, serviceDate);

  if (!existing || existing.status !== "open") {
    return {
      ok: false,
      error: "O caixa deste dia não está aberto.",
      status: 409,
    };
  }

  const openCount = await countOpenComandasWithItems(admin, shopId, serviceDate);
  if (openCount > 0) {
    return {
      ok: false,
      error:
        openCount === 1
          ? "Ainda tem 1 comanda aberta neste dia. Finalize ou exclua antes de encerrar o caixa."
          : `Ainda tem ${openCount} comandas abertas neste dia. Finalize ou exclua antes de encerrar o caixa.`,
      status: 409,
    };
  }

  const now = new Date().toISOString();
  const closedBy = parseUserId(userId);

  const { error } = await admin
    .from("cash_register_sessions")
    .update({
      status: "closed",
      closed_at: now,
      closed_by: closedBy,
      updated_at: now,
    })
    .eq("id", existing.id)
    .eq("shop_id", shopId);

  if (error) {
    return { ok: false, error: "Não foi possível fechar o caixa.", status: 500 };
  }

  const session = await getCashRegisterSession(admin, shopId, serviceDate);
  if (!session) {
    return { ok: false, error: "Não foi possível fechar o caixa.", status: 500 };
  }

  return { ok: true, session };
}

export async function reopenCashRegister(
  admin: SupabaseClient,
  shopId: string,
  serviceDate: string,
  userId: string,
  input: OpenCashRegisterInput
): Promise<
  { ok: true; session: CashRegisterSession } | { ok: false; error: string; status: number }
> {
  const existing = await getCashRegisterSession(admin, shopId, serviceDate);

  if (!existing) {
    return openCashRegister(admin, shopId, serviceDate, userId, input);
  }

  if (existing.status === "open") {
    return { ok: false, error: "O caixa deste dia já está aberto.", status: 409 };
  }

  return openCashRegister(admin, shopId, serviceDate, userId, input);
}
