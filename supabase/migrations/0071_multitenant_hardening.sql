-- ============================================================
-- Multi-loja: corrige uniques globais que deveriam ser por loja
-- e reforça RLS para nunca vazar dado de uma loja pra outra.
-- ============================================================

-- ------------------------------------------------------------
-- 1) Uniques por loja (bugs reais com 2+ lojas)
-- ------------------------------------------------------------

-- Caixa: um aberto por dia... por loja (antes era um caixa aberto no sistema inteiro)
alter table public.cash_register_sessions
  drop constraint if exists cash_register_sessions_service_date_key;
drop index if exists public.cash_register_sessions_service_date_key;

create unique index if not exists cash_register_sessions_shop_date_unique
  on public.cash_register_sessions (shop_id, service_date);

drop index if exists public.cash_register_one_open_idx;
create unique index cash_register_one_open_idx
  on public.cash_register_sessions (shop_id)
  where status = 'open';

-- Comanda aberta por cliente/dia... por loja (mesmo whatsapp podia existir em 2 lojas)
drop index if exists public.comandas_open_customer_day_idx;
create unique index comandas_open_customer_day_idx
  on public.comandas (shop_id, customer_whatsapp, service_date)
  where status = 'open' and customer_whatsapp is not null;

-- Categoria de produto: nome único por loja (antes era único no sistema inteiro)
alter table public.product_categories
  drop constraint if exists product_categories_name_unique;
create unique index if not exists product_categories_shop_name_unique
  on public.product_categories (shop_id, name);

-- ------------------------------------------------------------
-- 2) RLS: tabelas com shop_id direto — só dono/recepção/barbeiro
--    da própria loja enxerga ou altera.
-- ------------------------------------------------------------

-- profiles
drop policy if exists "dono le todos os perfis" on public.profiles;
create policy "dono le todos os perfis" on public.profiles
  for select using (
    (select public.is_owner()) and shop_id = public.current_shop_id()
  );

drop policy if exists "dono gerencia perfis" on public.profiles;
create policy "dono gerencia perfis" on public.profiles
  for update using (
    (select public.is_owner()) and shop_id = public.current_shop_id()
  );

-- professionals
drop policy if exists "admin le todos os profissionais" on public.professionals;
create policy "admin le todos os profissionais" on public.professionals
  for select to authenticated using (
    (select public.is_admin()) and shop_id = public.current_shop_id()
  );

drop policy if exists "dono gerencia profissionais" on public.professionals;
create policy "dono gerencia profissionais" on public.professionals
  for all using (
    (select public.is_owner()) and shop_id = public.current_shop_id()
  )
  with check (
    (select public.is_owner()) and shop_id = public.current_shop_id()
  );

-- services
drop policy if exists "admin le todos os servicos" on public.services;
create policy "admin le todos os servicos" on public.services
  for select to authenticated using (
    (select public.is_admin()) and shop_id = public.current_shop_id()
  );

drop policy if exists "dono gerencia servicos" on public.services;
create policy "dono gerencia servicos" on public.services
  for all using (
    (select public.is_owner()) and shop_id = public.current_shop_id()
  )
  with check (
    (select public.is_owner()) and shop_id = public.current_shop_id()
  );

-- business_hours
drop policy if exists "dono gerencia horario da barbearia" on public.business_hours;
create policy "dono gerencia horario da barbearia" on public.business_hours
  for all using (
    (select public.is_owner()) and shop_id = public.current_shop_id()
  )
  with check (
    (select public.is_owner()) and shop_id = public.current_shop_id()
  );

-- schedule_exceptions
drop policy if exists "dono gerencia excecoes" on public.schedule_exceptions;
create policy "dono gerencia excecoes" on public.schedule_exceptions
  for all using (
    (select public.is_owner()) and shop_id = public.current_shop_id()
  )
  with check (
    (select public.is_owner()) and shop_id = public.current_shop_id()
  );

-- schedule_blocks
drop policy if exists "dono gerencia bloqueios" on public.schedule_blocks;
create policy "dono gerencia bloqueios" on public.schedule_blocks
  for all using (
    (select public.is_owner()) and shop_id = public.current_shop_id()
  )
  with check (
    (select public.is_owner()) and shop_id = public.current_shop_id()
  );

