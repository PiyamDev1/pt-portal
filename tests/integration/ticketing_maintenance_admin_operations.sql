-- Integration assertions for Ticketing capability 2026090204.

insert into public.roles (id, name, level)
values ('1a000000-0000-0000-0000-000000000099', 'Maintenance Admin', 9)
on conflict (name) do nothing;
insert into auth.users (id, email)
values ('4a000000-0000-0000-0000-000000000099', 'maintenance-ticketing@example.test')
on conflict (id) do nothing;
insert into public.employees (id, full_name, email, role_id, location_id)
select
  '4a000000-0000-0000-0000-000000000099',
  'Ticketing Maintenance Admin',
  'maintenance-ticketing@example.test',
  role.id,
  '30000000-0000-0000-0000-000000000001'
from public.roles role where role.name = 'Maintenance Admin'
on conflict (id) do update set role_id = excluded.role_id, is_active = true;

do $assert_ticketing_maintenance_admin_operations$
declare
  definition text;
  refund_row public.ticket_refunds%rowtype;
  result_value jsonb;
begin
  if public.ticketing_schema_status() ->> 'version' <> '2026090204' then
    raise exception 'Ticketing capability 2026090204 is not active';
  end if;

  foreach definition in array array[
    pg_get_functiondef('public.ticketing_create_quick_tk_attributed(uuid,text,jsonb)'::regprocedure),
    pg_get_functiondef('public.ticketing_complete_tk_details_authorized(uuid,uuid,text,jsonb)'::regprocedure),
    pg_get_functiondef('public.ticketing_replace_root_tk_itinerary(uuid,uuid,bigint,text,jsonb,text)'::regprocedure),
    pg_get_functiondef('public.ticketing_correct_booking_attribution(uuid,uuid,bigint,text,jsonb)'::regprocedure),
    pg_get_functiondef('public.ticketing_correct_booking_attribution_commercial_2026090201(uuid,uuid,bigint,text,jsonb)'::regprocedure),
    pg_get_functiondef('public.ticketing_append_refund_event_2026090201(uuid,uuid,bigint,text,numeric,date,text,text,text,text)'::regprocedure)
  ]
  loop
    if position('maintenance admin' in definition) = 0 then
      raise exception 'A Ticketing operational routine is missing Maintenance Admin authority';
    end if;
  end loop;

  definition := pg_get_functiondef(
    'public.ticketing_admin_correct_sale_prices(uuid,uuid,bigint,bigint,text,jsonb)'::regprocedure
  );
  if position('ticketing_actor_can_maintain_2026090202' in definition) = 0 then
    raise exception 'Sale correction does not use Maintenance Admin authority';
  end if;

  definition := pg_get_functiondef(
    'public.ticketing_actor_is_admin_2026082802(uuid)'::regprocedure
  );
  if position('maintenance admin' in definition) > 0 then
    raise exception 'Maintenance Admin was incorrectly granted destructive Admin authority';
  end if;

  if not public.ticketing_actor_can_maintain_2026090202(
      '4a000000-0000-0000-0000-000000000099'
    )
    or public.ticketing_actor_is_admin_2026082802(
      '4a000000-0000-0000-0000-000000000099'
    )
    or public.ticketing_actor_can_maintain_2026090202(
      '40000000-0000-0000-0000-000000000001'
    )
    or public.ticketing_actor_can_maintain_2026090202(
      '40000000-0000-0000-0000-000000000002'
    )
  then
    raise exception 'Ticketing SQL record-manager role matrix is incorrect';
  end if;

  definition := pg_get_functiondef(
    'public.ticketing_append_refund_event_2026082903(uuid,uuid,bigint,text,numeric,date,text,text,text,text)'::regprocedure
  );
  if position('ticketing_actor_can_maintain_2026090202' in definition) = 0 then
    raise exception 'Internal Refund mutation does not use record-manager authority';
  end if;

  select refund.* into refund_row
  from public.ticket_refunds refund
  where refund.notes = 'PIA cancellation calculation saved'
  order by refund.created_at desc limit 1;
  result_value := public.ticketing_append_refund_event_2026090201(
    '4a000000-0000-0000-0000-000000000099',
    refund_row.id,
    refund_row.version,
    'other_cost',
    1,
    current_date,
    'MAINTENANCE-ADMIN-COST-1',
    'Maintenance Admin recorded supplier evidence',
    null,
    'maintenance-admin-refund-event-1'
  );
  if result_value ->> 'status' <> 'part_settled'
    or result_value ->> 'confirmedCorrectAt' is not null
  then
    raise exception 'Maintenance Admin could not perform an audited Refund operation';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.ticketing_actor_can_maintain_2026090202(uuid)',
    'EXECUTE'
  ) then
    raise exception 'Maintenance authority helper is callable by authenticated clients';
  end if;
end
$assert_ticketing_maintenance_admin_operations$;
