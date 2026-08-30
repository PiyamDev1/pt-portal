-- One-time production reset for the Commission module at capability 2026083004.
--
-- Run this entire file in the Supabase SQL editor. It deletes only the
-- employee Commission configuration and shadow-calculation records described
-- in the reset request. It also purges Commission source-event chains belonging
-- to Ticketing bookings that are already archived, so deleted ledger items
-- cannot remain visible to or be recalculated by Commission. Live Ticketing
-- rows, Ticketing audit history, Package source events, monthly exchange rates,
-- access grants, and existing Commission audit events are preserved.
--
-- The transaction deliberately refuses to run if the expected production
-- counts have changed, if a standalone Commission rule exists, or if any live
-- (payable) Commission entry exists. A complete recovery snapshot is written
-- to commission_audit_events before any records are deleted. Re-running the
-- file after a successful reset verifies the completed zero state and is safe.

begin;

select pg_advisory_xact_lock(hashtextextended('pt-portal:commission-profile-reset', 0));
select pg_advisory_xact_lock(hashtextextended('commission:shadow-worker', 0));

lock table
  public.employee_commission_profiles,
  public.employee_commission_assignments,
  public.commission_rules,
  public.commission_policy_versions,
  public.commission_policy_components,
  public.commission_policy_tiers,
  public.commission_entries,
  public.commission_period_results,
  public.commission_exceptions,
  public.commission_calculation_runs,
  public.commission_source_events,
  public.commission_source_event_states
in exclusive mode;

lock table
  public.ticket_bookings,
  public.ticket_transactions
in share mode;

do $reset_guard$
declare
  actor_id uuid;
  archived_ticket_event_ids uuid[];
  actual_state jsonb;
  expected_state constant jsonb := jsonb_build_object(
    'profiles', 2,
    'assignments', 14,
    'rules', 14,
    'versions', 14,
    'components', 14,
    'tiers', 2,
    'entries', 17,
    'periodResults', 0,
    'exceptions', 12,
    'calculationRuns', 6
  );
  completed_state constant jsonb := jsonb_build_object(
    'profiles', 0,
    'assignments', 0,
    'rules', 0,
    'versions', 0,
    'components', 0,
    'tiers', 0,
    'entries', 0,
    'periodResults', 0,
    'exceptions', 0,
    'calculationRuns', 0
  );
