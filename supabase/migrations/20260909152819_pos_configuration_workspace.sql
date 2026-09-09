-- POS configuration workspace, custom logo keys, and duplicate-safe catalogue management.
-- This is a configuration-only capability; POS transaction capability 2026090902 remains valid.

begin;
select pg_advisory_xact_lock(hashtextextended('pos:schema-migration', 0));

do $pos_forward_guard$
declare installed_version bigint;
begin
  select version into installed_version
  from public.portal_schema_versions
  where component = 'pos'
  for update;

  if installed_version is null or installed_version < 2026090902 then
    raise exception 'POS supplier routing capability 2026090902 must be installed first'
      using errcode = '55000', hint = 'POS_SUPPLIER_ROUTING_REQUIRED';
  end if;
  if installed_version > 2026090903 then
    raise exception 'POS configuration workspace migration cannot run after installed capability %', installed_version
      using errcode = '55000', hint = 'POS_FORWARD_MIGRATION_REPLAY_BLOCKED';
  end if;
end
$pos_forward_guard$;

alter table public.pos_catalogue_items
  drop constraint if exists pos_catalogue_logo_key_check;
alter table public.pos_catalogue_items
  add constraint pos_catalogue_logo_key_check
  check (logo_key is null or logo_key ~ '^[a-z][a-z0-9_-]{1,63}$');

alter table public.pos_supplier_profiles
  drop constraint if exists pos_supplier_profiles_logo_key_check;
alter table public.pos_supplier_profiles
  add constraint pos_supplier_profiles_logo_key_check
  check (logo_key is null or logo_key ~ '^[a-z][a-z0-9_-]{1,63}$');

create unique index if not exists pos_categories_active_label_uq
  on public.pos_categories (lower(btrim(label)))
  where is_active;
create unique index if not exists pos_catalogue_items_active_category_label_uq
  on public.pos_catalogue_items (category_id, lower(btrim(coalesce(option_label, label))))
  where is_active and is_quick_entry and not is_system_action;

