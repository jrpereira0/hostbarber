-- ============================================================
-- Cobrança da plataforma (mensalidade que cada loja paga ao
-- superadmin): valor/dia de vencimento em shops + extrato de
-- pagamentos registrados manualmente.
-- ============================================================

alter table public.shops
  add column if not exists monthly_fee_cents integer,
  add column if not exists billing_due_day smallint;

alter table public.shops
  drop constraint if exists shops_monthly_fee_cents_check;
alter table public.shops
  add constraint shops_monthly_fee_cents_check
  check (monthly_fee_cents is null or monthly_fee_cents >= 0);

alter table public.shops
  drop constraint if exists shops_billing_due_day_check;
alter table public.shops
  add constraint shops_billing_due_day_check
  check (billing_due_day is null or (billing_due_day >= 1 and billing_due_day <= 28));

create table if not exists public.platform_payments (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  amount_cents integer not null check (amount_cents > 0),
  -- Mês de referência (sempre o dia 1 do mês).
  reference_month date not null,
  -- Data em que o pagamento caiu.
  paid_at date not null default (timezone('America/Sao_Paulo', now()))::date,
  note text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint platform_payments_reference_month_day1
    check (extract(day from reference_month) = 1)
);

create index if not exists platform_payments_shop_id_idx
  on public.platform_payments (shop_id);

create index if not exists platform_payments_reference_month_idx
  on public.platform_payments (reference_month desc);

create index if not exists platform_payments_paid_at_idx
  on public.platform_payments (paid_at desc);

alter table public.platform_payments enable row level security;

drop policy if exists "platform_payments_platform_admin_select"
  on public.platform_payments;
create policy "platform_payments_platform_admin_select"
  on public.platform_payments
  for select
  to authenticated
  using (public.is_platform_admin());

drop policy if exists "platform_payments_platform_admin_insert"
  on public.platform_payments;
create policy "platform_payments_platform_admin_insert"
  on public.platform_payments
  for insert
  to authenticated
  with check (public.is_platform_admin());

drop policy if exists "platform_payments_platform_admin_update"
  on public.platform_payments;
create policy "platform_payments_platform_admin_update"
  on public.platform_payments
  for update
  to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

drop policy if exists "platform_payments_platform_admin_delete"
  on public.platform_payments;
create policy "platform_payments_platform_admin_delete"
  on public.platform_payments
  for delete
  to authenticated
  using (public.is_platform_admin());
