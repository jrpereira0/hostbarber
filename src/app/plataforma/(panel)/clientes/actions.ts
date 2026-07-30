"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformAdmin } from "@/lib/require-platform-admin";
import {
  createAdminClient,
  requireAdminClient,
} from "@/lib/supabase/admin";
import type { ActionResult } from "@/lib/require-owner";
import {
  normalizeSlugInput,
  slugifyShopName,
  validateSlugFormat,
} from "@/lib/shops/slug";
import { buildShopAddress } from "@/lib/shops/settings";

function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

function optionalText(value: FormDataEntryValue | null): string | null {
  const text = String(value ?? "").trim();
  return text ? text : null;
}

function requiredText(value: FormDataEntryValue | null): string {
  return String(value ?? "").trim();
}

function revalidateClientPaths(shopId?: string) {
  revalidatePath("/plataforma");
  revalidatePath("/plataforma/clientes");
  if (shopId) {
    revalidatePath(`/plataforma/clientes/${shopId}`);
  }
}

async function uniqueSlug(
  baseName: string,
  excludeId?: string
): Promise<string> {
  const admin = createAdminClient();
  if (!admin) throw new Error("admin unavailable");

  const base = slugifyShopName(baseName);
  let candidate = base;
  let n = 2;

  for (;;) {
    let query = admin.from("shops").select("id").eq("slug", candidate).limit(1);
    if (excludeId) query = query.neq("id", excludeId);
    const { data } = await query.maybeSingle();
    if (!data) return candidate;
    candidate = `${base}-${n}`;
    n += 1;
    if (n > 100) return `${base}-${Date.now()}`;
  }
}

/**
 * Resolve o slug a partir do campo explícito do formulário (aba "Loja").
 * Se vier vazio, cai no comportamento automático (gerado a partir do nome).
 */
async function resolveSlugField(
  rawSlug: string,
  fallbackName: string,
  excludeId?: string
): Promise<{ ok: true; slug: string } | { ok: false; error: string }> {
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Erro interno." };

  const trimmed = rawSlug.trim();
  if (!trimmed) {
    return { ok: true, slug: await uniqueSlug(fallbackName, excludeId) };
  }

  const normalized = normalizeSlugInput(trimmed);
  const formatError = validateSlugFormat(normalized);
  if (formatError) return { ok: false, error: formatError };

  let query = admin.from("shops").select("id").eq("slug", normalized).limit(1);
  if (excludeId) query = query.neq("id", excludeId);
  const { data: taken } = await query.maybeSingle();
  if (taken) {
    return { ok: false, error: "Esse link já está em uso por outra loja." };
  }

  return { ok: true, slug: normalized };
}

function readShopFields(formData: FormData) {
  return {
    name: requiredText(formData.get("name")),
    ownerEmail: requiredText(formData.get("ownerEmail")).toLowerCase(),
    ownerWhatsapp: digitsOnly(requiredText(formData.get("ownerWhatsapp"))),
    phone: digitsOnly(requiredText(formData.get("phone"))),
    cep: digitsOnly(requiredText(formData.get("cep"))),
    street: requiredText(formData.get("street")),
    addressNumber: requiredText(formData.get("addressNumber")),
    addressComplement: requiredText(formData.get("addressComplement")),
    neighborhood: requiredText(formData.get("neighborhood")),
    city: requiredText(formData.get("city")),
    state: requiredText(formData.get("state")).toUpperCase().slice(0, 2),
    instagram: optionalText(formData.get("instagram")),
    facebook: optionalText(formData.get("facebook")),
    website: optionalText(formData.get("website")),
    bio: requiredText(formData.get("bio")),
  };
}

