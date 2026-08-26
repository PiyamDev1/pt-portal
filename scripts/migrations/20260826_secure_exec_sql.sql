-- Restrict a legacy administrative SQL helper that may exist in linked
-- Supabase projects. A SECURITY DEFINER function accepting arbitrary SQL must
-- never be callable through anon or authenticated PostgREST roles.

begin;

do $secure_exec_sql$
begin
  if to_regprocedure('public.exec_sql(text)') is null then
    return;
  end if;

  revoke all on function public.exec_sql(text) from public;

  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function public.exec_sql(text) from anon;
  end if;

  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on function public.exec_sql(text) from authenticated;
  end if;

  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.exec_sql(text) to service_role;
  end if;

  comment on function public.exec_sql(text) is
    'Administrative SQL helper. Execution is restricted to service_role; never expose through anon or authenticated PostgREST roles.';
end
$secure_exec_sql$;

commit;
