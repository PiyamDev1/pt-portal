-- Forward-only Ticketing capability 2026082902.
-- Keeps Ticketing package scope aligned with exact flight-reservation PNRs entered in Packages.

begin;

select pg_advisory_xact_lock(hashtextextended('ticketing:schema-migration', 0));

do $ticketing_package_reconciliation_forward_guard$
declare
  installed_version bigint;
begin
  select version into installed_version
  from public.portal_schema_versions
  where component = 'ticketing'
  for update;

  if installed_version is null or installed_version < 2026082901 then
    raise exception 'Ticketing capability 2026082901 is required before package reconciliation capability 2026082902'
      using errcode = '55000', hint = 'TICKETING_SCHEMA_NOT_READY';
  end if;
  if installed_version > 2026082902 then
    raise exception 'Ticketing migration capability % cannot run after installed capability %',
      2026082902, installed_version
      using errcode = '55000', hint = 'TICKETING_FORWARD_MIGRATION_REPLAY_BLOCKED';
  end if;
end
$ticketing_package_reconciliation_forward_guard$;

create or replace function public.ticketing_reconcile_package_booking_2026082902(
  p_booking_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
set row_security = off
as $$
declare
  booking_row public.ticket_bookings%rowtype;
  actor_employee_id_value uuid;
  candidate_count integer := 0;
  candidate_package_count integer := 0;
  common_group_count integer := 0;
  matched_group_id uuid;
  selected_reservation_id uuid;
  selected_package_id uuid;
  selected_package_type text;
  selected_package_reference text;
  desired_match_status text := 'unmatched';
  desired_commission_scope text := 'ticket';
  active_link_count integer := 0;
  desired_link_ids jsonb := '[]'::jsonb;
  before_state jsonb;
  after_state jsonb;
  candidate record;
begin
  if p_booking_id is null then
    raise exception 'Booking is required' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('ticketing:package:' || p_booking_id::text, 0));

  select * into booking_row
  from public.ticket_bookings
  where id = p_booking_id
  for update;

  if not found then
    raise exception 'Ticket booking was not found' using errcode = 'P0002';
  end if;
  if booking_row.archived_at is not null then
    return jsonb_build_object(
      'bookingId', booking_row.id,
      'status', booking_row.package_match_status,
      'scope', booking_row.commission_scope,
      'changed', false,
      'archived', true
    );
  end if;

  -- A still-valid manual resolution remains authoritative. Invalid evidence is retired by the
  -- package mutation trigger before this function runs.
  if exists (
    select 1
    from public.ticket_package_links link
    join public.travel_package_reservations reservation
      on reservation.id = link.reservation_id
      and reservation.package_id = link.package_id
    join public.travel_packages package on package.id = link.package_id
    where link.booking_id = booking_row.id
      and link.match_status = 'matched'
      and link.resolution_method = 'manual'
      and link.retired_at is null
      and reservation.normalized_booking_reference = booking_row.normalized_pnr
      and reservation.reservation_type = 'flight'
      and lower(btrim(reservation.status)) not in ('cancelled', 'failed')
      and lower(btrim(package.package_type)) in ('umrah', 'holiday', 'ziyarat')
      and lower(btrim(package.status)) not in ('cancelled', 'archived')
  ) then
    return jsonb_build_object(
      'bookingId', booking_row.id,
      'status', 'manually_resolved',
      'scope', 'package',
      'changed', false,
      'manualResolutionPreserved', true
    );
  end if;

  lock table
    public.travel_package_reservations,
    public.travel_packages,
    public.travel_package_groups,
    public.travel_package_group_members
  in share mode;

  select count(*)::integer, count(distinct package.id)::integer
  into candidate_count, candidate_package_count
  from public.travel_package_reservations reservation
  join public.travel_packages package on package.id = reservation.package_id
  where reservation.normalized_booking_reference = booking_row.normalized_pnr
    and reservation.reservation_type = 'flight'
    and lower(btrim(reservation.status)) not in ('cancelled', 'failed')
    and lower(btrim(package.package_type)) in ('umrah', 'holiday', 'ziyarat')
    and lower(btrim(package.status)) not in ('cancelled', 'archived');

  if candidate_package_count > 1 then
    select
      count(*)::integer,
      (array_agg(common_group.group_id order by common_group.group_id))[1]
    into common_group_count, matched_group_id
    from (
      select membership.group_id
      from public.travel_package_group_members membership
      join public.travel_package_groups package_group
        on package_group.id = membership.group_id
      join (
        select distinct package.id as package_id
        from public.travel_package_reservations reservation
        join public.travel_packages package on package.id = reservation.package_id
        where reservation.normalized_booking_reference = booking_row.normalized_pnr
          and reservation.reservation_type = 'flight'
          and lower(btrim(reservation.status)) not in ('cancelled', 'failed')
          and lower(btrim(package.package_type)) in ('umrah', 'holiday', 'ziyarat')
          and lower(btrim(package.status)) not in ('cancelled', 'archived')
      ) candidate_package on candidate_package.package_id = membership.package_id
      where lower(btrim(package_group.status)) not in ('cancelled', 'archived')
      group by membership.group_id
      having count(distinct membership.package_id) = candidate_package_count
    ) common_group;

    if common_group_count <> 1 then
      matched_group_id := null;
    end if;
  end if;

  if candidate_count > 0
    and (candidate_package_count = 1 or matched_group_id is not null)
  then
    desired_match_status := 'matched';
    desired_commission_scope := 'package';

    select
      reservation.id,
      package.id,
      lower(btrim(package.package_type)),
      package.package_reference
    into
      selected_reservation_id,
      selected_package_id,
      selected_package_type,
      selected_package_reference
    from public.travel_package_reservations reservation
    join public.travel_packages package on package.id = reservation.package_id
    left join public.travel_package_group_members membership
      on membership.package_id = package.id
      and membership.group_id = matched_group_id
    where reservation.normalized_booking_reference = booking_row.normalized_pnr
      and reservation.reservation_type = 'flight'
      and lower(btrim(reservation.status)) not in ('cancelled', 'failed')
      and lower(btrim(package.package_type)) in ('umrah', 'holiday', 'ziyarat')
      and lower(btrim(package.status)) not in ('cancelled', 'archived')
    order by
      case when coalesce(membership.is_lead_family, false) then 0 else 1 end,
      membership.sort_order nulls last,
      package.id,
      reservation.id
    limit 1;
  elsif candidate_count > 1 then
    desired_match_status := 'ambiguous';
    desired_commission_scope := 'unresolved';
  end if;

  select count(*)::integer into active_link_count
  from public.ticket_package_links link
  where link.booking_id = booking_row.id
    and link.retired_at is null;

  if desired_match_status = 'unmatched'
    and booking_row.package_match_status = 'unmatched'
    and booking_row.commission_scope = 'ticket'
    and active_link_count = 0
  then
    return jsonb_build_object(
      'bookingId', booking_row.id,
      'status', 'unmatched',
      'scope', 'ticket',
      'changed', false
    );
  end if;

  if desired_match_status = 'matched'
    and booking_row.package_match_status = 'matched'
    and booking_row.commission_scope = 'package'
    and active_link_count = 1
    and exists (
      select 1
      from public.ticket_package_links link
      join public.travel_package_reservations reservation on reservation.id = link.reservation_id
      where link.booking_id = booking_row.id
        and link.match_status = 'matched'
        and link.resolution_method = 'automatic'
        and link.retired_at is null
        and reservation.normalized_booking_reference = booking_row.normalized_pnr
        and (
          candidate_package_count = 1
          or link.group_id = matched_group_id
        )
    )
  then
    return jsonb_build_object(
      'bookingId', booking_row.id,
      'status', 'matched',
      'scope', 'package',
      'changed', false
    );
  end if;

  if desired_match_status = 'ambiguous'
    and booking_row.package_match_status = 'ambiguous'
    and booking_row.commission_scope = 'unresolved'
    and active_link_count = candidate_count
    and not exists (
      select 1
      from public.travel_package_reservations reservation
      join public.travel_packages package on package.id = reservation.package_id
      where reservation.normalized_booking_reference = booking_row.normalized_pnr
        and reservation.reservation_type = 'flight'
        and lower(btrim(reservation.status)) not in ('cancelled', 'failed')
        and lower(btrim(package.package_type)) in ('umrah', 'holiday', 'ziyarat')
        and lower(btrim(package.status)) not in ('cancelled', 'archived')
        and not exists (
          select 1
          from public.ticket_package_links link
          where link.booking_id = booking_row.id
            and link.reservation_id = reservation.id
            and link.match_status = 'ambiguous'
            and link.retired_at is null
        )
    )
  then
    return jsonb_build_object(
      'bookingId', booking_row.id,
      'status', 'ambiguous',
      'scope', 'unresolved',
      'changed', false
    );
  end if;

  select jsonb_build_object(
    'package_match_status', booking_row.package_match_status,
    'commission_scope', booking_row.commission_scope,
    'active_link_ids', coalesce(jsonb_agg(link.id order by link.id)
      filter (where link.id is not null), '[]'::jsonb)
  )
  into before_state
  from public.ticket_package_links link
  where link.booking_id = booking_row.id
    and link.retired_at is null;

  update public.ticket_package_links
  set match_status = 'retired', retired_at = now()
  where booking_id = booking_row.id
    and retired_at is null;

  if desired_match_status = 'matched' then
    insert into public.ticket_package_links (
      booking_id,
      package_id,
      reservation_id,
      group_id,
      match_status,
      resolution_method,
      matched_pnr
    ) values (
      booking_row.id,
      selected_package_id,
      selected_reservation_id,
      matched_group_id,
      'matched',
      'automatic',
      booking_row.normalized_pnr
    );
  elsif desired_match_status = 'ambiguous' then
    for candidate in
      select reservation.id as reservation_id, package.id as package_id
      from public.travel_package_reservations reservation
      join public.travel_packages package on package.id = reservation.package_id
      where reservation.normalized_booking_reference = booking_row.normalized_pnr
        and reservation.reservation_type = 'flight'
        and lower(btrim(reservation.status)) not in ('cancelled', 'failed')
        and lower(btrim(package.package_type)) in ('umrah', 'holiday', 'ziyarat')
        and lower(btrim(package.status)) not in ('cancelled', 'archived')
      order by package.id, reservation.id
    loop
      insert into public.ticket_package_links (
        booking_id,
        package_id,
        reservation_id,
        match_status,
        resolution_method,
        matched_pnr
      ) values (
        booking_row.id,
        candidate.package_id,
        candidate.reservation_id,
        'ambiguous',
        'automatic',
        booking_row.normalized_pnr
      );
    end loop;
  end if;

  -- Package mutations can arrive through authenticated, service, migration, or background paths.
  -- Retain the ticket's last recorded updater as the accountable employee and label this event as
  -- automatic rather than pretending the database trigger is that person.
  actor_employee_id_value := booking_row.updated_by;

  update public.ticket_bookings
  set package_match_status = desired_match_status,
      commission_scope = desired_commission_scope,
      updated_by = actor_employee_id_value
  where id = booking_row.id;

  select coalesce(jsonb_agg(link.id order by link.id), '[]'::jsonb)
  into desired_link_ids
  from public.ticket_package_links link
  where link.booking_id = booking_row.id
    and link.retired_at is null;

  after_state := jsonb_build_object(
    'package_match_status', desired_match_status,
    'commission_scope', desired_commission_scope,
    'active_link_ids', desired_link_ids,
    'package_id', selected_package_id,
    'reservation_id', selected_reservation_id,
    'group_id', matched_group_id,
    'package_type', selected_package_type,
    'package_reference', selected_package_reference
  );

  insert into public.ticket_audit_events (
    entity_type,
    entity_id,
    booking_id,
    action,
    actor_employee_id,
    reason,
    before_state,
    after_state
  ) values (
    'booking',
    booking_row.id,
    booking_row.id,
    'auto_reconcile_package_pnr',
    actor_employee_id_value,
    'Exact package flight-reservation PNR reconciliation',
    before_state,
    after_state
  );

  return jsonb_build_object(
    'bookingId', booking_row.id,
    'status', desired_match_status,
    'scope', desired_commission_scope,
    'changed', true,
    'packageId', selected_package_id,
    'reservationId', selected_reservation_id,
    'groupId', matched_group_id,
    'activeLinkIds', desired_link_ids
  );