create or replace function public.pos_manage_configuration_v4(
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
  action_name_value constant text := 'pos.manage_configuration.v4';
  action_value text := p_request ->> 'action';
  request_value jsonb := p_request;
  supplier_id_value uuid := nullif(p_request ->> 'supplierId', '')::uuid;
  category_id_value uuid;
  actor_location_id uuid;
  existing_loyalty_eligible boolean := false;
  existing_points_per_gbp numeric := 0;
  protected_system_logo boolean := false;
  existing_request jsonb;
  existing_response jsonb;
  response_value jsonb;
begin
  if length(btrim(coalesce(p_idempotency_key, ''))) not between 8 and 200
    or jsonb_typeof(coalesce(p_request, 'null'::jsonb)) <> 'object'
    or action_value not in ('UPSERT_CATEGORY', 'UPSERT_SERVICE', 'UPSERT_SUPPLIER', 'SET_ASSIGNMENT') then
    raise exception 'Valid idempotent POS configuration action required' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(action_name_value || ':' || p_actor_employee_id || ':' || p_idempotency_key, 0)
  );
  select request_payload, response_payload into existing_request, existing_response
  from public.pos_idempotency_keys
  where action_name = action_name_value
    and actor_employee_id = p_actor_employee_id
    and idempotency_key = p_idempotency_key;
  if found then
    if existing_request is distinct from p_request then
      raise exception 'Idempotency conflict'
        using errcode = '22023', hint = 'POS_IDEMPOTENCY_CONFLICT';
    end if;
    return existing_response || jsonb_build_object('idempotentReplay', true);
  end if;

  if action_value = 'UPSERT_CATEGORY' then
    if coalesce((p_request ->> 'isActive')::boolean, true) and exists (
      select 1
      from public.pos_categories category
      where category.category_key <> p_request ->> 'key'
        and category.is_active
        and lower(btrim(category.label)) = lower(btrim(p_request ->> 'label'))
    ) then
      raise exception 'An active POS category already uses this label'
        using errcode = '23505', hint = 'POS_DUPLICATE_CATEGORY';
    end if;
  elsif action_value = 'UPSERT_SERVICE' then
    select category.id into category_id_value
    from public.pos_categories category
    where category.category_key = p_request ->> 'categoryKey';
    if category_id_value is null then
      raise exception 'Category not found' using errcode = 'P0002';
    end if;

    if coalesce((p_request ->> 'isActive')::boolean, true) and exists (
      select 1
      from public.pos_catalogue_items item
      where item.item_key <> p_request ->> 'key'
        and item.category_id = category_id_value
        and item.is_active
        and item.is_quick_entry
        and not item.is_system_action
        and lower(btrim(coalesce(item.option_label, item.label))) = lower(btrim(p_request ->> 'label'))
    ) then
      raise exception 'An active service in this category already uses this label'
        using errcode = '23505', hint = 'POS_DUPLICATE_SERVICE';
    end if;

  elsif action_value = 'UPSERT_SUPPLIER' then
    if exists (
      select 1
      from public.supplier_vendors supplier
      where (supplier_id_value is null or supplier.id <> supplier_id_value)
        and lower(btrim(supplier.name)) = lower(btrim(p_request ->> 'name'))
    ) then
      raise exception 'A supplier already uses this name'
        using errcode = '23505', hint = 'POS_DUPLICATE_SUPPLIER';
    end if;

    if exists (
      select 1
      from jsonb_array_elements_text(coalesce(p_request -> 'aliases', '[]'::jsonb)) alias(value)
      group by lower(btrim(alias.value))
      having count(*) > 1
    ) or exists (
      select 1
      from jsonb_array_elements_text(coalesce(p_request -> 'aliases', '[]'::jsonb)) alias(value)
      where lower(btrim(alias.value)) = lower(btrim(p_request ->> 'name'))
    ) or exists (
      select 1
      from jsonb_array_elements_text(coalesce(p_request -> 'aliases', '[]'::jsonb)) alias(value)
      join public.supplier_vendors supplier
        on lower(btrim(supplier.name)) = lower(btrim(alias.value))
      where supplier_id_value is null or supplier.id <> supplier_id_value
    ) or exists (
      select 1
      from public.pos_supplier_profiles profile
      cross join lateral unnest(profile.alternate_names) existing_alias(value)
      where (supplier_id_value is null or profile.supplier_vendor_id <> supplier_id_value)
        and (
          lower(btrim(existing_alias.value)) = lower(btrim(p_request ->> 'name'))
          or exists (
            select 1
            from jsonb_array_elements_text(coalesce(p_request -> 'aliases', '[]'::jsonb)) requested_alias(value)
            where lower(btrim(requested_alias.value)) = lower(btrim(existing_alias.value))
          )
        )
    ) then
      raise exception 'A supplier name or alias is already in use'
        using errcode = '23505', hint = 'POS_DUPLICATE_SUPPLIER_ALIAS';
    end if;

    if supplier_id_value is not null and p_request ? 'logoKey' then
      select profile.is_system into protected_system_logo
      from public.pos_supplier_profiles profile
      where profile.supplier_vendor_id = supplier_id_value;
      if coalesce(protected_system_logo, false) then
        request_value := request_value - 'logoKey';
      end if;
    end if;
  end if;

  if action_value = 'UPSERT_SERVICE' then
    select item.loyalty_eligible, item.points_per_gbp
    into existing_loyalty_eligible, existing_points_per_gbp
    from public.pos_catalogue_items item
    where item.item_key = p_request ->> 'key';

    request_value := request_value || jsonb_build_object(
      'loyaltyEligible', coalesce(existing_loyalty_eligible, false),
      'pointsPerGbp', coalesce(existing_points_per_gbp, 0)
    );
  end if;

  response_value := public.pos_manage_configuration_v3(
    p_actor_employee_id,
    p_idempotency_key,
    request_value
  );

  if action_value = 'UPSERT_SUPPLIER' and coalesce(protected_system_logo, false) and p_request ? 'logoKey' then
    if not coalesce((response_value ->> 'idempotentReplay')::boolean, false) then
      update public.pos_supplier_profiles set
        logo_key = nullif(p_request ->> 'logoKey', ''),
        configured_by = p_actor_employee_id,
        updated_at = clock_timestamp()
      where supplier_vendor_id = supplier_id_value;

      select employee.location_id into actor_location_id
      from public.employees employee
      where employee.id = p_actor_employee_id;
      insert into public.pos_audit_events(
        location_id, actor_employee_id, event_type, entity_type, entity_id, event_summary, metadata
      ) values (
        actor_location_id, p_actor_employee_id, 'configuration.logo_changed', 'SUPPLIER',
        supplier_id_value, 'System supplier logo changed',
        jsonb_build_object('logoKey', p_request -> 'logoKey')
      );
    end if;
  end if;

  insert into public.pos_idempotency_keys(
    action_name, actor_employee_id, idempotency_key, request_payload, response_payload
  ) values (
    action_name_value, p_actor_employee_id, p_idempotency_key, p_request, response_value
  );

  return response_value;
exception
  when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'Invalid POS configuration value' using errcode = '22023';
end;
$$;

revoke all on function public.pos_manage_configuration_v3(uuid,text,jsonb) from service_role;
revoke all on function public.pos_manage_configuration_v4(uuid,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.pos_manage_configuration_v4(uuid,text,jsonb) to service_role;

insert into public.portal_schema_versions(component, version, applied_at)
values ('pos', 2026090903, clock_timestamp())
on conflict(component) do update set
  version = excluded.version,
  applied_at = excluded.applied_at;

commit;
