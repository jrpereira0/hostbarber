-- Remove tabelas legadas: shop_settings (unificada em shops) e api_keys (sem API para clientes).

drop table if exists public.api_keys cascade;
drop table if exists public.shop_settings cascade;
