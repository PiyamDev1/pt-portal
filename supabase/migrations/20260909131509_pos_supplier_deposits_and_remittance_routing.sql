-- POS supplier deposit workflow, ticketing suppliers, and remittance tender destinations.
-- Requires the catalogue/configuration capability and keeps all posted accounting rows immutable.

begin;
select pg_advisory_xact_lock(hashtextextended('pos:schema-migration', 0));

do $pos_forward_guard$
declare installed_version bigint;
begin
  select version into installed_version
  from public.portal_schema_versions
  where component = 'pos'
  for update;

  if installed_version is null or installed_version < 2026090901 then
    raise exception 'POS catalogue capability 2026090901 must be installed first'
      using errcode = '55000', hint = 'POS_CATALOGUE_CONFIGURATION_REQUIRED';
  end if;
  if installed_version > 2026090902 then
    raise exception 'POS supplier routing migration cannot run after installed capability %', installed_version
      using errcode = '55000', hint = 'POS_FORWARD_MIGRATION_REPLAY_BLOCKED';
  end if;
end
$pos_forward_guard$;

alter table public.pos_supplier_profiles
  add column if not exists settlement_mode text not null default 'DEPOSIT_ACCOUNT',
  add column if not exists logo_key text,
  add column if not exists is_system boolean not null default false;

do $pos_supplier_profile_constraints$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'pos_supplier_profiles_settlement_mode_check'
      and conrelid = 'public.pos_supplier_profiles'::regclass
  ) then
    alter table public.pos_supplier_profiles
      add constraint pos_supplier_profiles_settlement_mode_check
      check (settlement_mode in ('DEPOSIT_ACCOUNT', 'PAY_ON_DEMAND'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'pos_supplier_profiles_logo_key_check'
      and conrelid = 'public.pos_supplier_profiles'::regclass
  ) then
    alter table public.pos_supplier_profiles
      add constraint pos_supplier_profiles_logo_key_check
      check (logo_key is null or logo_key in ('polani-travel'));
  end if;
end
$pos_supplier_profile_constraints$;

alter table public.pos_transaction_tenders
  add column if not exists destination text not null default 'OUR_ACCOUNT';

do $pos_tender_destination_constraint$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'pos_transaction_tenders_destination_check'
      and conrelid = 'public.pos_transaction_tenders'::regclass
  ) then
    alter table public.pos_transaction_tenders
      add constraint pos_transaction_tenders_destination_check
      check (
        destination in ('OUR_ACCOUNT', 'SUPPLIER_DIRECT')
        and (destination = 'OUR_ACCOUNT' or payment_method in ('CARD', 'BANK'))
      );
  end if;
end
$pos_tender_destination_constraint$;

create index if not exists pos_transaction_tenders_destination_idx
  on public.pos_transaction_tenders(destination, payment_method, created_at desc);

alter table public.pos_transactions
  add column if not exists supplier_source_name_snapshot text;

do $pos_supplier_source_snapshot_constraint$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'pos_transactions_supplier_source_name_snapshot_check'
      and conrelid = 'public.pos_transactions'::regclass
  ) then
    alter table public.pos_transactions
      add constraint pos_transactions_supplier_source_name_snapshot_check
      check (
        supplier_source_name_snapshot is null
        or length(btrim(supplier_source_name_snapshot)) between 2 and 160
      );
  end if;
end
$pos_supplier_source_snapshot_constraint$;

create table if not exists public.pos_supplier_source_history (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete restrict,
  category_id uuid not null references public.pos_categories(id) on delete restrict,
  supplier_vendor_id uuid not null references public.supplier_vendors(id) on delete restrict,
  source_name text not null check (length(btrim(source_name)) between 2 and 160),
  normalized_name text not null check (length(btrim(normalized_name)) between 2 and 160),
  use_count bigint not null default 1 check (use_count > 0),
  first_used_at timestamptz not null default clock_timestamp(),
  last_used_at timestamptz not null default clock_timestamp(),
  unique (location_id, category_id, normalized_name)
);
create index if not exists pos_supplier_source_history_category_idx
  on public.pos_supplier_source_history(location_id, category_id, last_used_at desc);
create index if not exists pos_supplier_source_history_supplier_idx
  on public.pos_supplier_source_history(supplier_vendor_id, last_used_at desc);