drop policy if exists "barbeiro gerencia os proprios bloqueios" on public.schedule_blocks;
create policy "barbeiro gerencia os proprios bloqueios" on public.schedule_blocks
  for all using (
    shop_id = public.current_shop_id()
    and exists (
      select 1 from public.professionals p
      where p.id = schedule_blocks.professional_id
        and p.profile_id = (select auth.uid())
    )
  )
  with check (
    shop_id = public.current_shop_id()
    and exists (
      select 1 from public.professionals p
      where p.id = schedule_blocks.professional_id
        and p.profile_id = (select auth.uid())
    )
  );

drop policy if exists "recepcao gerencia bloqueios" on public.schedule_blocks;
create policy "recepcao gerencia bloqueios" on public.schedule_blocks
  for all using (
    (select public.is_reception()) and shop_id = public.current_shop_id()
  )
  with check (
    (select public.is_reception()) and shop_id = public.current_shop_id()
  );

-- customers
drop policy if exists "admin le clientes" on public.customers;
create policy "admin le clientes" on public.customers
  for select using (
    (select public.is_admin()) and shop_id = public.current_shop_id()
  );

drop policy if exists "dono gerencia clientes" on public.customers;
create policy "dono gerencia clientes" on public.customers
  for all using (
    (select public.is_owner()) and shop_id = public.current_shop_id()
  )
  with check (
    (select public.is_owner()) and shop_id = public.current_shop_id()
  );

drop policy if exists "recepcao le clientes" on public.customers;
create policy "recepcao le clientes" on public.customers
  for select using (
    (select public.is_reception()) and shop_id = public.current_shop_id()
  );

-- appointments
drop policy if exists "dono gerencia agendamentos" on public.appointments;
create policy "dono gerencia agendamentos" on public.appointments
  for all using (
    (select public.is_owner()) and shop_id = public.current_shop_id()
  )
  with check (
    (select public.is_owner()) and shop_id = public.current_shop_id()
  );

drop policy if exists "agenda le agendamentos" on public.appointments;
create policy "agenda le agendamentos" on public.appointments
  for select using (
    shop_id = public.current_shop_id()
    and (
      (select public.is_owner())
      or (select public.is_reception())
      or exists (
        select 1 from public.professionals p
        where p.id = appointments.professional_id
          and p.profile_id = (select auth.uid())
      )
    )
  );

drop policy if exists "barbeiro atualiza os proprios agendamentos" on public.appointments;
create policy "barbeiro atualiza os proprios agendamentos" on public.appointments
  for update using (
    shop_id = public.current_shop_id()
    and exists (
      select 1 from public.professionals p
      where p.id = appointments.professional_id
        and p.profile_id = (select auth.uid())
    )
  );

-- comandas
drop policy if exists "dono gerencia comandas" on public.comandas;
create policy "dono gerencia comandas" on public.comandas
  for all using (
    (select public.is_owner()) and shop_id = public.current_shop_id()
  )
  with check (
    (select public.is_owner()) and shop_id = public.current_shop_id()
  );

drop policy if exists "recepcao le comandas" on public.comandas;
create policy "recepcao le comandas" on public.comandas
  for select using (
    (select public.is_reception()) and shop_id = public.current_shop_id()
  );

drop policy if exists "barbeiro le proprias comandas" on public.comandas;
create policy "barbeiro le proprias comandas" on public.comandas
  for select using (
    shop_id = public.current_shop_id()
    and exists (
      select 1
      from public.professionals p
      where p.profile_id = (select auth.uid())
        and (
          p.id = comandas.professional_id
          or exists (
            select 1
            from public.comanda_items ci
            where ci.comanda_id = comandas.id
              and ci.professional_id = p.id
          )
          or exists (
            select 1
            from public.comanda_appointments ca
            join public.appointments a on a.id = ca.appointment_id
            where ca.comanda_id = comandas.id
              and a.professional_id = p.id
          )
        )
    )
  );

-- commission_payouts
drop policy if exists "dono gerencia repasses de comissao" on public.commission_payouts;
create policy "dono gerencia repasses de comissao" on public.commission_payouts
  for all using (
    (select public.is_owner()) and shop_id = public.current_shop_id()
  )
  with check (
    (select public.is_owner()) and shop_id = public.current_shop_id()
  );

