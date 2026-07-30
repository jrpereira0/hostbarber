-- ============================================================
-- Multi-loja: unifica config em shops + shop_id nas tabelas core
-- ============================================================

-- ------------------------------------------------------------
-- 1) Campos operacionais em shops (antes em shop_settings)
-- ------------------------------------------------------------
alter table public.shops
  add column if not exists whatsapp text not null default '',
  add column if not exists address text not null default '',
  add column if not exists slot_step_minutes smallint not null default 15,
  add column if not exists confirmation_whatsapp_message text not null default '',
  add column if not exists confirmation_whatsapp_enabled boolean not null default false;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'shops_slot_step_minutes_check'
  ) then
    alter table public.shops
      add constraint shops_slot_step_minutes_check
      check (slot_step_minutes in (15, 30, 45, 60));
  end if;
end $$;

update public.shops
set whatsapp = case
  when nullif(trim(whatsapp), '') is not null then whatsapp
  when nullif(trim(owner_whatsapp), '') is not null then owner_whatsapp
  else coalesce(phone, '')
end
where coalesce(trim(whatsapp), '') = '';

-- ------------------------------------------------------------
-- 2) Loja legado a partir de shop_settings
-- ------------------------------------------------------------
do $$
declare
  settings record;
  final_slug text := 'barbearia-legado';
  n int := 2;
begin
  if exists (select 1 from public.shops where owner_email = 'legado@local.invalid') then
    return;
  end if;

  select * into settings from public.shop_settings where id = 1;

  if found then
    while exists (select 1 from public.shops where slug = final_slug) loop
      final_slug := 'barbearia-legado-' || n;
      n := n + 1;
    end loop;

    insert into public.shops (
      name, slug, owner_email, owner_whatsapp, phone,
      cep, street, address_number, address_complement,
      neighborhood, city, state, address,
      instagram, bio, logo_url, whatsapp,
      slot_step_minutes,
      confirmation_whatsapp_message,
      confirmation_whatsapp_enabled,
      active
    ) values (
      coalesce(nullif(trim(settings.shop_name), ''), 'Barbearia'),
      final_slug,
      'legado@local.invalid',
      coalesce(settings.whatsapp, ''),
      coalesce(settings.whatsapp, ''),
      coalesce(settings.cep, ''),
      coalesce(settings.street, ''),
      coalesce(settings.address_number, ''),
      coalesce(settings.address_complement, ''),
      coalesce(settings.neighborhood, ''),
      coalesce(settings.city, ''),
      coalesce(settings.state, ''),
      coalesce(settings.address, ''),
      settings.instagram,
      coalesce(settings.bio, ''),
      settings.logo_url,
      coalesce(settings.whatsapp, ''),
      coalesce(settings.slot_step_minutes, 15),
      coalesce(settings.confirmation_whatsapp_message, ''),
      coalesce(settings.confirmation_whatsapp_enabled, false),
      true
    );
  elsif not exists (select 1 from public.shops limit 1) then
    insert into public.shops (name, slug, owner_email, active)
    values ('Barbearia', 'barbearia', 'legado@local.invalid', true);
  end if;
end $$;

create or replace function public.app_legacy_shop_id()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  sid uuid;
begin
  select id into sid from public.shops
  where owner_email = 'legado@local.invalid'
  order by created_at asc
  limit 1;
  if sid is not null then return sid; end if;

  select id into sid from public.shops order by created_at asc limit 1;
  return sid;
end;
$$;

revoke all on function public.app_legacy_shop_id() from public;
grant execute on function public.app_legacy_shop_id() to authenticated, anon, service_role;

-- ------------------------------------------------------------
-- 3) profiles.shop_id
-- ------------------------------------------------------------
alter table public.profiles
  add column if not exists shop_id uuid references public.shops (id) on delete cascade;

update public.profiles
set shop_id = public.app_legacy_shop_id()
where shop_id is null
  and public.app_legacy_shop_id() is not null;

insert into public.profiles (id, full_name, role, shop_id)
select
  s.owner_user_id,
  s.name,
  'owner',
  s.id
from public.shops s
where s.owner_user_id is not null
  and not exists (select 1 from public.profiles p where p.id = s.owner_user_id)
