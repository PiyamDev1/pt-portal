-- Super Admins retain fresh-factor authentication for a closeout approval, but
-- may approve their own counted closeout. The actor and explicit override flag
-- remain in the immutable POS audit event.
create or replace function public.pos_approve_closeout_v1(
  p_actor_employee_id uuid,
  p_idempotency_key text,
  p_request jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  action_name_value constant text := 'pos.approve_closeout.v1';
  key_value text := btrim(coalesce(p_idempotency_key, ''));
  canonical_request jsonb := coalesce(p_request, '{}'::jsonb);
  existing_request jsonb;
  existing_response jsonb;
  actor_location_id uuid;
  role_level_value integer;
  is_super_admin_value boolean := false;
  closeout_row public.pos_closeouts%rowtype;
  factor_method_value text := p_request ->> 'freshFactorMethod';
  note_value text := nullif(btrim(p_request ->> 'approvalNote'), '');
  response_value jsonb;
begin
  if length(key_value) not between 8 and 200 or jsonb_typeof(canonical_request) <> 'object' then
    raise exception 'Valid closeout approval required' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(action_name_value || ':' || p_actor_employee_id || ':' || key_value, 0));
  select request_payload, response_payload into existing_request, existing_response
  from public.pos_idempotency_keys
  where action_name = action_name_value and actor_employee_id = p_actor_employee_id and idempotency_key = key_value;
  if found then
    if existing_request is distinct from canonical_request then
      raise exception 'POS idempotency key reused with different closeout approval'
        using errcode = '22023', hint = 'POS_IDEMPOTENCY_CONFLICT';
    end if;
    return existing_response || jsonb_build_object('idempotentReplay', true);
  end if;

  select employee.location_id, role.level,
    lower(regexp_replace(btrim(role.name), '[_-]+', ' ', 'g')) = 'super admin'
  into actor_location_id, role_level_value, is_super_admin_value
  from public.employees employee
  join public.roles role on role.id = employee.role_id
  where employee.id = p_actor_employee_id and employee.is_active
  for update of employee;
  if not found or role_level_value > 2 or factor_method_value not in ('totp', 'backup') then
    raise exception 'Manager verification required' using errcode = '42501', hint = 'POS_MANAGER_VERIFICATION_REQUIRED';
  end if;
  select * into closeout_row
  from public.pos_closeouts
  where id = nullif(p_request ->> 'closeoutId', '')::uuid
  for update;
  if not found then raise exception 'Closeout not found' using errcode = 'P0002'; end if;
  if closeout_row.location_id <> actor_location_id and role_level_value > 1 then
    raise exception 'Cross-branch closeout approval is forbidden' using errcode = '42501';
  end if;
  if closeout_row.counted_by = p_actor_employee_id and not is_super_admin_value then
    raise exception 'The person who counted a till cannot approve that closeout'
      using errcode = '42501', hint = 'POS_INDEPENDENT_APPROVER_REQUIRED';
  end if;
  if closeout_row.status <> 'PENDING_APPROVAL' then
    raise exception 'Only a pending closeout can be approved' using errcode = '55000';
  end if;

  update public.pos_closeouts
  set status = 'APPROVED', approved_by = p_actor_employee_id, approved_at = clock_timestamp(),
      approval_note = note_value, fresh_factor_method = factor_method_value
  where id = closeout_row.id;
  insert into public.pos_audit_events (
    location_id, actor_employee_id, event_type, entity_type, entity_id, event_summary, metadata
  ) values (
    closeout_row.location_id, p_actor_employee_id, 'closeout.approved', 'CLOSEOUT', closeout_row.id,
    'POS closeout approved', jsonb_build_object(
      'shiftId', closeout_row.shift_id,
      'superAdminOverride', is_super_admin_value and closeout_row.counted_by = p_actor_employee_id
    )
  );
  response_value := jsonb_build_object('closeoutId', closeout_row.id, 'status', 'APPROVED');
  insert into public.pos_idempotency_keys (
    action_name, actor_employee_id, idempotency_key, request_payload, response_payload
  ) values (action_name_value, p_actor_employee_id, key_value, canonical_request, response_value);
  return response_value;
exception
  when invalid_text_representation then
    raise exception 'Invalid closeout approval' using errcode = '22023';
end;
$$;

revoke all on function public.pos_approve_closeout_v1(uuid,text,jsonb) from public, anon, authenticated, service_role;
grant execute on function public.pos_approve_closeout_v1(uuid,text,jsonb) to service_role;
