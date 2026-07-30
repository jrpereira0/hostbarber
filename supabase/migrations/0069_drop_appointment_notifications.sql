-- Remove controle de idempotência dos webhooks de agendamento (sem automação WhatsApp).

drop table if exists public.appointment_notifications cascade;
