\set ON_ERROR_STOP on

do $archive_all_booking_commission_facts$
declare
  booking_id_value uuid;
  actor_employee_id_value uuid;
  archive_result jsonb;
begin
  select adjustment.booking_id into booking_id_value
  from public.ticket_fare_adjustments adjustment
  join public.ticket_bookings booking on booking.id = adjustment.booking_id
  where booking.archived_at is null
  order by adjustment.created_at desc
  limit 1;
  if booking_id_value is null then
    raise exception 'Archive tombstone test requires an active adjusted booking';
  end if;

  select employee.id into actor_employee_id_value
  from public.employees employee
  join public.roles role on role.id = employee.role_id
  where employee.is_active
    and regexp_replace(lower(btrim(role.name)), '[_-]+', ' ', 'g') in (
      'admin', 'master admin', 'super admin'
    )
  order by role.level desc, employee.id
  limit 1;
  if actor_employee_id_value is null then
    raise exception 'Archive tombstone test requires an active administrator';
  end if;

  archive_result := public.ticketing_archive_booking(
    actor_employee_id_value, booking_id_value, null
  );
  if archive_result ->> 'archived' <> 'true'
    or coalesce((archive_result ->> 'commissionCorrections')::integer, 0) < 2
  then
    raise exception 'Reason-optional archive did not create all corrections: %', archive_result;
  end if;

  if exists (
    select 1
    from public.commission_source_events source_event
    where source_event.source_module = 'ticketing'
      and source_event.event_type <> 'ticket_entry_archived'
      and (
        source_event.source_record_id in (
          select transaction.id
          from public.ticket_transactions transaction
          where transaction.booking_id = booking_id_value
        )
        or source_event.variables ->> 'booking_id' = booking_id_value::text
      )
      and not exists (
        select 1 from public.commission_source_events newer
        where newer.supersedes_event_id = source_event.source_event_id
      )
  ) then
    raise exception 'Archived booking retained a current non-tombstone Commission fact';
  end if;

  if not exists (
    select 1
    from public.commission_source_events archive_event
    join public.commission_source_events adjustment_event
      on adjustment_event.source_event_id = archive_event.supersedes_event_id
    where archive_event.event_type = 'ticket_entry_archived'
      and adjustment_event.variables ->> 'booking_id' = booking_id_value::text
      and adjustment_event.source_fact_key like 'fare-adjustment:%'
  ) then
    raise exception 'Fare-adjustment Commission fact was not tombstoned with its booking';
  end if;
end
$archive_all_booking_commission_facts$;

select 'ticket archive Commission tombstone assertions passed' as result;