function validateShopFields(
  fields: ReturnType<typeof readShopFields>,
  opts: { requirePassword?: boolean; password?: string }
): string | null {
  if (!fields.name) return "Informe o nome da loja.";
  if (!fields.ownerEmail || !fields.ownerEmail.includes("@")) {
    return "Informe um e-mail válido do dono.";
  }
  if (fields.ownerWhatsapp.length < 10 || fields.ownerWhatsapp.length > 13) {
    return "Informe um WhatsApp válido do dono.";
  }
  if (opts.requirePassword) {
    const password = opts.password ?? "";
    if (password.length < 6) {
      return "A senha precisa ter pelo menos 6 caracteres.";
    }
  } else if (opts.password && opts.password.length > 0 && opts.password.length < 6) {
    return "A nova senha precisa ter pelo menos 6 caracteres.";
  }
  if (fields.state && fields.state.length !== 2) {
    return "UF inválida.";
  }
  return null;
}

export async function createShop(
  formData: FormData
): Promise<ActionResult & { shopId?: string }> {
  const gate = await requirePlatformAdmin();
  if ("ok" in gate && gate.ok === false) return gate;

  const admin = requireAdminClient();
  if ("ok" in admin) return admin;

  const fields = readShopFields(formData);
  const password = String(formData.get("password") ?? "");
  const validationError = validateShopFields(fields, {
    requirePassword: true,
    password,
  });
  if (validationError) return { ok: false, error: validationError };

  const { data: created, error: createUserError } =
    await admin.auth.admin.createUser({
      email: fields.ownerEmail,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: fields.name,
        platform_shop_owner: true,
      },
    });

  if (createUserError || !created.user) {
    const msg = createUserError?.message ?? "Não foi possível criar o usuário.";
    if (/already|registered|exists/i.test(msg)) {
      return {
        ok: false,
        error: "Já existe um usuário com este e-mail. Use outro ou edite o cliente.",
      };
    }
    return { ok: false, error: msg };
  }

  const slugResult = await resolveSlugField(
    String(formData.get("slug") ?? ""),
    fields.name
  );
  if (!slugResult.ok) {
    await admin.auth.admin.deleteUser(created.user.id);
    return slugResult;
  }
  const slug = slugResult.slug;
  const address = buildShopAddress({
    street: fields.street,
    address_number: fields.addressNumber,
    address_complement: fields.addressComplement,
    neighborhood: fields.neighborhood,
    city: fields.city,
    state: fields.state,
  });
  const shopWhatsapp = fields.phone || fields.ownerWhatsapp;

  const { data: shop, error: insertError } = await admin
    .from("shops")
    .insert({
      name: fields.name,
      slug,
      owner_email: fields.ownerEmail,
      owner_whatsapp: fields.ownerWhatsapp,
      owner_user_id: created.user.id,
      phone: fields.phone,
      whatsapp: shopWhatsapp,
      cep: fields.cep,
      street: fields.street,
      address_number: fields.addressNumber,
      address_complement: fields.addressComplement,
      neighborhood: fields.neighborhood,
      city: fields.city,
      state: fields.state,
      address,
      instagram: fields.instagram,
      facebook: fields.facebook,
      website: fields.website,
      bio: fields.bio,
      slot_step_minutes: 15,
      active: true,
    })
    .select("id")
    .single();

  if (insertError || !shop) {
    await admin.auth.admin.deleteUser(created.user.id);
    return {
      ok: false,
      error: insertError?.message ?? "Não foi possível salvar o cliente.",
    };
  }

  const { error: profileError } = await admin.from("profiles").upsert({
    id: created.user.id,
    full_name: fields.name,
    role: "owner",
    shop_id: shop.id,
  });

  if (profileError) {
    await admin.from("shops").delete().eq("id", shop.id);
    await admin.auth.admin.deleteUser(created.user.id);
    return {
      ok: false,
      error: `Não foi possível criar o acesso do dono: ${profileError.message}`,
    };
  }

  const hours = [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
    shop_id: shop.id,
    weekday,
    open_time: "09:00",
    close_time: "19:00",
    active: weekday !== 0,
  }));
  await admin.from("business_hours").upsert(hours);

  revalidateClientPaths(shop.id);
  return { ok: true, shopId: shop.id };
}

