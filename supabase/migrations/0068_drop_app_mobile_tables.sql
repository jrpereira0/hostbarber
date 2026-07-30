-- Remove tabelas e recursos do app mobile (push / caixa de notificações / lembretes Expo).

drop table if exists public.customer_push_tokens cascade;
drop table if exists public.customer_notifications cascade;
drop table if exists public.appointment_reminders cascade;
