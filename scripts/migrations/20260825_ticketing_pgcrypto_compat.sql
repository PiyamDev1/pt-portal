-- Compatibility fix for Supabase projects that install pgcrypto in extensions.
-- Ticketing security-definer functions intentionally use a restricted search_path,
-- so unqualified digest(text, text) must remain resolvable without widening it.

begin;

create extension if not exists pgcrypto;

do $ticketing_pgcrypto_compat$
begin
  if to_regprocedure('public.digest(text,text)') is null then
    execute $function$
      create function public.digest(p_data text, p_type text)
      returns bytea
      language plpgsql
      immutable
      strict
      parallel safe
      security definer
      set search_path = pg_catalog, public, pg_temp
      as $body$
      declare
        digest_schema name;
        digest_value bytea;
      begin
        select namespace.nspname
        into digest_schema
        from pg_catalog.pg_proc procedure_row
        join pg_catalog.pg_namespace namespace
          on namespace.oid = procedure_row.pronamespace
        where procedure_row.proname = 'digest'
          and procedure_row.proargtypes = '25 25'::pg_catalog.oidvector
          and procedure_row.oid <> to_regprocedure('public.digest(text,text)')
        order by namespace.nspname = 'extensions' desc, namespace.nspname
        limit 1;

        if digest_schema is null then
          raise exception 'pgcrypto digest(text,text) is unavailable'
            using errcode = '42883';
        end if;

        execute format('select %I.digest($1, $2)', digest_schema)
          into digest_value
          using p_data, p_type;
        return digest_value;
      end
      $body$
    $function$;
  end if;
end
$ticketing_pgcrypto_compat$;

revoke all on function public.digest(text, text)
  from public, anon, authenticated;
grant execute on function public.digest(text, text)
  to service_role;

commit;
