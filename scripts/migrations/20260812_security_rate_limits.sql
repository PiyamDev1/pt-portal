begin;

create table if not exists public.portal_schema_versions (
  component text primary key,
  version bigint not null,
  applied_at timestamptz not null default now(),
  details jsonb not null default '{}'::jsonb,
  constraint portal_schema_versions_component_not_blank
    check (length(btrim(component)) between 1 and 100),
  constraint portal_schema_versions_version_positive check (version > 0)
);

alter table public.portal_schema_versions enable row level security;

drop policy if exists "Service role reads portal schema versions"
  on public.portal_schema_versions;
create policy "Service role reads portal schema versions"
  on public.portal_schema_versions
  for select
  to service_role
  using (true);

revoke all on table public.portal_schema_versions from public, anon, authenticated;
grant select on table public.portal_schema_versions to service_role;

create table if not exists public.api_rate_limit_buckets (
  scope text not null,
  identity_hash text not null,
  window_started_at timestamptz not null default now(),
  request_count integer not null default 0 check (request_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (scope, identity_hash)
);

create index if not exists api_rate_limit_buckets_updated_at_idx
  on public.api_rate_limit_buckets (updated_at);

comment on table public.api_rate_limit_buckets is
  'Atomic, shared rate-limit counters. Identities are one-way hashed by the API before storage.';

alter table public.api_rate_limit_buckets enable row level security;

revoke all on table public.api_rate_limit_buckets from public, anon, authenticated;
grant select, insert, update, delete on table public.api_rate_limit_buckets to service_role;

create or replace function public.check_api_rate_limit(
  p_scope text,
  p_identity_hash text,
  p_limit integer,
  p_window_seconds integer
)
returns table (
  allowed boolean,
  remaining integer,
  retry_after_seconds integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_bucket public.api_rate_limit_buckets%rowtype;
  v_elapsed_seconds integer;
begin
  if coalesce(length(trim(p_scope)), 0) = 0
    or length(trim(p_scope)) > 200
    or coalesce(length(trim(p_identity_hash)), 0) < 32
    or length(trim(p_identity_hash)) > 200
    or p_limit < 1
    or p_limit > 1000000
    or p_window_seconds < 1
    or p_window_seconds > 604800
  then
    raise exception 'Invalid rate-limit parameters' using errcode = '22023';
  end if;

  -- Opportunistic bounded cleanup avoids an ever-growing identity table
  -- without requiring a separate scheduler on every deployment target.
  if random() < 0.01 then
    delete from public.api_rate_limit_buckets
     where updated_at < v_now - interval '7 days';
  end if;

  -- Serialize both first-use and existing-bucket requests for this exact key.
  perform pg_advisory_xact_lock(hashtextextended(p_scope || ':' || p_identity_hash, 0));

  select *
    into v_bucket
    from public.api_rate_limit_buckets
   where scope = p_scope
     and identity_hash = p_identity_hash
   for update;

  if not found then
    insert into public.api_rate_limit_buckets (
      scope,
      identity_hash,
      window_started_at,
      request_count,
      updated_at
    ) values (
      p_scope,
      p_identity_hash,
      v_now,
      1,
      v_now
    )
    returning * into v_bucket;
  elsif v_bucket.window_started_at + make_interval(secs => p_window_seconds) <= v_now then
    update public.api_rate_limit_buckets
       set window_started_at = v_now,
           request_count = 1,
           updated_at = v_now
     where scope = p_scope
       and identity_hash = p_identity_hash
    returning * into v_bucket;
  else
    update public.api_rate_limit_buckets
       set request_count = request_count + 1,
           updated_at = v_now
     where scope = p_scope
       and identity_hash = p_identity_hash
    returning * into v_bucket;
  end if;

  v_elapsed_seconds := greatest(
    ceil(extract(epoch from (
      v_bucket.window_started_at + make_interval(secs => p_window_seconds) - v_now
    )))::integer,
    1
  );

  return query select
    v_bucket.request_count <= p_limit,
    greatest(p_limit - v_bucket.request_count, 0),
    case when v_bucket.request_count <= p_limit then 0 else v_elapsed_seconds end;
end;
$$;

revoke all on function public.check_api_rate_limit(text, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.check_api_rate_limit(text, text, integer, integer)
  to service_role;

comment on function public.check_api_rate_limit(text, text, integer, integer) is
  'Atomically increments a fixed-window API rate limit and returns the current decision.';

create or replace function public.replace_backup_codes(
  p_user_id uuid,
  p_code_hashes jsonb
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer;
begin
  if p_user_id is null
    or p_code_hashes is null
    or jsonb_typeof(p_code_hashes) <> 'array'
    or jsonb_array_length(p_code_hashes) not between 1 and 10
  then
    raise exception 'Invalid backup-code replacement payload' using errcode = '22023';
  end if;

  if exists (
    select 1
      from jsonb_array_elements_text(p_code_hashes) as hashes(code_hash)
     where length(hashes.code_hash) not between 20 and 200
  ) then
    raise exception 'Invalid backup-code hash' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('backup-codes:' || p_user_id::text, 0));

  delete from public.backup_codes where employee_id = p_user_id;

  insert into public.backup_codes (employee_id, code_hash, used)
  select p_user_id, hashes.code_hash, false
    from jsonb_array_elements_text(p_code_hashes) as hashes(code_hash);

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.replace_backup_codes(uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.replace_backup_codes(uuid, jsonb) to service_role;

comment on function public.replace_backup_codes(uuid, jsonb) is
  'Replaces a user backup-code set in one transaction so insert failure cannot erase valid codes.';

insert into public.portal_schema_versions (component, version, applied_at, details)
values (
  'api-security',
  20260812,
  now(),
  jsonb_build_object(
    'migration', '20260812_security_rate_limits.sql',
    'capabilities', jsonb_build_array('shared-rate-limits', 'atomic-backup-code-replacement')
  )
)
on conflict (component) do update
set version = excluded.version,
    applied_at = excluded.applied_at,
    details = excluded.details;

commit;
