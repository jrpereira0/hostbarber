-- Permite dia de vencimento de 1 a 31 (meses curtos usam o último dia do mês).

alter table public.shops
  drop constraint if exists shops_billing_due_day_check;

alter table public.shops
  add constraint shops_billing_due_day_check
  check (billing_due_day is null or (billing_due_day >= 1 and billing_due_day <= 31));