on conflict (id) do update
set
  shop_id = coalesce(public.profiles.shop_id, excluded.shop_id),
  role = case
    when public.profiles.role in ('owner', 'barber', 'reception')
      then public.profiles.role
    else 'owner'
  end;

-- ------------------------------------------------------------
-- 4) Helper: shop do usuário logado
-- ------------------------------------------------------------
create or replace function public.current_shop_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select shop_id from public.profiles where id = auth.uid()
$$;

revoke all on function public.current_shop_id() from public;
grant execute on function public.current_shop_id() to authenticated, anon;

-- ------------------------------------------------------------
-- 5) shop_id nas tabelas operacionais
-- ------------------------------------------------------------

alter table public.professionals
  add column if not exists shop_id uuid references public.shops (id) on delete cascade;
update public.professionals set shop_id = public.app_legacy_shop_id() where shop_id is null;
alter table public.professionals alter column shop_id set not null;
create index if not exists professionals_shop_id_idx on public.professionals (shop_id);

alter table public.services
  add column if not exists shop_id uuid references public.shops (id) on delete cascade;
update public.services set shop_id = public.app_legacy_shop_id() where shop_id is null;
alter table public.services alter column shop_id set not null;
create index if not exists services_shop_id_idx on public.services (shop_id);

alter table public.customers
  add column if not exists shop_id uuid references public.shops (id) on delete cascade;
update public.customers set shop_id = public.app_legacy_shop_id() where shop_id is null;
alter table public.customers alter column shop_id set not null;
alter table public.customers drop constraint if exists customers_whatsapp_unique;
drop index if exists customers_whatsapp_unique;
create unique index if not exists customers_shop_whatsapp_unique
  on public.customers (shop_id, whatsapp);
create index if not exists customers_shop_id_idx on public.customers (shop_id);

alter table public.appointments
  add column if not exists shop_id uuid references public.shops (id) on delete cascade;
update public.appointments set shop_id = public.app_legacy_shop_id() where shop_id is null;
alter table public.appointments alter column shop_id set not null;
create index if not exists appointments_shop_id_idx on public.appointments (shop_id);

alter table public.business_hours
  add column if not exists shop_id uuid references public.shops (id) on delete cascade;
update public.business_hours set shop_id = public.app_legacy_shop_id() where shop_id is null;
alter table public.business_hours alter column shop_id set not null;
alter table public.business_hours drop constraint if exists business_hours_pkey;
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'business_hours_pkey'
  ) then
    alter table public.business_hours add primary key (shop_id, weekday);
  end if;
end $$;

alter table public.schedule_exceptions
  add column if not exists shop_id uuid references public.shops (id) on delete cascade;
update public.schedule_exceptions set shop_id = public.app_legacy_shop_id() where shop_id is null;
alter table public.schedule_exceptions alter column shop_id set not null;
create index if not exists schedule_exceptions_shop_id_idx on public.schedule_exceptions (shop_id);

alter table public.schedule_blocks
  add column if not exists shop_id uuid references public.shops (id) on delete cascade;
update public.schedule_blocks set shop_id = public.app_legacy_shop_id() where shop_id is null;
alter table public.schedule_blocks alter column shop_id set not null;
create index if not exists schedule_blocks_shop_id_idx on public.schedule_blocks (shop_id);

alter table public.comandas
  add column if not exists shop_id uuid references public.shops (id) on delete cascade;
update public.comandas set shop_id = public.app_legacy_shop_id() where shop_id is null;
alter table public.comandas alter column shop_id set not null;
create index if not exists comandas_shop_id_idx on public.comandas (shop_id);

alter table public.product_categories
  add column if not exists shop_id uuid references public.shops (id) on delete cascade;
update public.product_categories set shop_id = public.app_legacy_shop_id() where shop_id is null;
alter table public.product_categories alter column shop_id set not null;
create index if not exists product_categories_shop_id_idx on public.product_categories (shop_id);

alter table public.products
  add column if not exists shop_id uuid references public.shops (id) on delete cascade;
update public.products set shop_id = public.app_legacy_shop_id() where shop_id is null;
alter table public.products alter column shop_id set not null;
create index if not exists products_shop_id_idx on public.products (shop_id);