begin
  select coalesce(array_agg(source_event.id order by source_event.id), array[]::uuid[])
  into archived_ticket_event_ids
  from public.commission_source_events source_event
  where source_event.source_module = 'ticketing'
    and exists (
      select 1
      from public.ticket_bookings booking
      where booking.archived_at is not null
        and (
          source_event.source_record_id = booking.id
          or source_event.variables ->> 'booking_id' = booking.id::text
          or exists (
            select 1
            from public.ticket_transactions transaction
            where transaction.booking_id = booking.id
              and transaction.id = source_event.source_record_id
          )
        )
    );

  if (public.commission_schema_status() ->> 'version')::bigint <> 2026083004 then
    raise exception 'Expected Commission schema 2026083004 before reset; found %',
      public.commission_schema_status() ->> 'version'
      using errcode = '55000', hint = 'COMMISSION_RESET_SCHEMA_CHANGED';
  end if;

  if exists (select 1 from public.commission_rules where profile_id is null) then
    raise exception 'The reset will not delete standalone Commission rules'
      using errcode = '55000', hint = 'COMMISSION_RESET_STANDALONE_RULES';
  end if;

  if exists (select 1 from public.commission_entries where entry_mode = 'live') then
    raise exception 'The reset will not delete live or payable Commission entries'
      using errcode = '55000', hint = 'COMMISSION_RESET_LIVE_ENTRIES';
  end if;

  if exists (
    select 1
    from public.commission_source_events newer
    where newer.supersedes_event_id = any(archived_ticket_event_ids)
      and not (newer.id = any(archived_ticket_event_ids))
  ) then
    raise exception 'An active Ticketing source event depends on an archived Ticketing event'
      using errcode = '55000', hint = 'COMMISSION_RESET_ARCHIVED_EVENT_STILL_REFERENCED';
  end if;

  actual_state := jsonb_build_object(
    'profiles', (select count(*) from public.employee_commission_profiles),
    'assignments', (select count(*) from public.employee_commission_assignments),
    'rules', (select count(*) from public.commission_rules),
    'versions', (select count(*) from public.commission_policy_versions),
    'components', (select count(*) from public.commission_policy_components),
    'tiers', (select count(*) from public.commission_policy_tiers),
    'entries', (select count(*) from public.commission_entries),
    'periodResults', (select count(*) from public.commission_period_results),
    'exceptions', (select count(*) from public.commission_exceptions),
    'calculationRuns', (select count(*) from public.commission_calculation_runs)
  );

  if exists (
    select 1
    from public.commission_audit_events
    where action = 'employee_profiles.reset'
      and request_key = 'commission-profile-reset-20260830-01'
  ) then
    if actual_state is distinct from completed_state
      or cardinality(archived_ticket_event_ids) <> 0
    then
      raise exception 'Commission reset was already applied, but its completed state has changed. Found configuration % and % archived Ticketing source events',
        actual_state, cardinality(archived_ticket_event_ids)
        using errcode = '55000', hint = 'COMMISSION_RESET_COMPLETED_STATE_CHANGED';
    end if;

    raise notice 'Commission reset was already applied and the completed state is valid';
    return;
  end if;

  if actual_state is distinct from expected_state then
    raise exception 'Commission reset state changed. Expected %, found %',
      expected_state, actual_state
      using errcode = '55000', hint = 'COMMISSION_RESET_STATE_CHANGED';
  end if;

  select profile.created_by into actor_id
  from public.employee_commission_profiles profile
  order by profile.created_at, profile.id
  limit 1;

  if actor_id is null then
    raise exception 'No Commission profile creator is available for the reset audit event'
      using errcode = '55000';
  end if;

  insert into public.commission_audit_events (
    actor_employee_id,
    action,
    entity_type,
    entity_id,
    reason,
    before_state,
    after_state,
    request_key
  ) values (
    actor_id,
    'employee_profiles.reset',
    'commission_configuration',
    null,
    'Reset requested to rebuild employee Commission plans from scratch',
    jsonb_build_object(
      'summary', actual_state || jsonb_build_object(
        'shadowAmountGbp', (
          select coalesce(sum(entry.amount_gbp), 0)
          from public.commission_entries entry
          where entry.entry_mode = 'shadow'
        ),
        'sourceEvents', (select count(*) from public.commission_source_events),
        'archivedTicketingSourceEvents', cardinality(archived_ticket_event_ids),
        'monthlyExchangeRates', (
          select count(*) from public.commission_monthly_exchange_rates
        ),
        'accessGrants', (select count(*) from public.commission_access_grants)
      ),
      'profiles', coalesce((
        select jsonb_agg(to_jsonb(profile) order by profile.effective_from, profile.id)
        from public.employee_commission_profiles profile
      ), '[]'::jsonb),
      'assignments', coalesce((
        select jsonb_agg(to_jsonb(assignment) order by assignment.created_at, assignment.id)
        from public.employee_commission_assignments assignment
      ), '[]'::jsonb),
      'rules', coalesce((
        select jsonb_agg(to_jsonb(rule) order by rule.created_at, rule.id)
        from public.commission_rules rule
      ), '[]'::jsonb),
      'versions', coalesce((
        select jsonb_agg(to_jsonb(version_row) order by version_row.created_at, version_row.id)
        from public.commission_policy_versions version_row
      ), '[]'::jsonb),
      'components', coalesce((
        select jsonb_agg(to_jsonb(component) order by component.created_at, component.id)
        from public.commission_policy_components component
      ), '[]'::jsonb),
      'tiers', coalesce((
        select jsonb_agg(to_jsonb(tier) order by tier.created_at, tier.id)
        from public.commission_policy_tiers tier
      ), '[]'::jsonb),
      'entries', coalesce((
        select jsonb_agg(to_jsonb(entry) order by entry.created_at, entry.id)
        from public.commission_entries entry
      ), '[]'::jsonb),
      'periodResults', coalesce((
        select jsonb_agg(to_jsonb(result_row) order by result_row.created_at, result_row.id)
        from public.commission_period_results result_row
      ), '[]'::jsonb),
      'exceptions', coalesce((
        select jsonb_agg(to_jsonb(exception_row) order by exception_row.created_at, exception_row.id)
        from public.commission_exceptions exception_row
      ), '[]'::jsonb),
      'calculationRuns', coalesce((
        select jsonb_agg(to_jsonb(run_row) order by run_row.started_at, run_row.id)
        from public.commission_calculation_runs run_row
      ), '[]'::jsonb),
      'archivedTicketingSourceEvents', coalesce((
        select jsonb_agg(to_jsonb(source_event) order by source_event.created_at, source_event.id)
        from public.commission_source_events source_event
        where source_event.id = any(archived_ticket_event_ids)
      ), '[]'::jsonb),
      'archivedTicketingSourceEventStates', coalesce((
        select jsonb_agg(to_jsonb(source_state) order by source_state.event_id)
        from public.commission_source_event_states source_state
        where source_state.event_id = any(archived_ticket_event_ids)
      ), '[]'::jsonb)
    ),
    jsonb_build_object(
      'profiles', 0,
      'mode', 'shadow',
      'archivedTicketingSourceEventsPurged', cardinality(archived_ticket_event_ids),
      'liveTicketingSourceEventsPreserved', true,
      'packageSourceEventsPreserved', true,
      'ticketingRecordsPreserved', true,
      'monthlyExchangeRatesPreserved', true,
      'accessGrantsPreserved', true
    ),
    'commission-profile-reset-20260830-01'
  );
