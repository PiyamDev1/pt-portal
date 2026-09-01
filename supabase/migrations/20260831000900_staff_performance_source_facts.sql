-- Current, employee-scoped operational facts for the My Performance workspace.
-- Earnings remain in Commission; this read boundary follows the employee who
-- performed or owned the source work, including ticket assistants.

begin;
create or replace function public.staff_performance_source_facts_2026083101(
  p_employee_id uuid,
  p_effective_from date,
  p_effective_to date
)
returns table (
  id uuid,
  source_module text,
  source_fact_key text,
  source_record_id uuid,
  event_type text,
  event_version integer,
  employee_id uuid,
  owner_employee_id uuid,
  effective_on date,
  source_path text,
  variables jsonb,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
set row_security = off
as $function$
begin
  if p_employee_id is null or p_effective_from is null or p_effective_to is null then
    raise exception 'Performance employee and reporting dates are required'
      using errcode = '22023';
  end if;
  if p_effective_to < p_effective_from
    or p_effective_to - p_effective_from > 400
  then
    raise exception 'Performance reporting range must be between 1 and 401 days'
      using errcode = '22023';
  end if;
  if not exists (
    select 1
    from public.employees employee
    where employee.id = p_employee_id
  ) then
    raise exception 'Performance employee was not found' using errcode = 'P0002';
  end if;

  return query
  with current_facts as (
    select distinct on (source_event.source_module, source_event.source_fact_key)
      source_event.*
    from public.commission_source_events source_event
    order by
      source_event.source_module,
      source_event.source_fact_key,
      source_event.event_version desc,
      source_event.created_at desc,
      source_event.id desc
  ), resolved_members as (
    select
      package_group.id as group_id,
      package_group.status as group_status,
      package_group.archived_at as group_archived_at,
      package_group.customer_package_id,
      package_group.lead_package_id,
      package_group.lead_quote_id,
      member.id as member_id,
      member.is_lead_family,
      member.sort_order,
      member.created_at,
      case
        when member.package_id is not null
          and member_quote.converted_package_id is not null
          and member.package_id <> member_quote.converted_package_id
          then null
        else coalesce(member.package_id, member_quote.converted_package_id)
      end as package_id,
      member.package_id is not null
        and member_quote.converted_package_id is not null
        and member.package_id <> member_quote.converted_package_id as bad_link,
      lead_quote.converted_package_id as lead_quote_package_id
    from public.travel_package_groups package_group
    join public.travel_package_group_members member
      on member.group_id = package_group.id
    left join public.travel_package_quotes member_quote
      on member_quote.id = member.quote_id
    left join public.travel_package_quotes lead_quote
      on lead_quote.id = package_group.lead_quote_id
  ), group_shapes as (
    select
      resolved.group_id,
      resolved.group_status,
      resolved.group_archived_at,
      resolved.customer_package_id,
      resolved.lead_package_id,
      resolved.lead_quote_id,
      resolved.lead_quote_package_id,
      bool_or(resolved.bad_link) as has_bad_link,
      count(*) filter (where resolved.package_id is null) as unresolved_member_count,
      coalesce(
        resolved.customer_package_id,
        resolved.lead_package_id,
        resolved.lead_quote_package_id,
        (
          array_agg(
            resolved.package_id
            order by resolved.is_lead_family desc,
              resolved.sort_order,
              resolved.created_at,
              resolved.member_id
          ) filter (where resolved.package_id is not null)
        )[1]
      ) as canonical_package_id
    from resolved_members resolved
    group by
      resolved.group_id,
      resolved.group_status,
      resolved.group_archived_at,
      resolved.customer_package_id,
      resolved.lead_package_id,
      resolved.lead_quote_id,
      resolved.lead_quote_package_id
  ), group_package_ids as (
    select distinct resolved.group_id, resolved.package_id
    from resolved_members resolved
    where resolved.package_id is not null
    union
    select package_folder.group_id, package_folder.id
    from public.travel_packages package_folder
    where package_folder.group_id is not null
    union
    select shape.group_id, shape.customer_package_id
    from group_shapes shape
    where shape.customer_package_id is not null
    union
    select shape.group_id, shape.lead_package_id
    from group_shapes shape
    where shape.lead_package_id is not null
    union
    select shape.group_id, shape.lead_quote_package_id
    from group_shapes shape
    where shape.lead_quote_package_id is not null
  ), package_group_ambiguity as (
    select link.package_id, count(*)::integer as active_group_count
    from group_package_ids link
    join public.travel_package_groups package_group
      on package_group.id = link.group_id
    where package_group.archived_at is null
      and package_group.status not in ('archived', 'cancelled')
    group by link.package_id
  ), live_package_facts as (
    select
      package_folder.id as package_id,
      coalesce(
        package_folder.sales_responsible_employee_id,
        package_folder.sales_employee_id
      ) as owner_employee_id,
      coalesce(package_folder.earned_at, package_folder.closed_at)::date as effective_on,
      current_fact.id,
      current_fact.event_version,
      current_fact.source_path,
      current_fact.variables,
      current_fact.created_at
    from public.travel_packages package_folder
    join current_facts current_fact
      on current_fact.source_module = 'packages'
      and current_fact.source_fact_key = 'package-sale:' || package_folder.id::text
    where package_folder.status = 'closed'
      and package_folder.archived_at is null
      and coalesce(package_folder.earned_at, package_folder.closed_at) is not null
      and coalesce(
        package_folder.sales_responsible_employee_id,
        package_folder.sales_employee_id
      ) is not null
      and current_fact.event_type = 'package_closed'
      and current_fact.variables @> '{"authoritative":true}'::jsonb
  ), individual_package_facts as (
    select
      live_fact.id,
      'packages'::text as source_module,
      'package-sale:' || live_fact.package_id::text as source_fact_key,
      live_fact.package_id as source_record_id,
      'package_closed'::text as event_type,
      live_fact.event_version,
      live_fact.owner_employee_id as employee_id,
      live_fact.owner_employee_id,
      live_fact.effective_on,
      live_fact.source_path,
      live_fact.variables || jsonb_build_object(
        'group_id', null,
        'passenger_count', passenger_totals.passenger_count,
        'sales_employee_id', live_fact.owner_employee_id,
        'performance_group_aggregate', false
      ) as variables,
      live_fact.created_at
    from live_package_facts live_fact
    cross join lateral (
      select count(*)::integer as passenger_count
      from public.travel_package_passengers passenger
      where passenger.package_id = live_fact.package_id
    ) passenger_totals
    where not exists (
      select 1
      from group_package_ids link
      where link.package_id = live_fact.package_id
    )
  ), group_rollups as (
    select
      shape.group_id,
      shape.canonical_package_id,
      count(distinct passenger.id)::integer as passenger_count,
      max(live_fact.effective_on) as effective_on,
      max(live_fact.created_at) as latest_created_at
    from group_shapes shape
    join group_package_ids link
      on link.group_id = shape.group_id
    left join live_package_facts live_fact
      on live_fact.package_id = link.package_id
    left join public.travel_package_passengers passenger
      on passenger.package_id = link.package_id
    left join package_group_ambiguity ambiguity
      on ambiguity.package_id = link.package_id
    where shape.group_archived_at is null
      and shape.group_status not in ('archived', 'cancelled')
      and not shape.has_bad_link
      and shape.unresolved_member_count = 0
      and shape.canonical_package_id is not null
    group by shape.group_id, shape.canonical_package_id
    having count(distinct link.package_id) > 0
      and count(distinct link.package_id) = count(distinct live_fact.package_id)
      and coalesce(max(ambiguity.active_group_count), 0) <= 1
  ), grouped_package_facts as (
    select
      canonical_fact.id,
      'packages'::text as source_module,
      'package-group:' || rollup.group_id::text as source_fact_key,
      rollup.canonical_package_id as source_record_id,
      'package_closed'::text as event_type,
      canonical_fact.event_version,
      canonical_fact.owner_employee_id as employee_id,
      canonical_fact.owner_employee_id,
      rollup.effective_on,
      '/dashboard/packages/groups/' || rollup.group_id::text as source_path,
      canonical_fact.variables || jsonb_build_object(
        'group_id', rollup.group_id,
        'passenger_count', rollup.passenger_count,
        'sales_employee_id', canonical_fact.owner_employee_id,
        'performance_group_aggregate', true
      ) as variables,
      rollup.latest_created_at as created_at
    from group_rollups rollup
    join live_package_facts canonical_fact
      on canonical_fact.package_id = rollup.canonical_package_id
  ), reporting_facts as (
    select
      current_fact.id,
      current_fact.source_module,
      current_fact.source_fact_key,
      current_fact.source_record_id,
      current_fact.event_type,
      current_fact.event_version,
      current_fact.employee_id,
      current_fact.owner_employee_id,
      current_fact.effective_on,
      current_fact.source_path,
      current_fact.variables,
      current_fact.created_at
    from current_facts current_fact
    where current_fact.source_module = 'applications'
      or (
        current_fact.source_module = 'ticketing'
        and current_fact.event_type in ('ticket_issued', 'ticket_date_changed', 'ticket_reissued')
      )
    union all
    select * from individual_package_facts
    union all
    select * from grouped_package_facts
  )
  select
    reporting_fact.id,
    reporting_fact.source_module,
    reporting_fact.source_fact_key,
    reporting_fact.source_record_id,
    reporting_fact.event_type,
    reporting_fact.event_version,
    reporting_fact.employee_id,
    reporting_fact.owner_employee_id,
    reporting_fact.effective_on,
    reporting_fact.source_path,
    reporting_fact.variables,
    reporting_fact.created_at
  from reporting_facts reporting_fact
  where reporting_fact.effective_on between p_effective_from and p_effective_to
    and (
      reporting_fact.employee_id = p_employee_id
      or reporting_fact.owner_employee_id = p_employee_id
      or reporting_fact.variables ->> 'primary_responsible_employee_id' = p_employee_id::text
      or reporting_fact.variables ->> 'responsible_employee_id' = p_employee_id::text
      or reporting_fact.variables ->> 'sales_employee_id' = p_employee_id::text
      or reporting_fact.variables ->> 'acting_employee_id' = p_employee_id::text
      or exists (
        select 1
        from jsonb_array_elements_text(
          case
            when jsonb_typeof(reporting_fact.variables -> 'assistant_employee_ids') = 'array'
              then reporting_fact.variables -> 'assistant_employee_ids'
            else '[]'::jsonb
          end
        ) assistant(employee_id)
        where assistant.employee_id = p_employee_id::text
      )
    )
  order by reporting_fact.effective_on desc, reporting_fact.created_at desc, reporting_fact.id desc;
end
$function$;
comment on function public.staff_performance_source_facts_2026083101(uuid,date,date) is
  'Returns only the current immutable source-fact tails attributable to one employee. Redirected Commission recipients do not change work ownership.';
revoke all on function public.staff_performance_source_facts_2026083101(uuid,date,date)
  from public, anon, authenticated;
grant execute on function public.staff_performance_source_facts_2026083101(uuid,date,date)
  to service_role;
create or replace function public.staff_performance_timeclock_events_2026083101(
  p_employee_id uuid,
  p_effective_from timestamptz,
  p_effective_to timestamptz
)
returns table (
  id uuid,
  event_type text,
  punch_type text,
  scanned_at timestamptz,
  adjusted_scanned_at timestamptz,
  device_ts timestamptz,
  adjusted_device_ts timestamptz,
  effective_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
set row_security = off
as $function$
begin
  if p_employee_id is null or p_effective_from is null or p_effective_to is null then
    raise exception 'Performance employee and timeclock boundaries are required'
      using errcode = '22023';
  end if;
  if p_effective_to <= p_effective_from
    or p_effective_to - p_effective_from > interval '403 days'
  then
    raise exception 'Performance timeclock range must be positive and no longer than 403 days'
      using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.employees employee where employee.id = p_employee_id
  ) then
    raise exception 'Performance employee was not found' using errcode = 'P0002';
  end if;

  return query
  select
    timeclock.id,
    timeclock.event_type,
    timeclock.punch_type,
    timeclock.scanned_at,
    timeclock.adjusted_scanned_at,
    timeclock.device_ts,
    timeclock.adjusted_device_ts,
    coalesce(
      timeclock.adjusted_scanned_at,
      timeclock.scanned_at,
      timeclock.adjusted_device_ts,
      timeclock.device_ts
    ) as effective_at
  from public.timeclock_events timeclock
  where timeclock.employee_id = p_employee_id
    and coalesce(
      timeclock.adjusted_scanned_at,
      timeclock.scanned_at,
      timeclock.adjusted_device_ts,
      timeclock.device_ts
    ) >= p_effective_from
    and coalesce(
      timeclock.adjusted_scanned_at,
      timeclock.scanned_at,
      timeclock.adjusted_device_ts,
      timeclock.device_ts
    ) < p_effective_to
  order by
    coalesce(
      timeclock.adjusted_scanned_at,
      timeclock.scanned_at,
      timeclock.adjusted_device_ts,
      timeclock.device_ts
    ),
    timeclock.scanned_at,
    timeclock.id;
end
$function$;
comment on function public.staff_performance_timeclock_events_2026083101(uuid,timestamptz,timestamptz) is
  'Returns employee-scoped punches filtered by their canonical adjusted timestamp for private performance reporting.';
revoke all on function public.staff_performance_timeclock_events_2026083101(uuid,timestamptz,timestamptz)
  from public, anon, authenticated;
grant execute on function public.staff_performance_timeclock_events_2026083101(uuid,timestamptz,timestamptz)
  to service_role;
commit;
