import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import type { ActionResult } from "@/lib/require-owner";
import {
  mapProfessionalPermissionsRow,
  OWNER_PERMISSIONS,
  RECEPTION_PERMISSIONS,
  type ProfessionalPermissions,
} from "@/lib/professional-permissions";

export type AdminRole = "owner" | "barber" | "reception";

export type AdminSession = {
  userId: string;
  role: AdminRole;
  isOwner: boolean;
  isReception: boolean;
  professionalId: string | null;
  permissions: ProfessionalPermissions;
  /** Barbearia do usuário logado (multi-loja). */
  shopId: string;
};

/** Dono e recepção veem/operam a agenda de todos os barbeiros. */
export function canViewAllAgendas(session: AdminSession): boolean {
  return session.isOwner || session.isReception;
}

/** Dono e recepção cadastram/editam clientes (crédito manual só o dono). */
export function canManageCustomers(session: AdminSession): boolean {
  return session.isOwner || session.isReception;
}

export async function getAdminSession(): Promise<AdminSession | null> {
  if (!isSupabaseConfigured()) return null;

  const supabase = await createClient();
  if (!supabase) return null;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, shop_id")
    .eq("id", user.id)
    .single();

  if (
    !profile ||
    !profile.shop_id ||
    (profile.role !== "owner" &&
      profile.role !== "barber" &&
      profile.role !== "reception")
  ) {
    return null;
  }

  const shopId = profile.shop_id as string;

  const { data: shop } = await supabase
    .from("shops")
    .select("id")
    .eq("id", shopId)
    .eq("active", true)
    .maybeSingle();

  if (!shop) {
    return null;
  }

  if (profile.role === "owner") {
    return {
      userId: user.id,
      role: "owner",
      isOwner: true,
      isReception: false,
      professionalId: null,
      permissions: OWNER_PERMISSIONS,
      shopId,
    };
  }

  if (profile.role === "reception") {
    return {
      userId: user.id,
      role: "reception",
      isOwner: false,
      isReception: true,
      professionalId: null,
      permissions: RECEPTION_PERMISSIONS,
      shopId,
    };
  }

  const { data: pro } = await supabase
    .from("professionals")
    .select(
      "id, can_book_clients, can_create_squeeze_in, can_open_comanda, can_edit_comanda, can_close_comanda, can_edit_appointments, can_cancel_appointments, can_manage_schedule_blocks"
    )
    .eq("profile_id", user.id)
    .eq("shop_id", shopId)
    .maybeSingle();

  return {
    userId: user.id,
    role: "barber",
    isOwner: false,
    isReception: false,
    professionalId: pro?.id ?? null,
    permissions: mapProfessionalPermissionsRow(pro),
    shopId,
  };
}

export async function requireAdmin(): Promise<ActionResult | AdminSession> {
  const session = await getAdminSession();
  if (!session) return { ok: false, error: "Você precisa estar logado." };
  return session;
}
