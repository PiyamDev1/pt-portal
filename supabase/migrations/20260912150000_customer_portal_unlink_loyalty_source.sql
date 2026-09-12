begin;

create table public.customer_loyalty_unlinked_sources (
  source_reference text primary key,
  source_type text not null check (source_type in ('ticket', 'service', 'package')),
  source_namespace text,
  source_record_id uuid not null,
  customer_subject text not null,
  unlinked_at timestamptz not null default clock_timestamp(),
  check (
    (source_type = 'service' and source_namespace is not null)
    or (source_type in ('ticket', 'package') and source_namespace is null)
  )
);

alter table public.customer_loyalty_unlinked_sources enable row level security;
revoke all on table public.customer_loyalty_unlinked_sources
  from public, anon, authenticated, service_role;
grant select on table public.customer_loyalty_unlinked_sources to service_role;
create policy customer_loyalty_unlinked_sources_service_role
  on public.customer_loyalty_unlinked_sources
  for select to service_role using (true);

-- The account can be linked again for access, but a tombstoned source returns
-- no award and cannot run campaigns again.
create or replace function public.customer_loyalty_register_code_source_v1(
  p_customer_code text,
  p_source_type text,
  p_source_namespace text,
  p_source_record_id uuid,
  p_description text,
  p_points integer
)
returns public.customer_loyalty_awards
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  mobile_user_id_value uuid;
  normalized_code text := upper(btrim(coalesce(p_customer_code, '')));
  normalized_namespace text := nullif(lower(btrim(coalesce(p_source_namespace, ''))), '');
  source_reference_value text;
begin
  if normalized_code !~ '^PYM-[23456789A-HJ-NP-Z]{4}-[23456789A-HJ-NP-Z]{4}-[23456789A-HJ-NP-Z]$' then
    raise exception 'invalid customer code';
  end if;
  source_reference_value := public.customer_loyalty_source_reference_v1(
    p_source_type,
    normalized_namespace,
    p_source_record_id
  );
  perform pg_advisory_xact_lock(hashtextextended(
    'loyalty:unlink:' || p_source_type || ':' || coalesce(normalized_namespace, '-') || ':' || p_source_record_id::text,
    0
  ));
  if exists (
    select 1 from public.customer_loyalty_unlinked_sources
    where source_reference = source_reference_value
  ) then
    return null;
  end if;

  select id into mobile_user_id_value
  from public.mobile_users
  where customer_code = normalized_code
    and customer_lifecycle_status = 'active';
  if not found then raise exception 'active loyalty customer not found'; end if;

  return public.customer_loyalty_register_source_v1(
    mobile_user_id_value,
    p_source_type,
    normalized_namespace,
    p_source_record_id,
    p_description,
    p_points
  );
end;
$$;