end
$$;

create or replace function public.ticketing_retire_changed_package_links_2026082902()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
set row_security = off
as $$
begin
  if tg_table_name = 'travel_package_reservations' then
    if new.package_id is distinct from old.package_id
      or new.reservation_type is distinct from old.reservation_type
      or public.normalize_ticket_pnr_v1(new.booking_reference)
        is distinct from public.normalize_ticket_pnr_v1(old.booking_reference)
      or lower(btrim(new.status)) is distinct from lower(btrim(old.status))
    then
      update public.ticket_package_links
      set match_status = 'retired', retired_at = now()
      where reservation_id = old.id
        and retired_at is null;
    end if;
  elsif tg_table_name = 'travel_packages' then
    if new.package_reference is distinct from old.package_reference
      or lower(btrim(new.package_type)) is distinct from lower(btrim(old.package_type))
      or lower(btrim(new.status)) is distinct from lower(btrim(old.status))
    then
      update public.ticket_package_links
      set match_status = 'retired', retired_at = now()
      where package_id = old.id
        and retired_at is null;
    end if;
  elsif tg_table_name = 'travel_package_group_members' then
    update public.ticket_package_links
    set match_status = 'retired', retired_at = now()
    where group_id = old.group_id
      and retired_at is null;
  elsif tg_table_name = 'travel_package_groups' then
    if lower(btrim(new.status)) is distinct from lower(btrim(old.status)) then
      update public.ticket_package_links
      set match_status = 'retired', retired_at = now()
      where group_id = old.id
        and retired_at is null;
    end if;
  end if;

  return new;
