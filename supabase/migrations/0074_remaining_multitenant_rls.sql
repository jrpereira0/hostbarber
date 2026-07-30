-- ============================================================
-- Fecha vazamentos restantes: agenda (exceções/bloqueios) e caixa.
-- Também reforça policies de barbeiro em comandas/repasses com shop_id.
-- ============================================================

-- ------------------------------------------------------------
-- schedule_exceptions
-- ------------------------------------------------------------
drop policy if exists "leitura publica de excecoes" on public.schedule_exceptions;

drop policy if exists "admin le excecoes da loja" on public.schedule_exceptions;
create policy "admin le excecoes da loja" on public.schedule_exceptions
  for select to authenticated using (
    (select public.is_admin()) and shop_id = public.current_shop_id()
  );

-- ------------------------------------------------------------
-- schedule_blocks
-- ------------------------------------------------------------
drop policy if exists "leitura publica de bloqueios" on public.schedule_blocks;

drop policy if exists "admin le bloqueios da loja" on public.schedule_blocks;
create policy "admin le bloqueios da loja" on public.schedule_blocks
  for select to authenticated using (
    (select public.is_admin()) and shop_id = public.current_shop_id()
  );

-- ------------------------------------------------------------
-- cash_register_sessions
-- ------------------------------------------------------------
drop policy if exists "dono gerencia caixa" on public.cash_register_sessions;
create policy "dono gerencia caixa" on public.cash_register_sessions
  for all using (
    (select public.is_owner()) and shop_id = public.current_shop_id()
  )
  with check (
    (select public.is_owner()) and shop_id = public.current_shop_id()
  );

-- ------------------------------------------------------------
-- Barbeiro: itens/pagamentos/vínculos de comanda — exige loja da sessão
-- ------------------------------------------------------------
drop policy if exists "barbeiro le itens das proprias comandas" on public.comanda_items;
create policy "barbeiro le itens das proprias comandas" on public.comanda_items
  for select using (
    exists (
      select 1
      from public.professionals p
      join public.comandas c on c.id = comanda_items.comanda_id
      where p.profile_id = (select auth.uid())
        and c.shop_id = public.current_shop_id()
        and (
          comanda_items.professional_id = p.id
          or c.professional_id = p.id
          or exists (
            select 1
            from public.comanda_appointments ca
            join public.appointments a on a.id = ca.appointment_id
            where ca.comanda_id = comanda_items.comanda_id
              and a.professional_id = p.id
          )
        )
    )
  );

drop policy if exists "barbeiro le pagamentos das proprias comandas" on public.comanda_payments;
create policy "barbeiro le pagamentos das proprias comandas" on public.comanda_payments
  for select using (
    exists (
      select 1
      from public.professionals p
      join public.comandas c on c.id = comanda_payments.comanda_id
      where p.profile_id = (select auth.uid())
        and c.shop_id = public.current_shop_id()
        and (
          c.professional_id = p.id
          or exists (
            select 1
            from public.comanda_items ci
            where ci.comanda_id = c.id
              and ci.professional_id = p.id
          )
          or exists (
            select 1
            from public.comanda_appointments ca
            join public.appointments a on a.id = ca.appointment_id
            where ca.comanda_id = c.id
              and a.professional_id = p.id
          )
        )
    )
  );

drop policy if exists "barbeiro le comanda_appointments das proprias" on public.comanda_appointments;
create policy "barbeiro le comanda_appointments das proprias" on public.comanda_appointments
  for select using (
    exists (
      select 1
      from public.professionals p
      join public.comandas c on c.id = comanda_appointments.comanda_id
      where p.profile_id = (select auth.uid())
        and c.shop_id = public.current_shop_id()
        and (
          c.professional_id = p.id
          or exists (
            select 1
            from public.appointments a
            where a.id = comanda_appointments.appointment_id
              and a.professional_id = p.id
          )
          or exists (
            select 1
            from public.comanda_items ci
            where ci.comanda_id = comanda_appointments.comanda_id
              and ci.professional_id = p.id
          )
        )
    )
  );

-- ------------------------------------------------------------
-- Barbeiro: repasses — exige loja da sessão
-- ------------------------------------------------------------
drop policy if exists "barbeiro le proprios repasses" on public.commission_payouts;
create policy "barbeiro le proprios repasses" on public.commission_payouts
  for select using (
    shop_id = public.current_shop_id()
    and exists (
      select 1 from public.professionals p
      where p.id = commission_payouts.professional_id
        and p.profile_id = (select auth.uid())
        and p.shop_id = public.current_shop_id()
    )
  );

drop policy if exists "barbeiro le itens dos proprios repasses" on public.commission_payout_items;
create policy "barbeiro le itens dos proprios repasses" on public.commission_payout_items
  for select using (
    exists (
      select 1
      from public.commission_payouts pay
      join public.professionals p on p.id = pay.professional_id
      where pay.id = commission_payout_items.payout_id
        and pay.shop_id = public.current_shop_id()
        and p.profile_id = (select auth.uid())
        and p.shop_id = public.current_shop_id()
    )
  );
