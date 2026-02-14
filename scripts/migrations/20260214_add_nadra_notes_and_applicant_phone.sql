-- Add notes to nadra_services and phone_number to applicants

alter table if exists public.nadra_services
  add column if not exists notes text;

alter table if exists public.applicants
  add column if not exists phone_number text;
