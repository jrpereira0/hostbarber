// Limpa histórico operacional da barbearia.
// Apaga: clientes, agendamentos, comandas, caixas, créditos, comissões/repasses.
// Mantém: login, profissionais, serviços, produtos, horários, preços e perfil da loja.
// Uso: npm run db:reset-shop
import { createClient } from "@supabase/supabase-js";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

async function deleteAllById(table) {
  const { data, error: fetchErr } = await admin.from(table).select("id");
  if (fetchErr) throw new Error(`${table}: ${fetchErr.message}`);
  if (!data?.length) return 0;

  // Apaga em lotes para evitar payload grande / limites do PostgREST.
  const ids = data.map((row) => row.id);
  const chunkSize = 200;
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    const { error } = await admin.from(table).delete().in("id", chunk);
    if (error) throw new Error(`${table}: ${error.message}`);
  }
  return ids.length;
}

async function deleteCompositeRows(table, columns) {
  const { data, error: fetchErr } = await admin
    .from(table)
    .select(columns.join(","));
  if (fetchErr) throw new Error(`${table}: ${fetchErr.message}`);
  if (!data?.length) return 0;

  for (const row of data) {
    let query = admin.from(table).delete();
    for (const column of columns) {
      query = query.eq(column, row[column]);
    }
    const { error } = await query;
    if (error) throw new Error(`${table}: ${error.message}`);
  }
  return data.length;
}

async function countRows(table) {
  const { count, error } = await admin
    .from(table)
    .select("id", { count: "exact", head: true });
  if (error) throw new Error(`${table} count: ${error.message}`);
  return count ?? 0;
}

async function main() {
  const summary = {};

  // Ordem respeita FKs (repasses → créditos → comandas → caixa → agenda → clientes).
  summary.commission_payout_items = await deleteAllById("commission_payout_items");
  summary.commission_payouts = await deleteAllById("commission_payouts");
  summary.customer_credit_transactions = await deleteAllById(
    "customer_credit_transactions"
  );
  summary.comanda_payments = await deleteAllById("comanda_payments");
  summary.comanda_items = await deleteAllById("comanda_items");
  summary.comanda_appointments = await deleteCompositeRows(
    "comanda_appointments",
    ["comanda_id", "appointment_id"]
  );
  summary.comandas = await deleteAllById("comandas");
  summary.cash_register_sessions = await deleteAllById("cash_register_sessions");
  summary.appointment_services = await deleteCompositeRows(
    "appointment_services",
    ["appointment_id", "service_id"]
  );
  summary.appointments = await deleteAllById("appointments");
  summary.schedule_blocks = await deleteAllById("schedule_blocks");
  summary.customers = await deleteAllById("customers");

  summary.professionals_kept = await countRows("professionals");
  summary.services_kept = await countRows("services");
  summary.products_kept = await countRows("products");
  summary.profiles_kept = await countRows("profiles");

  console.log("Limpeza concluída.");
  console.log("Apagado (histórico):");
  console.log(
    JSON.stringify(
      {
        commission_payout_items: summary.commission_payout_items,
        commission_payouts: summary.commission_payouts,
        customer_credit_transactions: summary.customer_credit_transactions,
        comanda_payments: summary.comanda_payments,
        comanda_items: summary.comanda_items,
        comanda_appointments: summary.comanda_appointments,
        comandas: summary.comandas,
        cash_register_sessions: summary.cash_register_sessions,
        appointment_services: summary.appointment_services,
        appointments: summary.appointments,
        schedule_blocks: summary.schedule_blocks,
        customers: summary.customers,
      },
      null,
      2
    )
  );
  console.log("Mantido (cadastro):");
  console.log(
    JSON.stringify(
      {
        professionals: summary.professionals_kept,
        services: summary.services_kept,
        products: summary.products_kept,
        profiles: summary.profiles_kept,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
