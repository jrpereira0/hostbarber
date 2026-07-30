-- Remove tabela de códigos OTP do cliente (login passou a ser só pelo WhatsApp).

drop table if exists public.client_whatsapp_otps cascade;
