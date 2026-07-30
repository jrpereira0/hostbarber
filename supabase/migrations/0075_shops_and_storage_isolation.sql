-- ============================================================
-- Fecha vazamentos restantes:
-- 1) shops: SELECT público lia TODAS as lojas ativas (e-mail/WhatsApp do dono etc.)
-- 2) storage photos: qualquer admin podia sobrescrever/apagar fotos de outras lojas
-- ============================================================

-- ------------------------------------------------------------
-- shops: só a própria loja (staff) ou superadmin da plataforma
-- Catálogo público / API já usam service role + slug.
-- ------------------------------------------------------------
drop policy if exists "shops_public_select_active" on public.shops;

drop policy if exists "shops_select_own_or_platform" on public.shops;
create policy "shops_select_own_or_platform" on public.shops
  for select to authenticated using (
    public.is_platform_admin()
    or id = public.current_shop_id()
  );

-- ------------------------------------------------------------
-- storage.photos: escrita só via service role (upload no app já usa admin client).
-- Remove INSERT/UPDATE/DELETE para JWT autenticado — evita um dono
-- sobrescrever/apagar arquivo de outra loja pelo path público.
-- Bucket continua público para leitura via URL.
-- ------------------------------------------------------------
drop policy if exists "admin envia fotos" on storage.objects;
drop policy if exists "admin atualiza fotos" on storage.objects;
drop policy if exists "admin remove fotos" on storage.objects;