alter table public.pos_supplier_source_history enable row level security;
alter table public.pos_supplier_source_history force row level security;
revoke all on table public.pos_supplier_source_history from public, anon, authenticated, service_role;
grant select on table public.pos_supplier_source_history to service_role;

with ticketing_suppliers(name, settlement_mode, logo_key, is_system) as (
  values
    ('Polani Travel', 'DEPOSIT_ACCOUNT', 'polani-travel', true),
    ('Other - enter source', 'PAY_ON_DEMAND', null::text, true)
)
insert into public.supplier_vendors(name, vendor_type, is_approved)
select name, 'Supplier', true
from ticketing_suppliers
on conflict (lower(btrim(name))) do update set is_approved = true;

with ticketing_suppliers(name, settlement_mode, logo_key, is_system) as (
  values
    ('Polani Travel', 'DEPOSIT_ACCOUNT', 'polani-travel', true),
    ('Other - enter source', 'PAY_ON_DEMAND', null::text, true)
)
insert into public.pos_supplier_profiles(
  supplier_vendor_id, alternate_names, source_area, is_active, configured_by,
  settlement_mode, logo_key, is_system
)
select vendor.id, '{}'::text[], 'Ticketing', true, null,
  seed.settlement_mode, seed.logo_key, seed.is_system
from ticketing_suppliers seed
join public.supplier_vendors vendor on lower(btrim(vendor.name)) = lower(seed.name)
on conflict (supplier_vendor_id) do update set
  source_area = excluded.source_area,
  settlement_mode = excluded.settlement_mode,
  logo_key = excluded.logo_key,
  is_system = excluded.is_system,
  is_active = true,
  updated_at = clock_timestamp();

update public.pos_category_suppliers assignment
set is_default = false, updated_at = clock_timestamp()
from public.pos_categories category
where assignment.category_id = category.id
  and category.category_key = 'ticketing-packages'
  and assignment.is_default;

insert into public.pos_category_suppliers(
  category_id, supplier_vendor_id, is_default, is_active, configured_by
)
select category.id, vendor.id,
  lower(btrim(vendor.name)) = 'polani travel', true, null
from public.pos_categories category
cross join public.supplier_vendors vendor
where category.category_key = 'ticketing-packages'
  and lower(btrim(vendor.name)) in ('polani travel', 'other - enter source')
on conflict (category_id, supplier_vendor_id) do update set
  is_default = excluded.is_default,
  is_active = true,
  updated_at = clock_timestamp();

-- OTHER remains available for imports and historical compatibility, but is no longer a quick-entry method.
update public.pos_catalogue_items
set allowed_payment_methods = array_remove(allowed_payment_methods, 'OTHER'),
  updated_at = clock_timestamp()
where 'OTHER' = any(allowed_payment_methods);

create or replace function public.pos_prepare_transaction_v3()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  item_row public.pos_catalogue_items%rowtype;
  source_name_value text := nullif(btrim(current_setting('app.pos_supplier_source_name', true)), '');
  correction_value boolean := coalesce(nullif(current_setting('app.pos_supplier_correction', true), '')::boolean, false);
  configured_category_id uuid := nullif(current_setting('app.pos_category_id', true), '')::uuid;
  configured_category_label text := nullif(current_setting('app.pos_category_label', true), '');
  configured_service_label text := nullif(current_setting('app.pos_service_label', true), '');
  configured_reporting_supplier_id uuid := nullif(current_setting('app.pos_reporting_supplier_id', true), '')::uuid;
begin
  select * into item_row from public.pos_catalogue_items where id = new.catalogue_item_id;
  new.category_id := coalesce(configured_category_id, new.category_id, item_row.category_id);
  new.category_label_snapshot := coalesce(configured_category_label, new.category_label_snapshot, (
    select category.label from public.pos_categories category where category.id = new.category_id
  ));
  new.service_label_snapshot := coalesce(configured_service_label, new.service_label_snapshot, coalesce(item_row.option_label, item_row.label));
  new.reporting_supplier_vendor_id := coalesce(new.reporting_supplier_vendor_id, configured_reporting_supplier_id);
  new.supplier_name_snapshot := coalesce(source_name_value, new.supplier_name_snapshot, (
    select supplier.name from public.supplier_vendors supplier
    where supplier.id = coalesce(new.supplier_vendor_id, configured_reporting_supplier_id)
  ));
  new.supplier_source_name_snapshot := coalesce(source_name_value, new.supplier_source_name_snapshot);
  new.search_text := concat_ws(
    ' ', new.search_text, new.category_label_snapshot, new.service_label_snapshot,
    new.supplier_name_snapshot, new.supplier_source_name_snapshot
  );
  if correction_value and new.supplier_movement_type = 'REFUND' then
    new.supplier_movement_type := 'CORRECTION';
  end if;
  return new;
