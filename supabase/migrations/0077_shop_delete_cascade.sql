-- ============================================================
-- Permite excluir uma loja por completo: FKs que eram RESTRICT
-- travavam o cascade de shops → services/appointments/etc.
-- ============================================================

-- Agendamento ↔ serviço (junction)
alter table public.appointment_services
  drop constraint if exists appointment_services_service_id_fkey;
alter table public.appointment_services
  add constraint appointment_services_service_id_fkey
  foreign key (service_id) references public.services (id) on delete cascade;

-- Agendamentos do profissional
alter table public.appointments
  drop constraint if exists appointments_professional_id_fkey;
alter table public.appointments
  add constraint appointments_professional_id_fkey
  foreign key (professional_id) references public.professionals (id) on delete cascade;

-- Comandas ligadas a agendamento / profissional
alter table public.comandas
  drop constraint if exists comandas_appointment_id_fkey;
alter table public.comandas
  add constraint comandas_appointment_id_fkey
  foreign key (appointment_id) references public.appointments (id) on delete cascade;

alter table public.comandas
  drop constraint if exists comandas_professional_id_fkey;
alter table public.comandas
  add constraint comandas_professional_id_fkey
  foreign key (professional_id) references public.professionals (id) on delete cascade;

-- Vínculo comanda ↔ agendamento
alter table public.comanda_appointments
  drop constraint if exists comanda_appointments_appointment_id_fkey;
alter table public.comanda_appointments
  add constraint comanda_appointments_appointment_id_fkey
  foreign key (appointment_id) references public.appointments (id) on delete cascade;

-- Repasses de comissão
alter table public.commission_payouts
  drop constraint if exists commission_payouts_professional_id_fkey;
alter table public.commission_payouts
  add constraint commission_payouts_professional_id_fkey
  foreign key (professional_id) references public.professionals (id) on delete cascade;

alter table public.commission_payout_items
  drop constraint if exists commission_payout_items_comanda_item_id_fkey;
alter table public.commission_payout_items
  add constraint commission_payout_items_comanda_item_id_fkey
  foreign key (comanda_item_id) references public.comanda_items (id) on delete cascade;

-- Produtos / estoque
alter table public.products
  drop constraint if exists products_category_id_fkey;
alter table public.products
  add constraint products_category_id_fkey
  foreign key (category_id) references public.product_categories (id) on delete cascade;

alter table public.product_stock_movements
  drop constraint if exists product_stock_movements_product_id_fkey;
alter table public.product_stock_movements
  add constraint product_stock_movements_product_id_fkey
  foreign key (product_id) references public.products (id) on delete cascade;
