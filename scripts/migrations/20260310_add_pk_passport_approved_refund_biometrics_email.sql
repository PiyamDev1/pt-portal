-- Add approved/refund/biometrics support to Pakistani passport applications

do $$
begin
  if exists (select 1 from pg_type where typname = 'application_status') then
    if not exists (
      select 1
      from pg_enum e
      join pg_type t on t.oid = e.enumtypid
      where t.typname = 'application_status' and e.enumlabel = 'Approved'
    ) then
      execute 'alter type public.application_status add value ''Approved''';
    end if;
  end if;
end
$$;

alter table if exists public.pakistani_passport_applications
  add column if not exists is_refunded boolean not null default false,
  add column if not exists refunded_at timestamp with time zone;