end;
$$;

drop trigger if exists pos_transactions_snapshot_labels_v2 on public.pos_transactions;
drop trigger if exists pos_transactions_prepare_v3 on public.pos_transactions;
create trigger pos_transactions_prepare_v3
before insert on public.pos_transactions
for each row execute function public.pos_prepare_transaction_v3();

create or replace function public.pos_prepare_tender_v3()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  destinations_value jsonb := coalesce(
    nullif(current_setting('app.pos_tender_destinations', true), '')::jsonb,
    '{}'::jsonb
  );
begin
  new.destination := coalesce(
    nullif(upper(destinations_value ->> upper(new.payment_method)), ''),
    'OUR_ACCOUNT'
  );
  if new.destination not in ('OUR_ACCOUNT', 'SUPPLIER_DIRECT')
    or (new.destination = 'SUPPLIER_DIRECT' and new.payment_method not in ('CARD', 'BANK')) then
    raise exception 'Tender destination is invalid' using errcode = '22023', hint = 'POS_TENDER_DESTINATION_INVALID';
  end if;
  return new;
end;
$$;

drop trigger if exists pos_transaction_tenders_prepare_v3 on public.pos_transaction_tenders;
create trigger pos_transaction_tenders_prepare_v3
before insert on public.pos_transaction_tenders
for each row execute function public.pos_prepare_tender_v3();

create or replace function public.pos_prepare_supplier_balance_entry_v3()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  settlement_mode_value text;
  correction_value boolean := coalesce(nullif(current_setting('app.pos_supplier_correction', true), '')::boolean, false);
begin
  select profile.settlement_mode into settlement_mode_value
  from public.pos_supplier_profiles profile
  where profile.supplier_vendor_id = new.supplier_vendor_id;

  if settlement_mode_value = 'PAY_ON_DEMAND' then
    return null;
  end if;
  if correction_value and new.movement_type = 'REFUND' then
    new.movement_type := 'CORRECTION';
  end if;
  return new;
end;
$$;

drop trigger if exists pos_supplier_balance_entries_prepare_v3 on public.pos_supplier_balance_entries;
create trigger pos_supplier_balance_entries_prepare_v3
before insert on public.pos_supplier_balance_entries
for each row execute function public.pos_prepare_supplier_balance_entry_v3();

