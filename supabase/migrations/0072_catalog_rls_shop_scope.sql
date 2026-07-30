-- ============================================================
-- Fecha vazamento multi-loja no catálogo (profissionais/serviços).
--
-- A policy "leitura de profissionais/serviços" liberava active = true
-- de TODAS as lojas pra qualquer usuário (inclusive autenticado).
-- Policies antigas de escrita do dono (0027) também não tinham shop_id.
--
-- Catálogo público e APIs usam service role + filtro shop_id.
-- ============================================================

-- ------------------------------------------------------------
-- professionals
-- ------------------------------------------------------------
drop policy if exists "leitura de profissionais" on public.professionals;
drop policy if exists "dono insere profissionais" on public.professionals;
drop policy if exists "dono atualiza profissionais" on public.professionals;
drop policy if exists "dono remove profissionais" on public.professionals;

-- ------------------------------------------------------------
-- services
-- ------------------------------------------------------------
drop policy if exists "leitura de servicos" on public.services;
drop policy if exists "dono insere servicos" on public.services;
drop policy if exists "dono atualiza servicos" on public.services;
drop policy if exists "dono remove servicos" on public.services;

-- ------------------------------------------------------------
-- professional_services
-- ------------------------------------------------------------
drop policy if exists "leitura publica de vinculos" on public.professional_services;
drop policy if exists "dono insere vinculos" on public.professional_services;
drop policy if exists "dono atualiza vinculos" on public.professional_services;
drop policy if exists "dono remove vinculos" on public.professional_services;

drop policy if exists "admin le vinculos da loja" on public.professional_services;
create policy "admin le vinculos da loja" on public.professional_services
  for select to authenticated using (
    exists (
      select 1 from public.professionals p
      where p.id = professional_services.professional_id
        and p.shop_id = public.current_shop_id()
        and (select public.is_admin())
    )
  );

-- ------------------------------------------------------------
-- working_hours
-- ------------------------------------------------------------
drop policy if exists "leitura publica da grade" on public.working_hours;

drop policy if exists "admin le grade da loja" on public.working_hours;
create policy "admin le grade da loja" on public.working_hours
  for select to authenticated using (
    exists (
      select 1 from public.professionals p
      where p.id = working_hours.professional_id
        and p.shop_id = public.current_shop_id()
        and (select public.is_admin())
    )
  );

-- ------------------------------------------------------------
-- business_hours
-- ------------------------------------------------------------
drop policy if exists "leitura publica do horario da barbearia" on public.business_hours;

drop policy if exists "admin le horario da barbearia" on public.business_hours;
create policy "admin le horario da barbearia" on public.business_hours
  for select to authenticated using (
    (select public.is_admin()) and shop_id = public.current_shop_id()
  );

-- ------------------------------------------------------------
-- service_weekday_prices
-- ------------------------------------------------------------
drop policy if exists "leitura publica de precos por dia" on public.service_weekday_prices;
drop policy if exists "dono insere precos por dia" on public.service_weekday_prices;
drop policy if exists "dono atualiza precos por dia" on public.service_weekday_prices;
drop policy if exists "dono remove precos por dia" on public.service_weekday_prices;

drop policy if exists "admin le precos por dia" on public.service_weekday_prices;
create policy "admin le precos por dia" on public.service_weekday_prices
  for select to authenticated using (
    exists (
      select 1 from public.services s
      where s.id = service_weekday_prices.service_id
        and s.shop_id = public.current_shop_id()
        and (select public.is_admin())
    )
  );
