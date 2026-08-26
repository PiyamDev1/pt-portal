-- Forward-only Ticketing capability 2026082601.
--
-- Tracks and verifies the pgcrypto runtime dependency that Supabase installs
-- in the extensions schema. The public digest bridge is fixed to the trusted
-- pgcrypto extension namespace and remains callable only by service_role.

begin;

select pg_advisory_xact_lock(hashtextextended(
  'ticketing:schema-migration',
  0
));

do $ticketing_runtime_forward_guard$
declare
  installed_version bigint;
begin
  if pg_catalog.to_regclass('public.portal_schema_versions') is not null then
    execute
      'select version from public.portal_schema_versions where component = $1 for update'
      into installed_version
      using 'ticketing';
  end if;

  if installed_version > 2026082601 then
    raise exception 'Ticketing migration capability % cannot run after installed capability %',
      2026082601, installed_version
      using
        errcode = '55000',
        hint = 'TICKETING_FORWARD_MIGRATION_REPLAY_BLOCKED';
  end if;

  if installed_version is null or installed_version < 2026082403 then
    raise exception 'Ticketing capability 2026082403 is required before runtime readiness capability 2026082601'
      using
        errcode = '55000',
        hint = 'TICKETING_SCHEMA_NOT_READY';
  end if;
end
$ticketing_runtime_forward_guard$;

do $ticketing_pgcrypto_bridge$
declare
  pgcrypto_schema name;
  pgcrypto_digest_oid oid;
begin
  select extension_namespace.nspname, digest_procedure.oid
  into pgcrypto_schema, pgcrypto_digest_oid
  from pg_extension extension_row
  join pg_namespace extension_namespace
    on extension_namespace.oid = extension_row.extnamespace
  join pg_depend extension_member
    on extension_member.refclassid = 'pg_extension'::regclass
    and extension_member.refobjid = extension_row.oid
    and extension_member.classid = 'pg_proc'::regclass
    and extension_member.deptype = 'e'
  join pg_proc digest_procedure
    on digest_procedure.oid = extension_member.objid
    and digest_procedure.proname = 'digest'
    and digest_procedure.proargtypes = '25 25'::oidvector
  where extension_row.extname = 'pgcrypto'
  limit 1;

  if pgcrypto_schema is null or pgcrypto_digest_oid is null then
    raise exception 'Trusted pgcrypto digest(text,text) is unavailable'
      using
        errcode = '42883',
        hint = 'TICKETING_PGCRYPTO_NOT_READY';
  end if;

  if pgcrypto_schema <> 'public' then
    execute format(
      $bridge$
        create or replace function public.digest(p_data text, p_type text)
        returns bytea
        language sql
        immutable
        strict
        parallel safe
        security definer
        set search_path = pg_catalog, pg_temp
        as $function$
          select %I.digest(p_data, p_type)
        $function$
      $bridge$,
      pgcrypto_schema
    );
  end if;
end
$ticketing_pgcrypto_bridge$;

revoke all on function public.digest(text, text)
  from public, anon, authenticated;
grant execute on function public.digest(text, text)
  to service_role;

comment on function public.digest(text, text) is
  'Service-only bridge to the digest(text,text) member of the installed pgcrypto extension for restricted-search-path Ticketing routines.';

insert into public.portal_schema_versions (component, version, applied_at, details)
values (
  'ticketing',
  2026082601,
  now(),
  jsonb_build_object(
    'migration', '20260826_ticketing_runtime_readiness.sql',
    'capabilities', coalesce(
      (
        select schema_version.details -> 'capabilities'
        from public.portal_schema_versions schema_version
        where schema_version.component = 'ticketing'
          and jsonb_typeof(schema_version.details -> 'capabilities') = 'array'
      ),
      '[]'::jsonb
    ) || jsonb_build_array(
      'supabase-pgcrypto-digest-compatibility',
      'verified-ticketing-runtime-readiness'
    ),
    'runtimeDependencies', jsonb_build_object(
      'pgcryptoDigest', true
    )
  )
)
on conflict (component) do update
set version = excluded.version,
    applied_at = excluded.applied_at,
    details = excluded.details
where public.portal_schema_versions.version < excluded.version;

create or replace function public.ticketing_schema_status()
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select jsonb_build_object(
    'ready',
      coalesce(schema_version.version >= 2026082601, false)
      and to_regprocedure('public.digest(text,text)') is not null
      and exists (
        select 1
        from pg_extension extension_row
        join pg_depend extension_member
          on extension_member.refclassid = 'pg_extension'::regclass
          and extension_member.refobjid = extension_row.oid
          and extension_member.classid = 'pg_proc'::regclass
          and extension_member.deptype = 'e'
        join pg_proc digest_procedure
          on digest_procedure.oid = extension_member.objid
          and digest_procedure.proname = 'digest'
          and digest_procedure.proargtypes = '25 25'::oidvector
        where extension_row.extname = 'pgcrypto'
      ),
    'version', schema_version.version,
    'requiredVersion', greatest(schema_version.version, 2026082601),
    'appliedAt', schema_version.applied_at,
    'details', schema_version.details
  )
  from public.portal_schema_versions schema_version
  where schema_version.component = 'ticketing'
$$;

revoke all on function public.ticketing_schema_status()
  from public, anon, authenticated;
grant execute on function public.ticketing_schema_status()
  to service_role;

commit;
