-- Add requested passport page tracking for Pakistani passport applications

alter table if exists public.pakistani_passport_applications
  add column if not exists requested_page_number text,
  add column if not exists requested_page_provided boolean not null default false;
