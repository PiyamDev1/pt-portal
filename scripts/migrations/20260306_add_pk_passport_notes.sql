-- Add per-application notes support for Pakistani passports

alter table if exists public.pakistani_passport_applications
  add column if not exists notes text;
