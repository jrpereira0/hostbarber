-- Tipo do lançamento: pagamento real, mês grátis (cortesia) ou indicação.
-- Assim o extrato separa dinheiro recebido de crédito de mensalidade.

alter table public.platform_payments
  add column if not exists kind text not null default 'payment';

alter table public.platform_payments
  drop constraint if exists platform_payments_kind_check;

alter table public.platform_payments
  add constraint platform_payments_kind_check
  check (kind in ('payment', 'complimentary', 'referral'));

comment on column public.platform_payments.kind is
  'payment = dinheiro recebido; complimentary = mês grátis manual; referral = crédito por indicação';