end
$$;

create or replace function public.ticketing_reconcile_package_pnr_change_2026082902()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
set row_security = off
as $$
declare
  old_pnr text;
  new_pnr text;
  booking_record record;
begin
  if tg_table_name = 'travel_package_reservations' then
    old_pnr := case when tg_op = 'UPDATE'
      then public.normalize_ticket_pnr_v1(old.booking_reference)
      else null
    end;
    new_pnr := public.normalize_ticket_pnr_v1(new.booking_reference);

    for booking_record in
      select booking.id
      from public.ticket_bookings booking
      where booking.archived_at is null
        and booking.normalized_pnr in (old_pnr, new_pnr)
      order by booking.id
    loop
      perform public.ticketing_reconcile_package_booking_2026082902(booking_record.id);
    end loop;
  elsif tg_table_name = 'travel_packages' then
    for booking_record in
      select distinct booking.id
      from public.travel_package_reservations reservation
      join public.ticket_bookings booking
        on booking.normalized_pnr = reservation.normalized_booking_reference
      where reservation.package_id = new.id
        and booking.archived_at is null
      order by booking.id
    loop
      perform public.ticketing_reconcile_package_booking_2026082902(booking_record.id);
    end loop;
  elsif tg_table_name = 'travel_package_group_members' then
    for booking_record in
      select distinct booking.id
      from public.travel_package_reservations reservation
      join public.ticket_bookings booking
        on booking.normalized_pnr = reservation.normalized_booking_reference
      where reservation.package_id in (
        case when tg_op in ('UPDATE', 'DELETE') then old.package_id end,
        case when tg_op in ('INSERT', 'UPDATE') then new.package_id end
      )
        and booking.archived_at is null
      order by booking.id
    loop
      perform public.ticketing_reconcile_package_booking_2026082902(booking_record.id);
    end loop;
  elsif tg_table_name = 'travel_package_groups' then
    for booking_record in
      select distinct booking.id
      from public.travel_package_group_members membership
      join public.travel_package_reservations reservation
        on reservation.package_id = membership.package_id
      join public.ticket_bookings booking
        on booking.normalized_pnr = reservation.normalized_booking_reference
      where membership.group_id = new.id
        and booking.archived_at is null
      order by booking.id
    loop
      perform public.ticketing_reconcile_package_booking_2026082902(booking_record.id);
    end loop;
  end if;

  return new;