export async function updateShop(
  shopId: string,
  formData: FormData
): Promise<ActionResult> {
  const gate = await requirePlatformAdmin();
  if ("ok" in gate && gate.ok === false) return gate;

  const admin = requireAdminClient();
  if ("ok" in admin) return admin;

  if (!shopId) return { ok: false, error: "Cliente inválido." };

  const fields = readShopFields(formData);
  const password = String(formData.get("password") ?? "");
  const activeRaw = String(formData.get("active") ?? "true");
  const active = activeRaw === "true" || activeRaw === "on";

  const validationError = validateShopFields(fields, {
    requirePassword: false,
    password,
  });
  if (validationError) return { ok: false, error: validationError };

  const { data: existing, error: loadError } = await admin
    .from("shops")
    .select("id, owner_user_id, owner_email, name, slug")
    .eq("id", shopId)
    .maybeSingle();

  if (loadError || !existing) {
    return { ok: false, error: "Cliente não encontrado." };
  }

  if (fields.ownerEmail !== existing.owner_email && existing.owner_user_id) {
    const { error: emailError } = await admin.auth.admin.updateUserById(
      existing.owner_user_id,
      { email: fields.ownerEmail, email_confirm: true }
    );
    if (emailError) {
      return {
        ok: false,
        error:
          emailError.message ||
          "Não foi possível atualizar o e-mail do dono.",
      };
    }
  }

  if (password && existing.owner_user_id) {
    const { error: passError } = await admin.auth.admin.updateUserById(
      existing.owner_user_id,
      { password }
    );
    if (passError) {
      return {
        ok: false,
        error: passError.message || "Não foi possível atualizar a senha.",
      };
    }
  }

  const rawSlug = String(formData.get("slug") ?? "").trim();
  let slug: string | undefined;
  if (rawSlug) {
    if (normalizeSlugInput(rawSlug) !== existing.slug) {
      const slugResult = await resolveSlugField(rawSlug, fields.name, shopId);
      if (!slugResult.ok) return slugResult;
      slug = slugResult.slug;
    }
  } else if (fields.name !== existing.name) {
    slug = await uniqueSlug(fields.name, shopId);
  }

  const { error: updateError } = await admin
    .from("shops")
    .update({
      name: fields.name,
      ...(slug ? { slug } : {}),
      owner_email: fields.ownerEmail,
      owner_whatsapp: fields.ownerWhatsapp,
      phone: fields.phone,
      whatsapp: fields.phone || fields.ownerWhatsapp,
      cep: fields.cep,
      street: fields.street,
      address_number: fields.addressNumber,
      address_complement: fields.addressComplement,
      neighborhood: fields.neighborhood,
      city: fields.city,
      state: fields.state,
      address: buildShopAddress({
        street: fields.street,
        address_number: fields.addressNumber,
        address_complement: fields.addressComplement,
        neighborhood: fields.neighborhood,
        city: fields.city,
        state: fields.state,
      }),
      instagram: fields.instagram,
      facebook: fields.facebook,
      website: fields.website,
      bio: fields.bio,
      active,
      updated_at: new Date().toISOString(),
    })
    .eq("id", shopId);

  if (updateError) {
    return { ok: false, error: updateError.message };
  }

  revalidateClientPaths(shopId);
  return { ok: true };
}

/** Liga ou desliga o cliente (agenda pública some quando inativo). */
export async function setShopActive(
  shopId: string,
  active: boolean
): Promise<ActionResult> {
  const gate = await requirePlatformAdmin();
  if ("ok" in gate && gate.ok === false) return gate;

  const admin = requireAdminClient();
  if ("ok" in admin) return admin;

  if (!shopId) return { ok: false, error: "Cliente inválido." };

  const { data: existing, error: loadError } = await admin
    .from("shops")
    .select("id")
    .eq("id", shopId)
    .maybeSingle();

  if (loadError || !existing) {
    return { ok: false, error: "Cliente não encontrado." };
  }

  const { error } = await admin
    .from("shops")
    .update({
      active,
      updated_at: new Date().toISOString(),
    })
    .eq("id", shopId);

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidateClientPaths(shopId);
  return { ok: true };
}