-- product_categories
drop policy if exists "dono insere categorias de produto" on public.product_categories;
create policy "dono insere categorias de produto" on public.product_categories
  for insert with check (
    (select public.is_owner()) and shop_id = public.current_shop_id()
  );

drop policy if exists "dono atualiza categorias de produto" on public.product_categories;
create policy "dono atualiza categorias de produto" on public.product_categories
  for update using (
    (select public.is_owner()) and shop_id = public.current_shop_id()
  );

drop policy if exists "dono remove categorias de produto" on public.product_categories;
create policy "dono remove categorias de produto" on public.product_categories
  for delete using (
    (select public.is_owner()) and shop_id = public.current_shop_id()
  );

-- products
drop policy if exists "dono insere produtos" on public.products;
create policy "dono insere produtos" on public.products
  for insert with check (
    (select public.is_owner()) and shop_id = public.current_shop_id()
  );

drop policy if exists "dono atualiza produtos" on public.products;
create policy "dono atualiza produtos" on public.products
  for update using (
    (select public.is_owner()) and shop_id = public.current_shop_id()
  );

drop policy if exists "dono remove produtos" on public.products;
create policy "dono remove produtos" on public.products
  for delete using (
    (select public.is_owner()) and shop_id = public.current_shop_id()
  );

-- ------------------------------------------------------------
-- 3) RLS: tabelas "filhas" sem shop_id próprio — escopo via join
--    com a tabela dona (comanda, agendamento, cliente, repasse).
-- ------------------------------------------------------------

-- professional_services (vínculo profissional x serviço)
drop policy if exists "dono gerencia vinculos" on public.professional_services;
create policy "dono gerencia vinculos" on public.professional_services
  for all using (
    (select public.is_owner())
    and exists (
      select 1 from public.professionals p
      where p.id = professional_services.professional_id
        and p.shop_id = public.current_shop_id()
    )
  )
  with check (
    (select public.is_owner())
    and exists (
      select 1 from public.professionals p
      where p.id = professional_services.professional_id
        and p.shop_id = public.current_shop_id()
    )
  );

-- working_hours (grade do barbeiro)
drop policy if exists "dono gerencia grade" on public.working_hours;
create policy "dono gerencia grade" on public.working_hours
  for all using (
    (select public.is_owner())
    and exists (
      select 1 from public.professionals p
      where p.id = working_hours.professional_id
        and p.shop_id = public.current_shop_id()
    )
  )
  with check (
    (select public.is_owner())
    and exists (
      select 1 from public.professionals p
      where p.id = working_hours.professional_id
        and p.shop_id = public.current_shop_id()
    )
  );

-- appointment_services
drop policy if exists "leitura servicos dos agendamentos" on public.appointment_services;
create policy "leitura servicos dos agendamentos" on public.appointment_services
  for select using (
    exists (
      select 1 from public.appointments a
      where a.id = appointment_services.appointment_id
        and a.shop_id = public.current_shop_id()
        and (
          (select public.is_owner())
          or (select public.is_reception())
          or exists (
            select 1 from public.professionals p
            where p.id = a.professional_id
              and p.profile_id = (select auth.uid())
          )
        )
    )
  );

drop policy if exists "dono insere servicos dos agendamentos" on public.appointment_services;
create policy "dono insere servicos dos agendamentos" on public.appointment_services
  for insert with check (
    (select public.is_owner())
    and exists (
      select 1 from public.appointments a
      where a.id = appointment_services.appointment_id
        and a.shop_id = public.current_shop_id()
    )
  );

drop policy if exists "dono atualiza servicos dos agendamentos" on public.appointment_services;
create policy "dono atualiza servicos dos agendamentos" on public.appointment_services
  for update using (
    (select public.is_owner())
    and exists (
      select 1 from public.appointments a
      where a.id = appointment_services.appointment_id
        and a.shop_id = public.current_shop_id()
    )
  );

drop policy if exists "dono remove servicos dos agendamentos" on public.appointment_services;
create policy "dono remove servicos dos agendamentos" on public.appointment_services
  for delete using (
    (select public.is_owner())
    and exists (
      select 1 from public.appointments a
      where a.id = appointment_services.appointment_id
        and a.shop_id = public.current_shop_id()
    )
  );