alter table public.cash_register_sessions
  add column if not exists shop_id uuid references public.shops (id) on delete cascade;
update public.cash_register_sessions set shop_id = public.app_legacy_shop_id() where shop_id is null;
alter table public.cash_register_sessions alter column shop_id set not null;
create index if not exists cash_register_sessions_shop_id_idx on public.cash_register_sessions (shop_id);

alter table public.commission_payouts
  add column if not exists shop_id uuid references public.shops (id) on delete cascade;
update public.commission_payouts set shop_id = public.app_legacy_shop_id() where shop_id is null;
alter table public.commission_payouts alter column shop_id set not null;
create index if not exists commission_payouts_shop_id_idx on public.commission_payouts (shop_id);

alter table public.client_whatsapp_otps
  add column if not exists shop_id uuid references public.shops (id) on delete cascade;
update public.client_whatsapp_otps set shop_id = public.app_legacy_shop_id() where shop_id is null;
alter table public.client_whatsapp_otps alter column shop_id set not null;
create index if not exists client_whatsapp_otps_shop_id_idx on public.client_whatsapp_otps (shop_id);

-- api_keys: smallint -> uuid
alter table public.api_keys drop constraint if exists api_keys_shop_id_fkey;
drop index if exists api_keys_shop_active_idx;
drop policy if exists "dono le chaves da barbearia" on public.api_keys;
drop policy if exists "dono cria chaves da barbearia" on public.api_keys;
drop policy if exists "dono atualiza chaves da barbearia" on public.api_keys;

alter table public.api_keys add column if not exists shop_uuid uuid;

update public.api_keys
set shop_uuid = public.app_legacy_shop_id()
where shop_uuid is null;

alter table public.api_keys drop column shop_id;
alter table public.api_keys rename column shop_uuid to shop_id;
alter table public.api_keys
  alter column shop_id set not null,
  add constraint api_keys_shop_id_fkey
    foreign key (shop_id) references public.shops (id) on delete cascade;

create index if not exists api_keys_shop_active_idx
  on public.api_keys (shop_id, active)
  where revoked_at is null;

create policy "dono le chaves da barbearia" on public.api_keys
  for select using (
    public.is_owner() and shop_id = public.current_shop_id()
  );
create policy "dono cria chaves da barbearia" on public.api_keys
  for insert with check (
    public.is_owner() and shop_id = public.current_shop_id()
  );
create policy "dono atualiza chaves da barbearia" on public.api_keys
  for update using (
    public.is_owner() and shop_id = public.current_shop_id()
  );

-- ------------------------------------------------------------
-- 6) business_hours padrão para lojas sem grade
-- ------------------------------------------------------------
insert into public.business_hours (shop_id, weekday, open_time, close_time, active)
select s.id, d.weekday, '09:00'::time, '19:00'::time, (d.weekday <> 0)
from public.shops s
cross join (values (0), (1), (2), (3), (4), (5), (6)) as d(weekday)
where not exists (
  select 1 from public.business_hours bh
  where bh.shop_id = s.id and bh.weekday = d.weekday
);

-- ------------------------------------------------------------
-- 7) RLS shops
-- ------------------------------------------------------------
drop policy if exists "shops_platform_admin_select" on public.shops;
drop policy if exists "shops_platform_admin_insert" on public.shops;
drop policy if exists "shops_platform_admin_update" on public.shops;
drop policy if exists "shops_platform_admin_delete" on public.shops;

create policy "shops_select_member_or_platform"
  on public.shops for select to authenticated
  using (
    public.is_platform_admin()
    or id = public.current_shop_id()
  );

create policy "shops_insert_platform"
  on public.shops for insert to authenticated
  with check (public.is_platform_admin());

create policy "shops_update_owner_or_platform"
  on public.shops for update to authenticated
  using (
    public.is_platform_admin()
    or (id = public.current_shop_id() and public.is_owner())
  )
  with check (
    public.is_platform_admin()
    or (id = public.current_shop_id() and public.is_owner())
  );

create policy "shops_delete_platform"
  on public.shops for delete to authenticated
  using (public.is_platform_admin());

drop policy if exists "shops_public_select_active" on public.shops;
create policy "shops_public_select_active"
  on public.shops for select to anon, authenticated
  using (active = true);