/** Define uma nova senha para o dono da loja. */
export async function resetOwnerPassword(
  shopId: string,
  password: string
): Promise<ActionResult> {
  const gate = await requirePlatformAdmin();
  if ("ok" in gate && gate.ok === false) return gate;

  const admin = requireAdminClient();
  if ("ok" in admin) return admin;

  if (!shopId) return { ok: false, error: "Cliente inválido." };

  const nextPassword = password.trim();
  if (nextPassword.length < 6) {
    return { ok: false, error: "A senha precisa ter pelo menos 6 caracteres." };
  }

  const { data: existing, error: loadError } = await admin
    .from("shops")
    .select("id, owner_user_id")
    .eq("id", shopId)
    .maybeSingle();

  if (loadError || !existing) {
    return { ok: false, error: "Cliente não encontrado." };
  }

  if (!existing.owner_user_id) {
    return {
      ok: false,
      error: "Este cliente não tem usuário de dono vinculado.",
    };
  }

  const { error } = await admin.auth.admin.updateUserById(
    existing.owner_user_id,
    { password: nextPassword }
  );

  if (error) {
    return {
      ok: false,
      error: error.message || "Não foi possível atualizar a senha.",
    };
  }

  revalidateClientPaths(shopId);
  return { ok: true };
}

/**
 * Apaga o cliente e os logins da loja (dono, barbeiros, recepção).
 * Irreversível — remove comandas primeiro (evita conflito de check em
 * comanda_items quando services/products somem no cascade) e depois a loja.
 */
export async function deleteShop(
  shopId: string,
  confirmName: string
): Promise<ActionResult> {
  const gate = await requirePlatformAdmin();
  if ("ok" in gate && gate.ok === false) return gate;

  const admin = requireAdminClient();
  if ("ok" in admin) return admin;

  if (!shopId) return { ok: false, error: "Cliente inválido." };

  const { data: existing, error: loadError } = await admin
    .from("shops")
    .select("id, name")
    .eq("id", shopId)
    .maybeSingle();

  if (loadError || !existing) {
    return { ok: false, error: "Cliente não encontrado." };
  }

  if (confirmName.trim() !== existing.name) {
    return {
      ok: false,
      error: "Digite o nome da loja exatamente como aparece para confirmar.",
    };
  }

  const { data: profiles } = await admin
    .from("profiles")
    .select("id")
    .eq("shop_id", shopId);

  const userIds = (profiles ?? []).map((p) => p.id as string);

  // Comandas (e itens) antes da loja: senão o cascade de services/products
  // faz SET NULL em comanda_items e viola o check de tipo do item.
  const { error: comandasError } = await admin
    .from("comandas")
    .delete()
    .eq("shop_id", shopId);

  if (comandasError) {
    return {
      ok: false,
      error: `Não foi possível limpar as comandas: ${comandasError.message}`,
    };
  }

  // Repasses órfãos (itens já caíram com as comandas).
  const { error: payoutsError } = await admin
    .from("commission_payouts")
    .delete()
    .eq("shop_id", shopId);

  if (payoutsError) {
    return {
      ok: false,
      error: `Não foi possível limpar os repasses: ${payoutsError.message}`,
    };
  }

  const { error: deleteError } = await admin
    .from("shops")
    .delete()
    .eq("id", shopId);

  if (deleteError) {
    const msg = deleteError.message ?? "";
    if (/foreign key|violates|check constraint/i.test(msg)) {
      return {
        ok: false,
        error:
          "Não foi possível apagar porque ainda há dados ligados a esta loja. Tente de novo; se persistir, avise o suporte.",
      };
    }
    return { ok: false, error: msg };
  }

  for (const userId of userIds) {
    await admin.auth.admin.deleteUser(userId);
  }

  revalidatePath("/plataforma");
  revalidatePath("/plataforma/clientes");
  revalidatePath("/plataforma/financeiro");
  return { ok: true };
}