end
$$;

drop trigger if exists travel_package_reservations_protect_ticket_links
  on public.travel_package_reservations;
drop trigger if exists tpr_10_retire_ticket_links_2902
  on public.travel_package_reservations;
create trigger tpr_10_retire_ticket_links_2902
  before update of package_id, reservation_type, booking_reference, status
  on public.travel_package_reservations
  for each row execute function public.ticketing_retire_changed_package_links_2026082902();
drop trigger if exists tpr_90_reconcile_ticket_pnr_2902
  on public.travel_package_reservations;
create trigger tpr_90_reconcile_ticket_pnr_2902
  after insert or update of package_id, reservation_type, booking_reference, status
  on public.travel_package_reservations
  for each row execute function public.ticketing_reconcile_package_pnr_change_2026082902();

drop trigger if exists travel_packages_protect_ticket_links
  on public.travel_packages;
drop trigger if exists tp_10_retire_ticket_links_2902
  on public.travel_packages;
create trigger tp_10_retire_ticket_links_2902
  before update of package_reference, package_type, status
  on public.travel_packages
  for each row execute function public.ticketing_retire_changed_package_links_2026082902();
drop trigger if exists tp_90_reconcile_ticket_pnr_2902
  on public.travel_packages;
create trigger tp_90_reconcile_ticket_pnr_2902
  after update of package_reference, package_type, status
  on public.travel_packages
  for each row execute function public.ticketing_reconcile_package_pnr_change_2026082902();

