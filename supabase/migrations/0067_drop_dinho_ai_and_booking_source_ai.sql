-- Limpeza SaaS: remove status da IA da Dinho e origem "ai" (sem API externa).

drop table if exists public.dinho_ai_status cascade;

-- Agendamentos feitos via chave/IA passam a contar como site (histórico).
update public.appointments
set booking_source = 'site'
where booking_source = 'ai';

comment on column public.appointments.booking_source is
  'Origem: admin | site. Null em registros antigos sem origem conhecida.';
