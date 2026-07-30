export type PlatformShop = {
  id: string;
  name: string;
  slug: string;
  ownerEmail: string;
  ownerWhatsapp: string;
  ownerUserId: string | null;
  phone: string;
  cep: string;
  street: string;
  addressNumber: string;
  addressComplement: string;
  neighborhood: string;
  city: string;
  state: string;
  instagram: string | null;
  facebook: string | null;
  website: string | null;
  bio: string;
  logoUrl: string | null;
  active: boolean;
  createdAt: string;
  /** Mensalidade cobrada pela plataforma (centavos). Null = ainda não configurada. */
  monthlyFeeCents: number | null;
  /** Dia do mês de vencimento (1–28). Null = ainda não configurado. */
  billingDueDay: number | null;
  /** Último login do dono no painel (auth.users.last_sign_in_at). */
  ownerLastSignInAt: string | null;
};

export type PlatformShopRow = {
  id: string;
  name: string;
  slug: string;
  owner_email: string;
  owner_whatsapp: string;
  owner_user_id: string | null;
  phone: string;
  cep: string;
  street: string;
  address_number: string;
  address_complement: string;
  neighborhood: string;
  city: string;
  state: string;
  instagram: string | null;
  facebook: string | null;
  website: string | null;
  bio: string;
  logo_url: string | null;
  active: boolean;
  created_at: string;
  monthly_fee_cents?: number | null;
  billing_due_day?: number | null;
};

export function mapPlatformShop(row: PlatformShopRow): PlatformShop {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    ownerEmail: row.owner_email,
    ownerWhatsapp: row.owner_whatsapp,
    ownerUserId: row.owner_user_id,
    phone: row.phone,
    cep: row.cep,
    street: row.street,
    addressNumber: row.address_number,
    addressComplement: row.address_complement,
    neighborhood: row.neighborhood,
    city: row.city,
    state: row.state,
    instagram: row.instagram,
    facebook: row.facebook,
    website: row.website,
    bio: row.bio,
    logoUrl: row.logo_url,
    active: row.active,
    createdAt: row.created_at,
    monthlyFeeCents: row.monthly_fee_cents ?? null,
    billingDueDay: row.billing_due_day ?? null,
    ownerLastSignInAt: null,
  };
}
