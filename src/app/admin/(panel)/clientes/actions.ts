"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdminClient } from "@/lib/supabase/admin";
import { isActionResult } from "@/lib/is-action-result";
import { requireOwnerSession, type ActionResult } from "@/lib/require-owner";
import {
  canManageCustomers,
  requireAdmin,
  type AdminSession,
} from "@/lib/require-admin";
import {
  normalizeWhatsapp,
  WHATSAPP_INVALID_MESSAGE,
  whatsappSchema,
} from "@/lib/whatsapp";
import { addCustomerCredit, deductCustomerCredit } from "@/lib/customer-credit-service";
import { formatPriceBRL } from "@/lib/format";
import { capitalizePersonName } from "@/lib/text";

async function requireCustomerManager(): Promise<
  ActionResult | AdminSession
> {
  const session = await requireAdmin();
  if (!("userId" in session)) return session;
  if (!canManageCustomers(session)) {
    return { ok: false, error: "Você não pode gerenciar clientes." };
  }
  return session;
}


const customerSchema = z.object({
  firstName: z.string().trim().min(1, "Informe o nome."),
  lastName: z.string().trim().min(1, "Informe o sobrenome."),
  whatsapp: whatsappSchema,
});

function parsedCustomerNames(data: { firstName: string; lastName: string }) {
  return {
    firstName: capitalizePersonName(data.firstName),
    lastName: capitalizePersonName(data.lastName),
  };
}