end
$reset_guard$;

-- These triggers normally protect immutable calculation and profile history.
-- They are disabled only within this transaction and are restored before the
-- transaction commits. Any error rolls back both the data changes and trigger
-- state changes.
alter table public.commission_entries
  disable trigger commission_entries_immutable_2901;
alter table public.commission_period_results
  disable trigger commission_period_results_immutable_2901;
alter table public.commission_policy_tiers
  disable trigger commission_policy_tiers_draft_guard_2901;
alter table public.commission_policy_components
  disable trigger commission_policy_components_draft_guard_2901;
alter table public.commission_policy_versions
  disable trigger commission_policy_versions_guard_2901;
alter table public.commission_policy_versions
  disable trigger commission_policy_versions_profile_guard_2904;
alter table public.employee_commission_profiles
  disable trigger employee_commission_profiles_guard_2904;
alter table public.commission_source_event_states
  disable trigger commission_source_event_states_protect_delete;
alter table public.commission_source_events
  disable trigger commission_source_events_immutable;

delete from public.commission_exceptions;
delete from public.commission_entries;
delete from public.commission_period_results;
delete from public.commission_calculation_runs;
delete from public.employee_commission_assignments;
delete from public.commission_policy_tiers;
delete from public.commission_policy_components;
delete from public.commission_policy_versions;
delete from public.commission_rules;

-- Remove only Commission source records belonging to Ticketing bookings that
-- were already archived. The operational booking and audit rows remain intact.
delete from public.commission_source_event_states source_state
using public.commission_source_events source_event
where source_state.event_id = source_event.id
  and source_event.source_module = 'ticketing'
  and exists (
    select 1
    from public.ticket_bookings booking
    where booking.archived_at is not null
      and (
        source_event.source_record_id = booking.id
        or source_event.variables ->> 'booking_id' = booking.id::text
        or exists (
          select 1
          from public.ticket_transactions transaction
          where transaction.booking_id = booking.id
            and transaction.id = source_event.source_record_id
        )
      )
  );

delete from public.commission_source_events source_event
where source_event.source_module = 'ticketing'
  and exists (
    select 1
    from public.ticket_bookings booking
    where booking.archived_at is not null
      and (
        source_event.source_record_id = booking.id
        or source_event.variables ->> 'booking_id' = booking.id::text
        or exists (
          select 1
          from public.ticket_transactions transaction
          where transaction.booking_id = booking.id
            and transaction.id = source_event.source_record_id
        )
      )
  );

-- Remove the self-reference before deleting all copied profile snapshots.
update public.employee_commission_profiles
set copied_from_profile_id = null
where copied_from_profile_id is not null;

delete from public.employee_commission_profiles;

alter table public.commission_entries
  enable trigger commission_entries_immutable_2901;
alter table public.commission_period_results
  enable trigger commission_period_results_immutable_2901;
alter table public.commission_policy_tiers
  enable trigger commission_policy_tiers_draft_guard_2901;
alter table public.commission_policy_components
  enable trigger commission_policy_components_draft_guard_2901;
alter table public.commission_policy_versions
  enable trigger commission_policy_versions_guard_2901;
