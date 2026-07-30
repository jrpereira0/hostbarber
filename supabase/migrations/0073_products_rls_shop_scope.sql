-- ============================================================
-- Fecha vazamento multi-loja em produtos e categorias.
--
-- "leitura de produtos/categorias" (0040) liberava SELECT de TODAS
-- as lojas (using true). Sem isso, o painel de uma unidade via
-- catálogo da outra.
-- ============================================================

drop policy if exists "leitura de produtos" on public.products;
drop policy if exists "leitura de categorias de produto" on public.product_categories;

drop policy if exists "admin le produtos" on public.products;
create policy "admin le produtos" on public.products
  for select to authenticated using (
    (select public.is_admin()) and shop_id = public.current_shop_id()
  );

drop policy if exists "admin le categorias de produto" on public.product_categories;
create policy "admin le categorias de produto" on public.product_categories
  for select to authenticated using (
    (select public.is_admin()) and shop_id = public.current_shop_id()
  );