-- comanda_items
drop policy if exists "dono gerencia itens da comanda" on public.comanda_items;
create policy "dono gerencia itens da comanda" on public.comanda_items
  for all using (
    (select public.is_owner())
    and exists (
      select 1 from public.comandas c
      where c.id = comanda_items.comanda_id
        and c.shop_id = public.current_shop_id()
    )
  )
  with check (
    (select public.is_owner())
    and exists (
      select 1 from public.comandas c
      where c.id = comanda_items.comanda_id
        and c.shop_id = public.current_shop_id()
    )
  );

-- comanda_payments
drop policy if exists "dono gerencia pagamentos da comanda" on public.comanda_payments;
create policy "dono gerencia pagamentos da comanda" on public.comanda_payments
  for all using (
    (select public.is_owner())
    and exists (
      select 1 from public.comandas c
      where c.id = comanda_payments.comanda_id
        and c.shop_id = public.current_shop_id()
    )
  )
  with check (
    (select public.is_owner())
    and exists (
      select 1 from public.comandas c
      where c.id = comanda_payments.comanda_id
        and c.shop_id = public.current_shop_id()
    )
  );

drop policy if exists "recepcao le pagamentos das comandas" on public.comanda_payments;
create policy "recepcao le pagamentos das comandas" on public.comanda_payments
  for select using (
    (select public.is_reception())
    and exists (
      select 1 from public.comandas c
      where c.id = comanda_payments.comanda_id
        and c.shop_id = public.current_shop_id()
    )
  );

-- comanda_appointments
drop policy if exists "dono gerencia comanda_appointments" on public.comanda_appointments;
create policy "dono gerencia comanda_appointments" on public.comanda_appointments
  for all using (
    (select public.is_owner())
    and exists (
      select 1 from public.comandas c
      where c.id = comanda_appointments.comanda_id
        and c.shop_id = public.current_shop_id()
    )
  )
  with check (
    (select public.is_owner())
    and exists (
      select 1 from public.comandas c
      where c.id = comanda_appointments.comanda_id
        and c.shop_id = public.current_shop_id()
    )
  );

-- customer_credit_transactions
drop policy if exists "dono gerencia creditos" on public.customer_credit_transactions;
create policy "dono gerencia creditos" on public.customer_credit_transactions
  for all using (
    (select public.is_owner())
    and exists (
      select 1 from public.customers cu
      where cu.id = customer_credit_transactions.customer_id
        and cu.shop_id = public.current_shop_id()
    )
  )
  with check (
    (select public.is_owner())
    and exists (
      select 1 from public.customers cu
      where cu.id = customer_credit_transactions.customer_id
        and cu.shop_id = public.current_shop_id()
    )
  );

drop policy if exists "recepcao le creditos" on public.customer_credit_transactions;
create policy "recepcao le creditos" on public.customer_credit_transactions
  for select using (
    (select public.is_reception())
    and exists (
      select 1 from public.customers cu
      where cu.id = customer_credit_transactions.customer_id
        and cu.shop_id = public.current_shop_id()
    )
  );

-- commission_payout_items
drop policy if exists "dono gerencia itens de repasse" on public.commission_payout_items;
create policy "dono gerencia itens de repasse" on public.commission_payout_items
  for all using (
    (select public.is_owner())
    and exists (
      select 1 from public.commission_payouts pay
      where pay.id = commission_payout_items.payout_id
        and pay.shop_id = public.current_shop_id()
    )
  )
  with check (
    (select public.is_owner())
    and exists (
      select 1 from public.commission_payouts pay
      where pay.id = commission_payout_items.payout_id
        and pay.shop_id = public.current_shop_id()
    )
  );

-- service_weekday_prices
drop policy if exists "dono gerencia precos por dia" on public.service_weekday_prices;
create policy "dono gerencia precos por dia" on public.service_weekday_prices
  for all using (
    (select public.is_owner())
    and exists (
      select 1 from public.services s
      where s.id = service_weekday_prices.service_id
        and s.shop_id = public.current_shop_id()
    )
  )
  with check (
    (select public.is_owner())
    and exists (
      select 1 from public.services s
      where s.id = service_weekday_prices.service_id
        and s.shop_id = public.current_shop_id()
    )
  );