drop trigger if exists tpgm_10_retire_ticket_links_2902
  on public.travel_package_group_members;
create trigger tpgm_10_retire_ticket_links_2902
  before insert or update of group_id, package_id or delete
  on public.travel_package_group_members
  for each row execute function public.ticketing_retire_changed_package_links_2026082902();
drop trigger if exists tpgm_90_reconcile_ticket_pnr_2902
  on public.travel_package_group_members;
create trigger tpgm_90_reconcile_ticket_pnr_2902
  after insert or update of group_id, package_id or delete
  on public.travel_package_group_members
  for each row execute function public.ticketing_reconcile_package_pnr_change_2026082902();

drop trigger if exists tpg_10_retire_ticket_links_2902
  on public.travel_package_groups;
create trigger tpg_10_retire_ticket_links_2902
  before update of status on public.travel_package_groups
  for each row execute function public.ticketing_retire_changed_package_links_2026082902();
drop trigger if exists tpg_90_reconcile_ticket_pnr_2902
  on public.travel_package_groups;
create trigger tpg_90_reconcile_ticket_pnr_2902
  after update of status on public.travel_package_groups
  for each row execute function public.ticketing_reconcile_package_pnr_change_2026082902();

-- Preserve the previous hard-delete guard. Package and reservation deletion remains a controlled
-- operation while Ticketing evidence exists.
create trigger travel_package_reservations_protect_ticket_links
  before delete on public.travel_package_reservations
  for each row execute function public.protect_linked_ticket_package_reservation();
create trigger travel_packages_protect_ticket_links
  before delete on public.travel_packages
  for each row execute function public.protect_linked_ticket_package();

revoke all on function public.ticketing_reconcile_package_booking_2026082902(uuid)
  from public, anon, authenticated;
grant execute on function public.ticketing_reconcile_package_booking_2026082902(uuid)
  to service_role;
revoke all on function public.ticketing_retire_changed_package_links_2026082902()
  from public, anon, authenticated;
revoke all on function public.ticketing_reconcile_package_pnr_change_2026082902()
  from public, anon, authenticated;

-- Reconcile existing Ticketing rows against package PNRs without reading or exporting customer data.
do $ticketing_package_reconciliation_backfill$
declare
  booking_record record;
begin
  for booking_record in
    select booking.id
    from public.ticket_bookings booking
    where booking.archived_at is null
    order by booking.id
  loop
    perform public.ticketing_reconcile_package_booking_2026082902(booking_record.id);
  end loop;
end
$ticketing_package_reconciliation_backfill$;

insert into public.portal_schema_versions (component, version, applied_at, details)
values (
  'ticketing', 2026082902, now(),
  coalesce((select details from public.portal_schema_versions where component = 'ticketing'), '{}'::jsonb)
    || jsonb_build_object(
      'migration', '20260829_ticketing_package_pnr_reconciliation.sql',
      'capabilities', coalesce((
        select details -> 'capabilities' from public.portal_schema_versions
        where component = 'ticketing' and jsonb_typeof(details -> 'capabilities') = 'array'
      ), '[]'::jsonb) || jsonb_build_array(
        'bidirectional-package-pnr-reconciliation',
        'late-package-pnr-classification',
        'automatic-package-scope-audit'
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
    'ready', coalesce(schema_version.version >= 2026082902, false)
      and to_regprocedure('public.ticketing_archive_booking(uuid,uuid,text)') is not null
      and to_regprocedure('public.ticketing_create_quick_tk_supplied(uuid,text,jsonb)') is not null
      and to_regclass('public.ticket_vouchers') is not null
      and to_regprocedure(
        'public.ticketing_create_voucher_2026082901(uuid,uuid,text,integer,uuid,date,date,text,text,text)'
      ) is not null
      and to_regprocedure(
        'public.ticketing_reconcile_package_booking_2026082902(uuid)'
      ) is not null
      and exists (
        select 1 from pg_trigger trigger_row
        where trigger_row.tgrelid = 'public.travel_package_reservations'::regclass
          and trigger_row.tgname = 'tpr_90_reconcile_ticket_pnr_2902'
          and not trigger_row.tgisinternal
      ),
    'version', schema_version.version,
    'requiredVersion', greatest(schema_version.version, 2026082902),
    'appliedAt', schema_version.applied_at,
    'details', schema_version.details
  )
  from public.portal_schema_versions schema_version
  where component = 'ticketing'
$$;

revoke all on function public.ticketing_schema_status() from public, anon, authenticated;
grant execute on function public.ticketing_schema_status() to service_role;

commit;
