import { formatShopAddress } from "@/lib/format";

export type ShopSettingsRow = {
  id: string;
  name: string;
  slug: string;
  bio: string;
  whatsapp: string;
  phone: string;
  instagram: string | null;
  facebook: string | null;
  website: string | null;
  logo_url: string | null;
  cep: string;
  street: string;
  address_number: string;
  address_complement: string;
  neighborhood: string;
  city: string;
  state: string;
  address: string;
  slot_step_minutes: number;
  confirmation_whatsapp_message: string;
  confirmation_whatsapp_enabled: boolean;
  active: boolean;
};

/** Monta o endereço plano a partir dos campos estruturados. */
export function buildShopAddress(row: {
  street?: string | null;
  address_number?: string | null;
  address_complement?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  state?: string | null;
  address?: string | null;
}): string {
  if (row.address?.trim()) return row.address.trim();
  return formatShopAddress({
    street: row.street ?? "",
    addressNumber: row.address_number ?? "",
    addressComplement: row.address_complement ?? "",
    neighborhood: row.neighborhood ?? "",
    city: row.city ?? "",
    state: row.state ?? "",
  });
}