create or replace function public.pos_post_transaction_v3(
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
  request_value jsonb := coalesce(p_request, '{}'::jsonb);
  entry_mode_value text := coalesce(nullif(upper(btrim(p_request ->> 'entryMode')), ''), 'CUSTOMER_PAYMENT');
  category_key_value text := nullif(btrim(p_request ->> 'categoryKey'), '');
  signed_amount_value numeric(14,2);
  category_row public.pos_categories%rowtype;
  item_row public.pos_catalogue_items%rowtype;
  supplier_id_value uuid;
  reporting_supplier_id_value uuid;
  supplier_profile public.pos_supplier_profiles%rowtype;
  supplier_source_name_value text := nullif(btrim(p_request ->> 'supplierSourceName'), '');
  normalized_source_name_value text;
  location_id_value uuid;
  category_id_value uuid;
  destination_map_value jsonb := '{}'::jsonb;
  tender_entry record;
  tender_method_value text;
  tender_destination_value text;
  response_value jsonb;
begin
  if jsonb_typeof(coalesce(p_request, 'null'::jsonb)) <> 'object'
    or entry_mode_value not in ('CUSTOMER_PAYMENT', 'SUPPLIER_PAYMENT') then
    raise exception 'Valid POS transaction request required' using errcode = '22023';
  end if;

  signed_amount_value := (p_request ->> 'totalAmount')::numeric;
  if signed_amount_value = 0 or scale(signed_amount_value) > 2 then
    raise exception 'Transaction amount is invalid' using errcode = '22023';
  end if;

  if category_key_value is null and entry_mode_value = 'CUSTOMER_PAYMENT' then
    select category.category_key into category_key_value
    from public.pos_catalogue_items item
    join public.pos_categories category on category.id = item.category_id
    where item.item_key = p_request ->> 'catalogueKey'
      and item.is_active and not item.is_system_action;
  end if;
  select * into category_row
  from public.pos_categories category
  where category.category_key = category_key_value and category.is_active;
  if not found then
    raise exception 'Active POS category required'
      using errcode = '22023', hint = 'POS_CATEGORY_REQUIRED';
  end if;

  if entry_mode_value = 'SUPPLIER_PAYMENT' then
    if not category_row.supplier_payments_enabled then
      raise exception 'Supplier payments are not enabled for this category'
        using errcode = '42501', hint = 'POS_SUPPLIER_CATEGORY_FORBIDDEN';
    end if;
    supplier_id_value := nullif(p_request ->> 'supplierId', '')::uuid;
    select * into supplier_profile
    from public.pos_supplier_profiles profile
    where profile.supplier_vendor_id = supplier_id_value and profile.is_active
    for update;
    if not found then
      raise exception 'Configured supplier not found' using errcode = 'P0002';
    end if;
    if not exists (
      select 1 from public.pos_category_suppliers assignment
      where assignment.category_id = category_row.id
        and assignment.supplier_vendor_id = supplier_id_value
        and assignment.is_active
    ) then
      raise exception 'Select a supplier assigned to this category'
        using errcode = '42501', hint = 'POS_SUPPLIER_CATEGORY_FORBIDDEN';
    end if;
    if signed_amount_value < 0 and length(coalesce(p_request ->> 'note', '')) < 3 then
      raise exception 'A note is required for a supplier deposit correction'
        using errcode = '22023', hint = 'POS_SUPPLIER_CORRECTION_NOTE_REQUIRED';
    end if;
    if supplier_profile.settlement_mode = 'PAY_ON_DEMAND' then
      if signed_amount_value < 0 then
        raise exception 'Pay-on-demand supplier corrections must use Accounting'
          using errcode = '22023', hint = 'POS_PAY_ON_DEMAND_CORRECTION_FORBIDDEN';
      end if;
      if length(coalesce(supplier_source_name_value, '')) not between 2 and 160 then
        raise exception 'Enter the ticketing supplier source'
          using errcode = '22023', hint = 'POS_SUPPLIER_SOURCE_REQUIRED';
      end if;
      normalized_source_name_value := lower(regexp_replace(supplier_source_name_value, '\s+', ' ', 'g'));
      perform set_config('app.pos_supplier_source_name', supplier_source_name_value, true);
    else
      supplier_source_name_value := null;
      perform set_config('app.pos_supplier_source_name', '', true);
    end if;

    perform set_config('app.pos_supplier_correction', (signed_amount_value < 0)::text, true);
    select coalesce(jsonb_object_agg(upper(entry.value ->> 'method'), 'OUR_ACCOUNT'), '{}'::jsonb)
    into destination_map_value
    from jsonb_array_elements(coalesce(p_request -> 'tenders', '[]'::jsonb)) entry(value);
    request_value := (request_value - 'supplierSourceName' - 'supplierMovementType' - 'outgoingType')
      || jsonb_build_object(
        'totalAmount', abs(signed_amount_value),
        'direction', case when signed_amount_value < 0 then 'IN' else 'OUT' end,
        'supplierMovementType', case when signed_amount_value < 0 then 'REFUND' else 'DEPOSIT' end
      );
    if signed_amount_value > 0 then
      request_value := request_value || jsonb_build_object('outgoingType', 'SUPPLIER_PAYMENT');
    end if;
    select * into item_row
    from public.pos_catalogue_items item
    where item.item_key = category_row.category_key || '-supplier-payment'
      and item.category_id = category_row.id and item.is_active;
  else
    if signed_amount_value <= 0 then
      raise exception 'Customer transaction amount must be positive' using errcode = '22023';
    end if;
    perform set_config('app.pos_supplier_source_name', '', true);
    perform set_config('app.pos_supplier_correction', 'false', true);
    select * into item_row
    from public.pos_catalogue_items item
    where item.item_key = p_request ->> 'catalogueKey'
      and item.category_id = category_row.id
      and item.is_active and not item.is_system_action and item.classification <> 'SUPPLIER';
    reporting_supplier_id_value := item_row.default_supplier_vendor_id;
    if category_row.category_key = 'remittance' and reporting_supplier_id_value is null then
      raise exception 'A remittance provider is required'
        using errcode = '22023', hint = 'POS_REMITTANCE_PROVIDER_REQUIRED';
    end if;
    if item_row.tracked_source_type is not null
      and upper(coalesce(p_request -> 'source' ->> 'type', '')) is distinct from item_row.tracked_source_type then
      raise exception 'The service requires its protected source type'
        using errcode = '22023', hint = 'POS_SOURCE_LINK_REQUIRED';
    end if;
    if item_row.price_required and nullif(p_request ->> 'pricingId', '') is null
      and coalesce((p_request ->> 'pricingConfirmed')::boolean, false) is false then
      raise exception 'Select a price or confirm the manual amount'
        using errcode = '22023', hint = 'POS_PRICING_CONFIRMATION_REQUIRED';
    end if;
    for tender_entry in
      select value from jsonb_array_elements(coalesce(p_request -> 'tenders', '[]'::jsonb))
    loop
      tender_method_value := upper(tender_entry.value ->> 'method');
      tender_destination_value := coalesce(
        nullif(upper(tender_entry.value ->> 'destination'), ''),
        case when category_key_value = 'remittance' and tender_method_value in ('CARD', 'BANK')
          then 'SUPPLIER_DIRECT' else 'OUR_ACCOUNT' end
      );
      if tender_destination_value not in ('OUR_ACCOUNT', 'SUPPLIER_DIRECT')
        or (tender_destination_value = 'SUPPLIER_DIRECT'
          and (category_key_value <> 'remittance' or tender_method_value not in ('CARD', 'BANK'))) then
        raise exception 'Tender destination is invalid'
          using errcode = '22023', hint = 'POS_TENDER_DESTINATION_INVALID';
      end if;
      destination_map_value := destination_map_value
        || jsonb_build_object(tender_method_value, tender_destination_value);
    end loop;
  end if;

  if item_row.id is null then
    raise exception 'Active POS service required'
      using errcode = '22023', hint = 'POS_SERVICE_REQUIRED';
  end if;
  request_value := (request_value - 'categoryKey' - 'entryMode')
    || jsonb_build_object('catalogueKey', item_row.item_key);

  perform set_config('app.pos_tender_destinations', destination_map_value::text, true);
  perform set_config('app.pos_category_id', category_row.id::text, true);
  perform set_config('app.pos_category_label', category_row.label, true);
  perform set_config('app.pos_service_label', coalesce(item_row.option_label, item_row.label), true);
  perform set_config('app.pos_reporting_supplier_id', coalesce(reporting_supplier_id_value::text, ''), true);
  response_value := public.pos_post_transaction_v1(
    p_actor_employee_id,
    p_idempotency_key,
    request_value
  );

  if entry_mode_value = 'SUPPLIER_PAYMENT'
    and supplier_profile.settlement_mode = 'PAY_ON_DEMAND'
    and coalesce((response_value ->> 'idempotentReplay')::boolean, false) = false then
    select employee.location_id into location_id_value
    from public.employees employee
    where employee.id = p_actor_employee_id;
    select category.id into category_id_value
    from public.pos_categories category
    where category.category_key = category_key_value;

    insert into public.pos_supplier_source_history(
      location_id, category_id, supplier_vendor_id, source_name, normalized_name
    ) values (
      location_id_value, category_id_value, supplier_id_value,
      supplier_source_name_value, normalized_source_name_value
    )
    on conflict (location_id, category_id, normalized_name) do update set
      source_name = excluded.source_name,
      supplier_vendor_id = excluded.supplier_vendor_id,
      use_count = public.pos_supplier_source_history.use_count + 1,
      last_used_at = clock_timestamp();
  end if;

  perform set_config('app.pos_tender_destinations', '{}', true);
  perform set_config('app.pos_supplier_source_name', '', true);
  perform set_config('app.pos_supplier_correction', 'false', true);
  perform set_config('app.pos_category_id', '', true);
  perform set_config('app.pos_category_label', '', true);
  perform set_config('app.pos_service_label', '', true);
  perform set_config('app.pos_reporting_supplier_id', '', true);
  return response_value || jsonb_build_object(
    'supplierMovementType', case
      when entry_mode_value <> 'SUPPLIER_PAYMENT' then null
      when signed_amount_value < 0 then 'CORRECTION'
      when supplier_profile.settlement_mode = 'PAY_ON_DEMAND' then 'PAY_ON_DEMAND'
      else 'DEPOSIT'
    end
  );
exception
  when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'Invalid POS transaction details' using errcode = '22023';
end;
$$;

create or replace function public.pos_manage_configuration_v3(
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
  supplier_id_value uuid := nullif(p_request ->> 'supplierId', '')::uuid;
  protected_profile public.pos_supplier_profiles%rowtype;
  response_value jsonb;
begin
  if p_request ->> 'action' = 'UPSERT_SERVICE' and (
    jsonb_typeof(p_request -> 'allowedPaymentMethods') <> 'array'
    or jsonb_array_length(p_request -> 'allowedPaymentMethods') = 0
    or exists (
      select 1
      from jsonb_array_elements_text(p_request -> 'allowedPaymentMethods') method(value)
      where upper(method.value) not in ('CASH', 'CARD', 'BANK')
    )
  ) then
    raise exception 'Quick-entry payment methods must be Cash, Card, or Bank'
      using errcode = '22023';
  end if;

  if p_request ->> 'action' = 'UPSERT_SUPPLIER' and supplier_id_value is not null then
    select * into protected_profile
    from public.pos_supplier_profiles profile
    where profile.supplier_vendor_id = supplier_id_value;
    if found and protected_profile.is_system and (
      exists (
        select 1 from public.supplier_vendors supplier
        where supplier.id = supplier_id_value
          and lower(btrim(supplier.name)) <> lower(btrim(p_request ->> 'name'))
      )
      or (p_request ? 'settlementMode'
        and p_request ->> 'settlementMode' is distinct from protected_profile.settlement_mode)
      or (p_request ? 'logoKey'
        and nullif(p_request ->> 'logoKey', '') is distinct from protected_profile.logo_key)
    ) then
      raise exception 'System supplier identity and routing are protected' using errcode = '42501';
    end if;
  end if;

  response_value := public.pos_manage_configuration_v2(
    p_actor_employee_id,
    p_idempotency_key,
    p_request
  );
  if p_request ->> 'action' = 'UPSERT_SUPPLIER' then
    supplier_id_value := (response_value ->> 'id')::uuid;
    update public.pos_supplier_profiles set
      settlement_mode = coalesce(nullif(p_request ->> 'settlementMode', ''), settlement_mode),
      logo_key = case
        when p_request ? 'logoKey' then nullif(p_request ->> 'logoKey', '')
        else logo_key
      end,
      updated_at = clock_timestamp()
    where supplier_vendor_id = supplier_id_value;
  end if;
  return response_value;
end;
$$;

revoke all on function public.pos_post_transaction_v2(uuid,text,jsonb) from service_role;
revoke all on function public.pos_manage_configuration_v2(uuid,text,jsonb) from service_role;
revoke all on function public.pos_post_transaction_v3(uuid,text,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.pos_manage_configuration_v3(uuid,text,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.pos_prepare_transaction_v3() from public,anon,authenticated,service_role;
revoke all on function public.pos_prepare_tender_v3() from public,anon,authenticated,service_role;
revoke all on function public.pos_prepare_supplier_balance_entry_v3() from public,anon,authenticated,service_role;
grant execute on function public.pos_post_transaction_v3(uuid,text,jsonb) to service_role;
grant execute on function public.pos_manage_configuration_v3(uuid,text,jsonb) to service_role;

insert into public.portal_schema_versions(component, version, applied_at)
values ('pos', 2026090902, clock_timestamp())
on conflict (component) do update set
  version = excluded.version,
  applied_at = excluded.applied_at;

commit;