alter table public.commission_policy_versions
  enable trigger commission_policy_versions_profile_guard_2904;
alter table public.employee_commission_profiles
  enable trigger employee_commission_profiles_guard_2904;
alter table public.commission_source_event_states
  enable trigger commission_source_event_states_protect_delete;
alter table public.commission_source_events
  enable trigger commission_source_events_immutable;

-- Current, calculable source facts wait for a new employee plan. Remaining
-- superseded facts stay processed; archived Ticketing chains were purged above,
-- so deleted Ticketing rows cannot be resurrected as ghost Commission earnings.
update public.commission_source_event_states state
set processing_status = case
      when event.event_type in (
        'ticket_issued',
        'ticket_sale_completed',
        'ticket_date_changed',
        'ticket_reissued',
        'ticket_low_fare_adjusted',
        'ticket_higher_fare_adjusted',
        'package_closed'
      )
      and not exists (
        select 1
        from public.commission_source_events newer
        where newer.supersedes_event_id = event.id
      ) then 'held'
      else 'processed'
    end,
    attempt_count = 0,
    next_attempt_at = null,
    last_error = case
      when event.event_type in (
        'ticket_issued',
        'ticket_sale_completed',
        'ticket_date_changed',
        'ticket_reissued',
        'ticket_low_fare_adjusted',
        'ticket_higher_fare_adjusted',
        'package_closed'
      )
      and not exists (
        select 1
        from public.commission_source_events newer
        where newer.supersedes_event_id = event.id
      ) then 'needs_policy'
      else null
    end,
    updated_at = clock_timestamp()
from public.commission_source_events event
where state.event_id = event.id;

do $reset_verification$
begin
  if exists (select 1 from public.employee_commission_profiles)
    or exists (select 1 from public.employee_commission_assignments)
    or exists (select 1 from public.commission_rules)
    or exists (select 1 from public.commission_policy_versions)
    or exists (select 1 from public.commission_policy_components)
    or exists (select 1 from public.commission_policy_tiers)
    or exists (select 1 from public.commission_entries)
    or exists (select 1 from public.commission_period_results)
    or exists (select 1 from public.commission_exceptions)
    or exists (select 1 from public.commission_calculation_runs)
    or exists (
      select 1
      from public.commission_source_events source_event
      where source_event.source_module = 'ticketing'
        and exists (
          select 1
          from public.ticket_bookings booking
          where booking.archived_at is not null
            and (
              source_event.source_record_id = booking.id
              or source_event.variables ->> 'booking_id' = booking.id::text
              or exists (
                select 1
                from public.ticket_transactions transaction
                where transaction.booking_id = booking.id
                  and transaction.id = source_event.source_record_id
              )
            )
        )
    )
  then
    raise exception 'Commission reset verification failed; rolling back'
      using errcode = '55000';
  end if;

  if not exists (
    select 1
    from public.commission_audit_events
    where action = 'employee_profiles.reset'
      and request_key = 'commission-profile-reset-20260830-01'
  ) then
    raise exception 'Commission reset audit snapshot is missing; rolling back'
      using errcode = '55000';
  end if;
end
$reset_verification$;

commit;

-- The SQL editor returns this one-row summary after a successful reset.
select
  (select count(*) from public.employee_commission_profiles) as profiles,
  (select count(*) from public.employee_commission_assignments) as assignments,
  (select count(*) from public.commission_rules) as rules,
  (select count(*) from public.commission_entries) as entries,
  (select count(*) from public.commission_exceptions) as exceptions,
  (select count(*) from public.commission_calculation_runs) as calculation_runs,
  (select count(*) from public.commission_source_events) as preserved_source_events,
  (select count(*) from public.commission_source_event_states
    where processing_status = 'held') as events_waiting_for_new_plan,
  (select count(*) from public.commission_audit_events
    where action = 'employee_profiles.reset'
      and request_key = 'commission-profile-reset-20260830-01') as recovery_snapshots,
  (select coalesce(
      (audit_event.before_state #>> '{summary,archivedTicketingSourceEvents}')::bigint,
      0
    )
    from public.commission_audit_events audit_event
    where audit_event.action = 'employee_profiles.reset'
      and audit_event.request_key = 'commission-profile-reset-20260830-01'
    order by audit_event.created_at desc
    limit 1) as purged_archived_ticketing_source_events;