-- Removing a saved customer item must also exhaust its loyalty source. Points
-- already spent on a voucher are retained, but are represented by a rank-
-- neutral balancing award so unlinking can never create a negative balance.
create or replace function public.customer_loyalty_unlink_source_v1(
  p_customer_subject text,
  p_source_type text,
  p_source_namespace text,
  p_source_record_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  normalized_namespace text := nullif(lower(btrim(coalesce(p_source_namespace, ''))), '');
  link_row public.customer_loyalty_source_links%rowtype;
  original public.customer_loyalty_awards%rowtype;
  retention public.customer_loyalty_awards%rowtype;
  retention_reference text;
  source_reference_value text;
  spent_points integer := 0;
  prior_earned_points integer := 0;
  retained_points integer := 0;
  removed_points integer := 0;
begin
  if nullif(btrim(coalesce(p_customer_subject, '')), '') is null
    or p_source_type not in ('ticket', 'service', 'package')
    or p_source_record_id is null then
    raise exception 'invalid customer loyalty unlink request'
      using errcode = '22023';
  end if;
  if p_source_type = 'service' and normalized_namespace is null then
    raise exception 'service loyalty source namespace is required'
      using errcode = '22023';
  end if;
  if p_source_type in ('ticket', 'package') and normalized_namespace is not null then
    raise exception 'non-service loyalty source cannot have a namespace'
      using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'loyalty:unlink:' || p_source_type || ':' || coalesce(normalized_namespace, '-') || ':' || p_source_record_id::text,
    0
  ));

  source_reference_value := public.customer_loyalty_source_reference_v1(
    p_source_type,
    normalized_namespace,
    p_source_record_id
  );
  insert into public.customer_loyalty_unlinked_sources (
    source_reference,
    source_type,
    source_namespace,
    source_record_id,
    customer_subject
  ) values (
    source_reference_value,
    p_source_type,
    normalized_namespace,
    p_source_record_id,
    btrim(p_customer_subject)
  ) on conflict (source_reference) do nothing;

  select source.* into link_row
  from public.customer_loyalty_source_links source
  join public.mobile_users member on member.id = source.mobile_user_id
  where member.external_customer_subject = btrim(p_customer_subject)
    and source.source_type = p_source_type
    and source.source_namespace is not distinct from normalized_namespace
    and source.source_record_id = p_source_record_id
  for update of source;

  if not found then
    return jsonb_build_object(
      'unlinked', true,
      'sourceHadPoints', false,
      'removedPoints', 0,
      'retainedRedeemedPoints', 0
    );
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'loyalty:progress:' || link_row.mobile_user_id::text,
    0
  ));

  select * into original
  from public.customer_loyalty_awards
  where source_reference = link_row.source_reference
  for update;
  if not found then
    raise exception 'loyalty source is missing its award';
  end if;

  retention_reference := 'unlink-retention.v1:' || original.id::text;
  if original.state = 'reversed' then
    select * into retention
    from public.customer_loyalty_awards
    where source_reference = retention_reference;
    return jsonb_build_object(
      'unlinked', true,
      'sourceHadPoints', true,
      'removedPoints', 0,
      'retainedRedeemedPoints', coalesce(retention.points, 0)
    );
  end if;

  if original.state = 'available' then
    select
      coalesce(abs(sum(award.points) filter (
        where award.points < 0
          and award.activation_milestone = 'voucher_redemption'
      )), 0)::integer,
      coalesce(sum(award.points) filter (
        where award.points > 0
          and (
            coalesce(award.activated_at, award.created_at), award.id
          ) < (
            coalesce(original.activated_at, original.created_at), original.id
          )
      ), 0)::integer
    into spent_points, prior_earned_points
    from public.customer_loyalty_awards award
    where award.mobile_user_id = original.mobile_user_id
      and award.state = 'available';

    retained_points := least(
      original.points,
      greatest(0, spent_points - prior_earned_points)
    );
    removed_points := original.points - retained_points;
  else
    removed_points := original.points;
  end if;

  perform public.customer_loyalty_award_reverse(
    original.source_reference,
    original.source_reference || ':account-unlink.v1',
    'Points removed because the item was unlinked from the customer account.'
  );

  if retained_points > 0 then
    insert into public.customer_loyalty_awards (
      mobile_user_id,
      source_type,
      source_reference,
      description,
      points,
      state,
      activation_milestone,
      created_at,
      activated_at
    ) values (
      original.mobile_user_id,
      'adjustment',
      retention_reference,
      'Redeemed points retained after unlinking an item',
      retained_points,
      'available',
      'voucher_redemption',
      original.created_at,
      coalesce(original.activated_at, original.created_at)
    )
    on conflict (source_reference) do nothing
    returning * into retention;

    if not found then
      select * into retention
      from public.customer_loyalty_awards
      where source_reference = retention_reference;
    end if;
    if retention.mobile_user_id is distinct from original.mobile_user_id
      or retention.points is distinct from retained_points
      or retention.state is distinct from 'available'
      or retention.activation_milestone is distinct from 'voucher_redemption' then
      raise exception 'loyalty unlink retention reference reused with different data';
    end if;

    insert into public.loyalty_points_ledger (
      mobile_user_id,
      transaction_type,
      points_change,
      reason,
      customer_state,
      customer_source_reference,
      customer_activation_milestone
    ) values (
      original.mobile_user_id,
      'Adjusted',
      retained_points,
      'Redeemed points retained after unlinking an item',
      'available',
      retention_reference,
      'voucher_redemption'
    ) on conflict (customer_source_reference)
      where customer_source_reference is not null
      do nothing;
  end if;

  perform public.customer_loyalty_reconcile_member_progress_v1(
    original.mobile_user_id,
    clock_timestamp()
  );

  return jsonb_build_object(
    'unlinked', true,
    'sourceHadPoints', true,
    'removedPoints', removed_points,
    'retainedRedeemedPoints', retained_points
  );
end;
$$;

revoke all on function public.customer_loyalty_unlink_source_v1(text,text,text,uuid)
  from public, anon, authenticated;
grant execute on function public.customer_loyalty_unlink_source_v1(text,text,text,uuid)
  to service_role;
revoke all on function public.customer_loyalty_register_code_source_v1(text,text,text,uuid,text,integer)
  from public, anon, authenticated;
grant execute on function public.customer_loyalty_register_code_source_v1(text,text,text,uuid,text,integer)
  to service_role;

commit;
