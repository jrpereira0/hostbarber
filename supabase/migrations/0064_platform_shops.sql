-- ============================================================
-- Plataforma SaaS: superadmins + cadastro de barbearias
-- Nesta etapa shops é só registro; o /admin single-shop não muda.
-- ============================================================

create table public.platform_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.platform_admins enable row level security;

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.platform_admins where user_id = auth.uid()
  );
$$;

revoke all on function public.is_platform_admin() from public;
grant execute on function public.is_platform_admin() to authenticated;

-- Cada um lê a própria linha; superadmin lê todas.
create policy "platform_admins_select_own_or_admin"
  on public.platform_admins
  for select
  to authenticated
  using (user_id = auth.uid() or public.is_platform_admin());

create policy "platform_admins_no_client_write"
  on public.platform_admins
  for all
  to authenticated
  using (false)
  with check (false);

create table public.shops (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null,
  owner_email text not null,
  owner_whatsapp text not null default '',
  owner_user_id uuid references auth.users (id) on delete set null,
  phone text not null default '',
  cep text not null default '',
  street text not null default '',
  address_number text not null default '',
  address_complement text not null default '',
  neighborhood text not null default '',
  city text not null default '',
  state text not null default '',
  instagram text,
  facebook text,
  website text,
  bio text not null default '',
  logo_url text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shops_slug_unique unique (slug),
  constraint shops_owner_email_unique unique (owner_email)
);

create index shops_active_idx on public.shops (active);
create index shops_name_idx on public.shops (name);

alter table public.shops enable row level security;

create policy "shops_platform_admin_select"
  on public.shops
  for select
  to authenticated
  using (public.is_platform_admin());

create policy "shops_platform_admin_insert"
  on public.shops
  for insert
  to authenticated
  with check (public.is_platform_admin());

create policy "shops_platform_admin_update"
  on public.shops
  for update
  to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

create policy "shops_platform_admin_delete"
  on public.shops
  for delete
  to authenticated
  using (public.is_platform_admin());

-- Dono de loja da plataforma / superadmin não entram no profiles do /admin single-shop.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if coalesce(new.raw_user_meta_data ->> 'platform_admin', '') = 'true'
     or coalesce(new.raw_user_meta_data ->> 'platform_shop_owner', '') = 'true'
  then
    return new;
  end if;

  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    case when not exists (select 1 from public.profiles) then 'owner' else 'barber' end
  );
  return new;
end;
$$;
