begin;
select pg_advisory_xact_lock(hashtextextended('loyalty:program-migration', 0));

do $loyalty_program_guard$
declare installed_version bigint;
begin
  select version into installed_version
  from public.portal_schema_versions
  where component = 'pos'
  for update;
  if installed_version is null or installed_version < 2026090903 then
    raise exception 'POS configuration capability 2026090903 must be installed first'
      using errcode = '55000', hint = 'POS_CONFIGURATION_REQUIRED';
  end if;
  if installed_version > 2026090904 then
    raise exception 'Loyalty earning migration cannot run after POS capability %', installed_version
      using errcode = '55000', hint = 'LOYALTY_FORWARD_MIGRATION_REPLAY_BLOCKED';
  end if;
end
$loyalty_program_guard$;

create table public.customer_loyalty_program_earning_rules (
  rule_key text primary key check (rule_key ~ '^[a-z][a-z0-9_]{1,49}$'),
  label text not null check (length(btrim(label)) between 1 and 100),
  points integer not null check (points between 1 and 100000),
  unit_label text not null check (length(btrim(unit_label)) between 1 and 100),
  match_category_key text,
  match_item_key text,
  activation_mode text not null check (activation_mode in ('POS_FLAT', 'SOURCE_RECORD')),
  display_order integer not null check (display_order >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint customer_loyalty_program_rule_match_check check (
    (match_category_key is null) <> (match_item_key is null)
  )
);
create unique index customer_loyalty_program_rule_category_uq
  on public.customer_loyalty_program_earning_rules(match_category_key)
  where match_category_key is not null;
create unique index customer_loyalty_program_rule_item_uq
  on public.customer_loyalty_program_earning_rules(match_item_key)
  where match_item_key is not null;
create index customer_loyalty_program_rule_active_order_idx
  on public.customer_loyalty_program_earning_rules(display_order)
  where is_active;

insert into public.customer_loyalty_program_earning_rules (
  rule_key, label, points, unit_label, match_category_key, match_item_key,
  activation_mode, display_order
) values
  ('remittance', 'Remittance transaction', 25, 'completed paid transaction', 'remittance', null, 'POS_FLAT', 10),
  ('ticket', 'Flight ticket', 80, 'issued and paid passenger ticket', null, 'ticketing', 'SOURCE_RECORD', 20),
  ('package', 'Travel package', 120, 'fully paid traveller', null, 'package', 'SOURCE_RECORD', 30),
  ('cargo', 'Cargo or delivery', 25, 'completed paid transaction', 'cargo', null, 'POS_FLAT', 40),
  ('application', 'Application service', 25, 'completed paid application', 'applications', null, 'SOURCE_RECORD', 50),
  ('document_assistance', 'Document assistance', 10, 'completed paid transaction', 'document-assistance', null, 'POS_FLAT', 60);

alter table public.customer_loyalty_program_earning_rules enable row level security;
alter table public.customer_loyalty_program_earning_rules force row level security;
revoke all on table public.customer_loyalty_program_earning_rules from public, anon, authenticated, service_role;
grant select on table public.customer_loyalty_program_earning_rules to service_role;

create or replace function public.pos_post_transaction_v4(
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
  action_name_value constant text := 'pos.post_transaction.v4';
  request_value jsonb := coalesce(p_request, '{}'::jsonb);
  existing_request jsonb;
  existing_response jsonb;
  response_value jsonb;
  loyalty_code_value text := nullif(upper(btrim(p_request ->> 'loyaltyCode')), '');
  transaction_id_value uuid;
  transaction_row public.pos_transactions%rowtype;
  item_row public.pos_catalogue_items%rowtype;
  category_row public.pos_categories%rowtype;
  member_row public.mobile_users%rowtype;
  rule_row public.customer_loyalty_program_earning_rules%rowtype;
  award_row public.customer_loyalty_awards%rowtype;
  source_reference_value text;
begin
  if jsonb_typeof(coalesce(p_request, 'null'::jsonb)) <> 'object' then
    raise exception 'Valid POS transaction request required' using errcode = '22023';
  end if;
  if length(btrim(coalesce(p_idempotency_key, ''))) not between 8 and 200 then
    raise exception 'Valid idempotency key required' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_actor_employee_id::text || ':' || p_idempotency_key, 0)
  );
  select request_payload, response_payload
  into existing_request, existing_response
  from public.pos_idempotency_keys
  where action_name = action_name_value
    and actor_employee_id = p_actor_employee_id
    and idempotency_key = p_idempotency_key;
  if found then
    if existing_request is distinct from request_value then
      raise exception 'Idempotency key was already used for another request'
        using errcode = '23505', hint = 'POS_IDEMPOTENCY_CONFLICT';
    end if;
    return existing_response || jsonb_build_object('idempotentReplay', true);
  end if;

  response_value := public.pos_post_transaction_v3(
    p_actor_employee_id,
    p_idempotency_key,
    case when loyalty_code_value is null then request_value else request_value - 'loyaltyCode' end
  );
  transaction_id_value := nullif(response_value ->> 'transactionId', '')::uuid;

  if loyalty_code_value is not null then
    if loyalty_code_value !~ '^PYM-[23456789A-HJ-NP-Z]{4}-[23456789A-HJ-NP-Z]{4}-[23456789A-HJ-NP-Z]$' then
      raise exception 'Valid loyalty code required' using errcode = '22023';
    end if;
    select * into transaction_row
    from public.pos_transactions
    where id = transaction_id_value
    for update;
    if not found then raise exception 'Posted POS transaction not found' using errcode = 'P0002'; end if;

    select * into item_row from public.pos_catalogue_items where id = transaction_row.catalogue_item_id;
    select * into category_row from public.pos_categories where id = transaction_row.category_id;
    select * into rule_row
    from public.customer_loyalty_program_earning_rules rule
    where rule.is_active
      and rule.activation_mode = 'POS_FLAT'
      and (
        (rule.match_item_key is not null and rule.match_item_key = item_row.item_key)
        or (rule.match_category_key is not null and rule.match_category_key = category_row.category_key)
      )
    order by (rule.match_item_key is not null) desc, rule.display_order
    limit 1;
    if not found then
      raise exception 'This service earns points through its source record, not the POS transaction'
        using errcode = '22023', hint = 'POS_LOYALTY_SOURCE_REQUIRED';
    end if;
    if transaction_row.direction <> 'IN'
      or transaction_row.amount_paid <> transaction_row.total_amount
      or transaction_row.transaction_kind <> 'SALE' then
      raise exception 'Only a completed and fully paid customer transaction can earn points'
        using errcode = '22023', hint = 'POS_LOYALTY_NOT_ELIGIBLE';
    end if;

    select * into member_row
    from public.mobile_users
    where customer_code = loyalty_code_value
      and customer_lifecycle_status = 'active'
    for update;
    if not found then
      raise exception 'Active loyalty member not found'
        using errcode = 'P0002', hint = 'POS_LOYALTY_NOT_FOUND';
    end if;
    if transaction_row.loyalty_mobile_user_id is not null
      and transaction_row.loyalty_mobile_user_id is distinct from member_row.id then
      raise exception 'POS transaction is already linked to another loyalty member'
        using errcode = '23505', hint = 'POS_LOYALTY_ALREADY_LINKED';
    end if;

    source_reference_value := public.customer_loyalty_source_reference_v1(
      'service', 'pos', transaction_id_value
    );
    perform public.customer_loyalty_register_code_source_v1(
      loyalty_code_value,
      'service',
      'pos',
      transaction_id_value,
      rule_row.label,
      rule_row.points
    );
    perform public.customer_loyalty_record_service_event_v1(
      'pos', transaction_id_value, 'pos.completed:' || transaction_id_value,
      'completed', transaction_row.occurred_at
    );
    perform public.customer_loyalty_record_service_event_v1(
      'pos', transaction_id_value, 'pos.paid:' || transaction_id_value,
      'paid', transaction_row.occurred_at
    );
    select * into award_row
    from public.customer_loyalty_awards
    where source_reference = source_reference_value;

    update public.pos_transactions set
      loyalty_mobile_user_id = member_row.id,
      loyalty_source_reference = source_reference_value,
      loyalty_points_awarded = rule_row.points
    where id = transaction_id_value;

    if coalesce((response_value ->> 'idempotentReplay')::boolean, false) = false then
      insert into public.pos_audit_events (
        location_id, actor_employee_id, event_type, entity_type, entity_id,
        event_summary, metadata
      ) values (
        transaction_row.location_id, p_actor_employee_id, 'loyalty.awarded',
        'TRANSACTION', transaction_id_value, 'Fixed loyalty points awarded',
        jsonb_build_object(
          'ruleKey', rule_row.rule_key,
          'points', rule_row.points,
          'awardId', award_row.id
        )
      );
    end if;
    response_value := response_value || jsonb_build_object(
      'loyaltyPointsAwarded', rule_row.points,
      'loyaltyAwardId', award_row.id
    );
  end if;

  insert into public.pos_idempotency_keys (
    action_name, actor_employee_id, idempotency_key, request_payload, response_payload
  ) values (
    action_name_value, p_actor_employee_id, p_idempotency_key, request_value, response_value
  );
  return response_value;
exception
  when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'Invalid POS loyalty details' using errcode = '22023';
end;
$$;

revoke all on function public.pos_post_transaction_v3(uuid,text,jsonb) from service_role;
revoke all on function public.pos_post_transaction_v4(uuid,text,jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.pos_post_transaction_v4(uuid,text,jsonb) to service_role;

insert into public.portal_schema_versions(component, version, applied_at)
values ('pos', 2026090904, clock_timestamp())
on conflict(component) do update set
  version = excluded.version,
  applied_at = excluded.applied_at;

commit;