export async function createCustomer(formData: FormData): Promise<ActionResult> {
  const session = await requireCustomerManager();
  if (!("userId" in session)) return session;

  const whatsapp = normalizeWhatsapp(String(formData.get("whatsapp") ?? ""));
  if (!whatsapp) {
    return { ok: false, error: WHATSAPP_INVALID_MESSAGE };
  }

  const parsed = customerSchema.safeParse({
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    whatsapp,
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const admin = requireAdminClient();
  if (isActionResult(admin)) return admin;

  const { firstName, lastName } = parsedCustomerNames(parsed.data);

  const { error } = await admin.from("customers").insert({
    shop_id: session.shopId,
    first_name: firstName,
    last_name: lastName,
    whatsapp: parsed.data.whatsapp,
  });

  if (error) {
    if (error.code === "23505") {
      return {
        ok: false,
        error: "Já existe um cliente com esse WhatsApp.",
      };
    }
    return { ok: false, error: "Não foi possível cadastrar o cliente." };
  }

  revalidatePath("/admin/clientes");
  return { ok: true };
}

export async function updateCustomer(
  customerId: string,
  formData: FormData
): Promise<ActionResult> {
  const session = await requireCustomerManager();
  if (!("userId" in session)) return session;

  const whatsapp = normalizeWhatsapp(String(formData.get("whatsapp") ?? ""));
  if (!whatsapp) {
    return { ok: false, error: WHATSAPP_INVALID_MESSAGE };
  }

  const parsed = customerSchema.safeParse({
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    whatsapp,
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const admin = requireAdminClient();
  if (isActionResult(admin)) return admin;

  const { data: existing } = await admin
    .from("customers")
    .select("id")
    .eq("id", customerId)
    .eq("shop_id", session.shopId)
    .maybeSingle();

  if (!existing) {
    return { ok: false, error: "Cliente não encontrado." };
  }

  const { firstName, lastName } = parsedCustomerNames(parsed.data);

  const { error } = await admin
    .from("customers")
    .update({
      first_name: firstName,
      last_name: lastName,
      whatsapp: parsed.data.whatsapp,
      updated_at: new Date().toISOString(),
    })
    .eq("id", customerId)
    .eq("shop_id", session.shopId);

  if (error) {
    if (error.code === "23505") {
      return {
        ok: false,
        error: "Já existe outro cliente com esse WhatsApp.",
      };
    }
    return { ok: false, error: "Não foi possível salvar as alterações." };
  }

  await admin
    .from("appointments")
    .update({
      customer_first_name: firstName,
      customer_last_name: lastName,
      customer_whatsapp: parsed.data.whatsapp,
    })
    .eq("customer_id", customerId)
    .eq("shop_id", session.shopId);

  revalidatePath("/admin/clientes");
  revalidatePath(`/admin/clientes/${customerId}`);
  revalidatePath("/admin");
  return { ok: true };
}

export async function deleteCustomer(customerId: string): Promise<ActionResult> {
  const session = await requireOwnerSession();
  if (!("userId" in session)) return session;

  const admin = requireAdminClient();
  if (isActionResult(admin)) return admin;

  const { data: customer } = await admin
    .from("customers")
    .select("id")
    .eq("id", customerId)
    .eq("shop_id", session.shopId)
    .maybeSingle();

  if (!customer) {
    return { ok: false, error: "Cliente não encontrado." };
  }

  // Só bloqueia visitas concluídas ou horários ainda ativos.
  // Cancelados não impedem (o vínculo some com ON DELETE SET NULL).
  const { count: doneCount, error: doneError } = await admin
    .from("appointments")
    .select("id", { count: "exact", head: true })
    .eq("customer_id", customerId)
    .eq("shop_id", session.shopId)
    .eq("status", "done");

  if (doneError) {
    return { ok: false, error: "Não foi possível verificar o histórico do cliente." };
  }

  if (doneCount && doneCount > 0) {
    return {
      ok: false,
      error:
        "Esse cliente tem visitas no histórico. Não dá pra excluir — edite os dados se precisar.",
    };
  }

  const { count: activeCount, error: activeError } = await admin
    .from("appointments")
    .select("id", { count: "exact", head: true })
    .eq("customer_id", customerId)
    .eq("shop_id", session.shopId)
    .in("status", ["scheduled", "confirmed"]);

  if (activeError) {
    return { ok: false, error: "Não foi possível verificar os horários do cliente." };
  }

  if (activeCount && activeCount > 0) {
    return {
      ok: false,
      error:
        "Esse cliente ainda tem horário marcado. Cancele ou conclua antes de excluir.",
    };
  }

  const { error } = await admin
    .from("customers")
    .delete()
    .eq("id", customerId)
    .eq("shop_id", session.shopId);

  if (error) {
    console.error("deleteCustomer", error);
    return { ok: false, error: "Não foi possível excluir o cliente." };
  }

  revalidatePath("/admin/clientes");
  return { ok: true };
}

const manualCreditSchema = z.object({
  amountCents: z.number().int().positive("Informe um valor maior que zero."),
  description: z.string().trim().max(200).optional(),
});

export async function addManualCreditAction(
  customerId: string,
  amountCents: number,
  description?: string
): Promise<ActionResult> {
  const session = await requireOwnerSession();
  if (!("userId" in session)) return session;

  const parsed = manualCreditSchema.safeParse({ amountCents, description });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const admin = requireAdminClient();
  if (isActionResult(admin)) return admin;

  const { data: customer } = await admin
    .from("customers")
    .select("id")
    .eq("id", customerId)
    .eq("shop_id", session.shopId)
    .maybeSingle();

  if (!customer) {
    return { ok: false, error: "Cliente não encontrado." };
  }

  const result = await addCustomerCredit(admin, {
    customerId,
    amountCents: parsed.data.amountCents,
    description: parsed.data.description || "Crédito adicionado manualmente",
  });

  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  revalidatePath("/admin/clientes");
  revalidatePath(`/admin/clientes/${customerId}`);
  return { ok: true };
}

export async function removeManualCreditAction(
  customerId: string,
  amountCents: number,
  description?: string
): Promise<ActionResult> {
  const session = await requireOwnerSession();
  if (!("userId" in session)) return session;

  const parsed = manualCreditSchema.safeParse({ amountCents, description });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const admin = requireAdminClient();
  if (isActionResult(admin)) return admin;

  const { data: customer } = await admin
    .from("customers")
    .select("id, credit_balance_cents")
    .eq("id", customerId)
    .eq("shop_id", session.shopId)
    .maybeSingle();

  if (!customer) {
    return { ok: false, error: "Cliente não encontrado." };
  }

  if (parsed.data.amountCents > customer.credit_balance_cents) {
    return {
      ok: false,
      error: `Saldo insuficiente. Disponível: ${formatPriceBRL(customer.credit_balance_cents)}.`,
    };
  }

  const result = await deductCustomerCredit(admin, {
    customerId,
    amountCents: parsed.data.amountCents,
    description: parsed.data.description || "Crédito removido manualmente",
  });

  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  revalidatePath("/admin/clientes");
  revalidatePath(`/admin/clientes/${customerId}`);
  return { ok: true };
}
