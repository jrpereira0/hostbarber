-- ============================================================
-- Onboarding do dono: marca quando a configuração inicial
-- (perfil, equipe, serviços, produtos e explicação do caixa)
-- foi concluída ou pulada.
-- ============================================================

alter table public.shops
  add column if not exists onboarding_completed_at timestamptz;
