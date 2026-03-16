-- Add refund tracking fields to NADRA services.

alter table if exists public.nadra_services
  add column if not exists is_refunded boolean not null default false,
  add column if not exists refunded_at timestamp with time zone;
