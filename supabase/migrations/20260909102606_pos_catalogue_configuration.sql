-- POS catalogue simplification and Accounting-managed configuration.
-- Keeps the 2026090801 accounting foundation intact and layers category/service configuration over it.

begin;
select pg_advisory_xact_lock(hashtextextended('pos:schema-migration', 0));

do $pos_forward_guard$
declare installed_version bigint;
begin
  select version into installed_version from public.portal_schema_versions where component = 'pos' for update;
  if installed_version is null or installed_version < 2026090801 then
    raise exception 'POS foundation capability 2026090801 must be installed first'
      using errcode = '55000', hint = 'POS_FOUNDATION_REQUIRED';
  end if;
  if installed_version > 2026090901 then
    raise exception 'POS catalogue migration cannot run after installed capability %', installed_version
      using errcode = '55000', hint = 'POS_FORWARD_MIGRATION_REPLAY_BLOCKED';
  end if;
end
$pos_forward_guard$;

create table if not exists public.pos_categories (
  id uuid primary key default gen_random_uuid(),
  category_key text not null unique check (category_key ~ '^[a-z][a-z0-9_-]{1,63}$'),
  label text not null check (length(btrim(label)) between 1 and 100),
  description text check (description is null or length(btrim(description)) between 1 and 240),
  icon_key text not null default 'sparkles' check (icon_key ~ '^[a-z][a-z0-9_-]{1,63}$'),
  display_order integer not null default 100 check (display_order >= 0),
  supplier_payments_enabled boolean not null default false,
  is_system boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);

alter table public.pos_catalogue_items
  add column if not exists category_id uuid references public.pos_categories(id) on delete restrict,
  add column if not exists logo_key text check (logo_key is null or logo_key ~ '^[a-z][a-z0-9_-]{1,63}$'),
  add column if not exists is_system_action boolean not null default false,
  add column if not exists is_quick_entry boolean not null default true,
  add column if not exists price_required boolean not null default false,
  add column if not exists default_supplier_vendor_id uuid references public.supplier_vendors(id) on delete restrict;
alter table public.pos_catalogue_items drop constraint if exists pos_catalogue_logo_key_check;
alter table public.pos_catalogue_items add constraint pos_catalogue_logo_key_check
  check (logo_key is null or logo_key in ('ria','moneygram','western-union','dex','intercity'));

create table if not exists public.pos_category_suppliers (
  category_id uuid not null references public.pos_categories(id) on delete restrict,
  supplier_vendor_id uuid not null references public.supplier_vendors(id) on delete restrict,
  is_default boolean not null default false,
  is_active boolean not null default true,
  configured_by uuid references public.employees(id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  primary key (category_id, supplier_vendor_id)
);
create unique index if not exists pos_category_suppliers_one_default_uq
  on public.pos_category_suppliers(category_id) where is_default and is_active;
create index if not exists pos_category_suppliers_supplier_idx
  on public.pos_category_suppliers(supplier_vendor_id, category_id) where is_active;

alter table public.pos_supplier_profiles alter column configured_by drop not null;

alter table public.pos_transactions
  add column if not exists category_id uuid references public.pos_categories(id) on delete restrict,
  add column if not exists category_label_snapshot text,
  add column if not exists service_label_snapshot text,
  add column if not exists supplier_name_snapshot text,
  add column if not exists reporting_supplier_vendor_id uuid references public.supplier_vendors(id) on delete restrict;
create index if not exists pos_transactions_category_idx
  on public.pos_transactions(location_id, category_id, business_date desc);
create index if not exists pos_transactions_reporting_supplier_idx
  on public.pos_transactions(location_id, reporting_supplier_vendor_id, occurred_at desc)
  where reporting_supplier_vendor_id is not null;

insert into public.pos_categories (
  category_key, label, description, icon_key, display_order, supplier_payments_enabled, is_system
) values
  ('applications','Applications','Identity, passport and visa applications','file-text',10,false,true),
  ('ticketing-packages','Ticketing & Packages','Tickets and travel packages','plane',20,true,true),
  ('remittance','Remittance','Send money with an approved provider','landmark',30,true,true),
  ('cargo','Cargo','Cargo and delivery services','package',40,true,true),
  ('document-assistance','Document Assistance','Printing, copying and document help','files',50,false,true),
  ('other','Other','Expenses, donations, other income and refund access','shapes',60,false,true)
on conflict (category_key) do update set
  label = excluded.label,
  description = excluded.description,
  icon_key = excluded.icon_key,
  display_order = excluded.display_order,
  supplier_payments_enabled = excluded.supplier_payments_enabled,
  is_system = true,
  is_active = true,
  updated_at = clock_timestamp();

-- Seed the approved remittance suppliers. System-owned profiles may have no configuring employee.
with providers(name) as (
  values ('Ria'), ('MoneyGram'), ('Western Union'), ('DEX'), ('Intercity')
)
insert into public.supplier_vendors (name, vendor_type, is_approved)
select name, 'Supplier', true from providers
on conflict (lower(btrim(name))) do update set is_approved = true;

insert into public.pos_supplier_profiles (supplier_vendor_id, alternate_names, source_area, is_active, configured_by)
select vendor.id, '{}'::text[], 'Remittance', true, null
from public.supplier_vendors vendor
where lower(btrim(vendor.name)) in ('ria','moneygram','western union','dex','intercity')
on conflict (supplier_vendor_id) do update set
  source_area = 'Remittance', is_active = true, updated_at = clock_timestamp();

-- Existing stable keys remain in place for historical joins, but superseded quick entries are hidden.
update public.pos_catalogue_items set is_quick_entry = false, updated_at = clock_timestamp()
where item_key in ('ticket-package','remittance-fee','document-help','printing-copying','other-service','expense','supplier-payment','general-refund');

insert into public.pos_catalogue_items (
  item_key, group_key, label, option_label, classification, default_direction, allowed_directions,
  tracked_source_type, source_required, customer_required, loyalty_eligible, points_per_gbp,
  allowed_payment_methods, note_required, shortcut, display_order, category_id, logo_key,
  is_system_action, default_supplier_vendor_id, is_active
) values
  ('ticketing','ticketing-packages','Ticketing','Ticketing','SERVICE','IN',array['IN'],'TICKETING',true,true,false,0,array['CASH','CARD','BANK'],false,'T',10,(select id from public.pos_categories where category_key='ticketing-packages'),null,false,null,true),
  ('package','ticketing-packages','Package','Package','SERVICE','IN',array['IN'],'PACKAGES',true,true,false,0,array['CASH','CARD','BANK'],false,'K',20,(select id from public.pos_categories where category_key='ticketing-packages'),null,false,null,true),
  ('ria-remittance','remittance','Ria','Ria','SERVICE','IN',array['IN'],null,false,false,true,1,array['CASH','CARD','BANK'],false,'R',10,(select id from public.pos_categories where category_key='remittance'),'ria',false,(select id from public.supplier_vendors where lower(btrim(name))='ria'),true),
  ('moneygram-remittance','remittance','MoneyGram','MoneyGram','SERVICE','IN',array['IN'],null,false,false,true,1,array['CASH','CARD','BANK'],false,'M',20,(select id from public.pos_categories where category_key='remittance'),'moneygram',false,(select id from public.supplier_vendors where lower(btrim(name))='moneygram'),true),
  ('western-union-remittance','remittance','Western Union','Western Union','SERVICE','IN',array['IN'],null,false,false,true,1,array['CASH','CARD','BANK'],false,'W',30,(select id from public.pos_categories where category_key='remittance'),'western-union',false,(select id from public.supplier_vendors where lower(btrim(name))='western union'),true),
  ('dex-remittance','remittance','DEX','DEX','SERVICE','IN',array['IN'],null,false,false,true,1,array['CASH','CARD','BANK'],false,'X',40,(select id from public.pos_categories where category_key='remittance'),'dex',false,(select id from public.supplier_vendors where lower(btrim(name))='dex'),true),
  ('intercity-remittance','remittance','Intercity','Intercity','SERVICE','IN',array['IN'],null,false,false,true,1,array['CASH','CARD','BANK'],false,'I',50,(select id from public.pos_categories where category_key='remittance'),'intercity',false,(select id from public.supplier_vendors where lower(btrim(name))='intercity'),true),
  ('cargo-delivery','cargo','Cargo / Delivery','Cargo / Delivery','SERVICE','IN',array['IN'],null,false,false,true,1,array['CASH','CARD','BANK'],false,'C',10,(select id from public.pos_categories where category_key='cargo'),null,false,null,true),
  ('document-assistance','document-assistance','Document Assistance','Document Assistance','SERVICE','IN',array['IN'],null,false,false,true,1,array['CASH','CARD','BANK'],false,'D',10,(select id from public.pos_categories where category_key='document-assistance'),null,false,null,true),
  ('general-expense','other','General expense','General expense','EXPENSE','OUT',array['OUT'],null,false,false,false,0,array['CASH','CARD','BANK','OTHER'],true,'E',10,(select id from public.pos_categories where category_key='other'),null,false,null,true),
  ('donation','other','Donation','Donation','EXPENSE','OUT',array['OUT'],null,false,false,false,0,array['CASH','CARD','BANK','OTHER'],true,'N',20,(select id from public.pos_categories where category_key='other'),null,false,null,true),
  ('other-income','other','Other income','Other income','SERVICE','IN',array['IN'],null,false,false,false,0,array['CASH','CARD','BANK','OTHER'],true,'O',30,(select id from public.pos_categories where category_key='other'),null,false,null,true),
  ('ticketing-packages-supplier-payment','ticketing-packages','Pay supplier','Pay supplier','SUPPLIER','OUT',array['IN','OUT'],null,false,false,false,0,array['CASH','CARD','BANK','OTHER'],true,null,900,(select id from public.pos_categories where category_key='ticketing-packages'),null,true,null,true),
  ('remittance-supplier-payment','remittance','Pay supplier','Pay supplier','SUPPLIER','OUT',array['IN','OUT'],null,false,false,false,0,array['CASH','CARD','BANK','OTHER'],true,null,900,(select id from public.pos_categories where category_key='remittance'),null,true,null,true),
  ('cargo-supplier-payment','cargo','Pay supplier','Pay supplier','SUPPLIER','OUT',array['IN','OUT'],null,false,false,false,0,array['CASH','CARD','BANK','OTHER'],true,null,900,(select id from public.pos_categories where category_key='cargo'),null,true,null,true)
on conflict (item_key) do update set
  group_key=excluded.group_key, label=excluded.label, option_label=excluded.option_label,
  classification=excluded.classification, default_direction=excluded.default_direction,
  allowed_directions=excluded.allowed_directions, tracked_source_type=excluded.tracked_source_type,
  source_required=excluded.source_required, customer_required=excluded.customer_required,
  loyalty_eligible=excluded.loyalty_eligible, points_per_gbp=excluded.points_per_gbp,
  allowed_payment_methods=excluded.allowed_payment_methods, note_required=excluded.note_required,
  shortcut=excluded.shortcut, display_order=excluded.display_order, category_id=excluded.category_id,
  logo_key=excluded.logo_key, is_system_action=excluded.is_system_action,
  default_supplier_vendor_id=excluded.default_supplier_vendor_id, is_active=true, updated_at=clock_timestamp();

update public.pos_catalogue_items item set category_id = category.id
from public.pos_categories category
where item.category_id is null and category.category_key = case
  when item.item_key in ('nicop-cnic','poc','frc','crc','poa','pk-passport','gb-passport','visa') then 'applications'
  when item.item_key in ('ticket-package','ticketing','package') then 'ticketing-packages'
  when item.item_key = 'remittance-fee' then 'remittance'
  when item.item_key in ('cargo-delivery') then 'cargo'
  when item.item_key in ('document-help','printing-copying','document-assistance') then 'document-assistance'
  else 'other' end;

update public.pos_catalogue_items item set
  group_key='applications', category_id=category.id, updated_at=clock_timestamp()
from public.pos_categories category
where category.category_key='applications'
  and item.item_key in ('nicop-cnic','poc','frc','crc','poa','pk-passport','gb-passport','visa');
update public.pos_catalogue_items set price_required=true
where item_key in ('nicop-cnic','poc','frc','crc','poa','pk-passport','gb-passport','visa');

insert into public.pos_category_suppliers (category_id, supplier_vendor_id, is_default, is_active)
select category.id, vendor.id, false, true
from public.pos_categories category
cross join public.supplier_vendors vendor
where category.category_key='remittance'
  and lower(btrim(vendor.name)) in ('ria','moneygram','western union','dex','intercity')
on conflict (category_id, supplier_vendor_id) do update set is_active=true, updated_at=clock_timestamp();

update public.pos_transactions tx set
  category_id = item.category_id,
  category_label_snapshot = category.label,
  service_label_snapshot = coalesce(item.option_label, item.label),
  supplier_name_snapshot = (
    select supplier.name from public.supplier_vendors supplier
    where supplier.id=tx.supplier_vendor_id
  )
from public.pos_catalogue_items item
join public.pos_categories category on category.id=item.category_id
where tx.catalogue_item_id=item.id
  and (tx.category_id is null or tx.category_label_snapshot is null or tx.service_label_snapshot is null);

create or replace function public.pos_snapshot_transaction_labels_v2()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare item_row public.pos_catalogue_items%rowtype;
begin
  select * into item_row from public.pos_catalogue_items where id=new.catalogue_item_id;
  new.category_id := coalesce(new.category_id,item_row.category_id);
  new.category_label_snapshot := coalesce(new.category_label_snapshot,(
    select category.label from public.pos_categories category where category.id=new.category_id
  ));
  new.service_label_snapshot := coalesce(new.service_label_snapshot,coalesce(item_row.option_label,item_row.label));
  new.supplier_name_snapshot := coalesce(new.supplier_name_snapshot,(
    select supplier.name from public.supplier_vendors supplier where supplier.id=new.supplier_vendor_id
  ));
  return new;
end;
$$;
drop trigger if exists pos_transactions_snapshot_labels_v2 on public.pos_transactions;
create trigger pos_transactions_snapshot_labels_v2
before insert on public.pos_transactions
for each row execute function public.pos_snapshot_transaction_labels_v2();

alter table public.pos_transactions
  alter column category_id set not null,
  alter column category_label_snapshot set not null,
  alter column service_label_snapshot set not null;
alter table public.pos_catalogue_items alter column category_id set not null;

alter table public.pos_audit_events drop constraint if exists pos_audit_events_entity_type_check;
alter table public.pos_audit_events add constraint pos_audit_events_entity_type_check
  check (entity_type in ('SHIFT','TRANSACTION','REFUND','CASH_MOVEMENT','CLOSEOUT','SUPPLIER','IMPORT','CORRECTION','CONFIGURATION'));

alter table public.pos_categories enable row level security;
alter table public.pos_categories force row level security;
alter table public.pos_category_suppliers enable row level security;
alter table public.pos_category_suppliers force row level security;
revoke all on table public.pos_categories from public, anon, authenticated, service_role;
revoke all on table public.pos_category_suppliers from public, anon, authenticated, service_role;
grant select on table public.pos_categories to service_role;
grant select on table public.pos_category_suppliers to service_role;

create or replace function public.pos_post_transaction_v2(
  p_actor_employee_id uuid, p_idempotency_key text, p_request jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  category_row public.pos_categories%rowtype;
  item_row public.pos_catalogue_items%rowtype;
  supplier_row public.supplier_vendors%rowtype;
  request_value jsonb := coalesce(p_request, '{}'::jsonb);
  category_key_value text := nullif(btrim(p_request->>'categoryKey'),'');
  catalogue_key_value text := nullif(btrim(p_request->>'catalogueKey'),'');
  entry_mode_value text := coalesce(nullif(btrim(p_request->>'entryMode'),''),'CUSTOMER_PAYMENT');
  supplier_id_value uuid;
  reporting_supplier_id_value uuid;
  response_value jsonb;
  transaction_id_value uuid;
begin
  if entry_mode_value not in ('CUSTOMER_PAYMENT','SUPPLIER_PAYMENT') then
    raise exception 'Valid POS action required' using errcode='22023';
  end if;
  if category_key_value is null and entry_mode_value='CUSTOMER_PAYMENT' then
    select category.category_key into category_key_value
    from public.pos_catalogue_items item
    join public.pos_categories category on category.id=item.category_id
    where item.item_key=catalogue_key_value and item.is_active and not item.is_system_action;
  end if;
  select * into category_row from public.pos_categories
  where category_key=category_key_value and is_active;
  if not found then raise exception 'Active POS category required' using errcode='22023', hint='POS_CATEGORY_REQUIRED'; end if;

  if entry_mode_value='SUPPLIER_PAYMENT' then
    if not category_row.supplier_payments_enabled then
      raise exception 'Supplier payments are not enabled for this category' using errcode='42501', hint='POS_SUPPLIER_CATEGORY_FORBIDDEN';
    end if;
    supplier_id_value := nullif(p_request->>'supplierId','')::uuid;
    if supplier_id_value is null or not exists (
      select 1 from public.pos_category_suppliers assignment
      join public.pos_supplier_profiles profile on profile.supplier_vendor_id=assignment.supplier_vendor_id and profile.is_active
      where assignment.category_id=category_row.id and assignment.supplier_vendor_id=supplier_id_value and assignment.is_active
    ) then
      raise exception 'Select a supplier assigned to this category' using errcode='42501', hint='POS_SUPPLIER_CATEGORY_FORBIDDEN';
    end if;
    catalogue_key_value := category_row.category_key || '-supplier-payment';
  end if;

  select * into item_row from public.pos_catalogue_items
  where item_key=catalogue_key_value and category_id=category_row.id and is_active;
  if not found or (entry_mode_value='CUSTOMER_PAYMENT' and (item_row.is_system_action or item_row.classification='SUPPLIER')) then
    raise exception 'Active POS service required' using errcode='22023', hint='POS_SERVICE_REQUIRED';
  end if;

  if entry_mode_value='CUSTOMER_PAYMENT' then
    reporting_supplier_id_value := item_row.default_supplier_vendor_id;
    if category_row.category_key='remittance' and reporting_supplier_id_value is null then
      raise exception 'A remittance provider is required' using errcode='22023', hint='POS_REMITTANCE_PROVIDER_REQUIRED';
    end if;
    if item_row.tracked_source_type is not null
      and upper(coalesce(p_request->'source'->>'type','')) is distinct from item_row.tracked_source_type then
      raise exception 'The service requires its protected source type' using errcode='22023', hint='POS_SOURCE_LINK_REQUIRED';
    end if;
    if item_row.price_required and nullif(p_request->>'pricingId','') is null
      and coalesce((p_request->>'pricingConfirmed')::boolean,false) is false then
      raise exception 'Select a price or confirm the manual amount' using errcode='22023', hint='POS_PRICING_CONFIRMATION_REQUIRED';
    end if;
  end if;

  request_value := (request_value - 'categoryKey' - 'entryMode') || jsonb_build_object('catalogueKey', item_row.item_key);
  response_value := public.pos_post_transaction_v1(p_actor_employee_id, p_idempotency_key, request_value);
  transaction_id_value := (response_value->>'transactionId')::uuid;
  select * into supplier_row from public.supplier_vendors
  where id=coalesce(supplier_id_value, reporting_supplier_id_value);
  update public.pos_transactions set
    category_id=category_row.id,
    category_label_snapshot=category_row.label,
    service_label_snapshot=coalesce(item_row.option_label,item_row.label),
    supplier_name_snapshot=case when supplier_row.id is not null then supplier_row.name else null end,
    reporting_supplier_vendor_id=reporting_supplier_id_value
  where id=transaction_id_value;
  return response_value || jsonb_build_object('categoryKey',category_row.category_key);
exception when invalid_text_representation then
  raise exception 'Valid supplier required' using errcode='22023';
end;
$$;

create or replace function public.pos_manage_configuration_v2(
  p_actor_employee_id uuid, p_idempotency_key text, p_request jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  action_name_value constant text := 'pos.manage_configuration.v2';
  action_value text := p_request->>'action';
  actor_location_id uuid;
  entity_id_value uuid;
  supplier_id_value uuid;
  category_id_value uuid;
  existing_request jsonb;
  existing_response jsonb;
  response_value jsonb;
begin
  if length(btrim(coalesce(p_idempotency_key,''))) not between 8 and 200
    or jsonb_typeof(coalesce(p_request,'null'::jsonb)) <> 'object'
    or action_value not in ('UPSERT_CATEGORY','UPSERT_SERVICE','UPSERT_SUPPLIER','SET_ASSIGNMENT') then
    raise exception 'Valid idempotent configuration action required' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(action_name_value || ':' || p_actor_employee_id || ':' || p_idempotency_key,0));
  select request_payload,response_payload into existing_request,existing_response
  from public.pos_idempotency_keys where action_name=action_name_value and actor_employee_id=p_actor_employee_id and idempotency_key=p_idempotency_key;
  if found then
    if existing_request is distinct from p_request then raise exception 'Idempotency conflict' using errcode='22023',hint='POS_IDEMPOTENCY_CONFLICT'; end if;
    return existing_response || jsonb_build_object('idempotentReplay',true);
  end if;
  select employee.location_id into actor_location_id from public.employees employee
  where employee.id=p_actor_employee_id and employee.is_active and (
    exists (select 1 from public.roles role where role.id=employee.role_id and role.level <= 2)
    or exists (
      select 1 from public.employee_departments membership join public.departments department on department.id=membership.department_id
      where membership.employee_id=employee.id and lower(btrim(department.name)) in ('accounts','accounting')
    )
  );
  if not found then raise exception 'Accounting access required' using errcode='42501'; end if;

  if action_value='UPSERT_CATEGORY' then
    insert into public.pos_categories (category_key,label,description,icon_key,display_order,supplier_payments_enabled,is_active)
    values (p_request->>'key',p_request->>'label',nullif(btrim(p_request->>'description'),''),coalesce(nullif(p_request->>'iconKey',''),'sparkles'),
      coalesce((p_request->>'displayOrder')::integer,100),coalesce((p_request->>'supplierPaymentsEnabled')::boolean,false),coalesce((p_request->>'isActive')::boolean,true))
    on conflict (category_key) do update set label=excluded.label,description=excluded.description,icon_key=excluded.icon_key,
      display_order=excluded.display_order,supplier_payments_enabled=excluded.supplier_payments_enabled,is_active=excluded.is_active,updated_at=clock_timestamp()
    returning id into entity_id_value;
  elsif action_value='UPSERT_SERVICE' then
    select id into category_id_value from public.pos_categories where category_key=p_request->>'categoryKey';
    if category_id_value is null then raise exception 'Category not found' using errcode='P0002'; end if;
    if (p_request->>'key'='donation' and (p_request->>'direction'<>'OUT' or coalesce(p_request->>'classification','SERVICE')<>'EXPENSE'))
      or (p_request->>'key'='other-income' and p_request->>'direction'<>'IN') then
      raise exception 'Protected money direction cannot be changed' using errcode='42501';
    end if;
    if exists (
      select 1 from public.pos_catalogue_items item
      where item.item_key=p_request->>'key' and item.tracked_source_type is not null
        and (item.category_id is distinct from category_id_value
          or item.classification is distinct from coalesce(p_request->>'classification','SERVICE')
          or item.default_direction is distinct from p_request->>'direction'
          or item.source_required is distinct from coalesce((p_request->>'sourceRequired')::boolean,false))
    ) then
      raise exception 'System-integrated POS service contract is protected' using errcode='42501';
    end if;
    insert into public.pos_catalogue_items (
      item_key,group_key,label,option_label,classification,default_direction,allowed_directions,source_required,customer_required,
      loyalty_eligible,points_per_gbp,allowed_payment_methods,note_required,price_required,display_order,category_id,logo_key,is_active
    ) values (
      p_request->>'key',p_request->>'categoryKey',p_request->>'label',p_request->>'label',coalesce(p_request->>'classification','SERVICE'),
      p_request->>'direction',array[p_request->>'direction'],coalesce((p_request->>'sourceRequired')::boolean,false),
      coalesce((p_request->>'customerRequired')::boolean,false),coalesce((p_request->>'loyaltyEligible')::boolean,false),
      coalesce((p_request->>'pointsPerGbp')::numeric,0),coalesce(array(select jsonb_array_elements_text(p_request->'allowedPaymentMethods')),array['CASH','CARD','BANK']::text[]),
      coalesce((p_request->>'noteRequired')::boolean,false),coalesce((p_request->>'priceRequired')::boolean,false),coalesce((p_request->>'displayOrder')::integer,100),category_id_value,
      nullif(p_request->>'logoKey',''),coalesce((p_request->>'isActive')::boolean,true)
    ) on conflict (item_key) do update set label=excluded.label,option_label=excluded.option_label,classification=excluded.classification,
      default_direction=excluded.default_direction,allowed_directions=excluded.allowed_directions,source_required=excluded.source_required,
      customer_required=excluded.customer_required,loyalty_eligible=excluded.loyalty_eligible,points_per_gbp=excluded.points_per_gbp,
      allowed_payment_methods=excluded.allowed_payment_methods,note_required=excluded.note_required,price_required=excluded.price_required,display_order=excluded.display_order,
      category_id=excluded.category_id,logo_key=excluded.logo_key,is_active=excluded.is_active,updated_at=clock_timestamp()
    returning id into entity_id_value;
  elsif action_value='UPSERT_SUPPLIER' then
    supplier_id_value := nullif(p_request->>'supplierId','')::uuid;
    if supplier_id_value is not null then
      update public.supplier_vendors set name=p_request->>'name',is_approved=true where id=supplier_id_value returning id into supplier_id_value;
      if not found then raise exception 'Supplier not found' using errcode='P0002'; end if;
    else
      insert into public.supplier_vendors(name,vendor_type,is_approved) values (p_request->>'name','Supplier',true)
      on conflict (lower(btrim(name))) do update set is_approved=true returning id into supplier_id_value;
    end if;
    insert into public.pos_supplier_profiles(supplier_vendor_id,alternate_names,source_area,source_reference,is_active,configured_by)
    values (supplier_id_value,coalesce(array(select jsonb_array_elements_text(p_request->'aliases')),'{}'::text[]),nullif(p_request->>'sourceArea',''),nullif(p_request->>'sourceReference',''),coalesce((p_request->>'isActive')::boolean,true),p_actor_employee_id)
    on conflict (supplier_vendor_id) do update set alternate_names=excluded.alternate_names,source_area=excluded.source_area,
      source_reference=excluded.source_reference,is_active=excluded.is_active,configured_by=p_actor_employee_id,updated_at=clock_timestamp();
    entity_id_value := supplier_id_value;
  else
    select id into category_id_value from public.pos_categories where category_key=p_request->>'categoryKey';
    supplier_id_value := (p_request->>'supplierId')::uuid;
    if coalesce((p_request->>'isDefault')::boolean,false) then
      update public.pos_category_suppliers set is_default=false,updated_at=clock_timestamp() where category_id=category_id_value;
    end if;
    insert into public.pos_category_suppliers(category_id,supplier_vendor_id,is_default,is_active,configured_by)
    values(category_id_value,supplier_id_value,coalesce((p_request->>'isDefault')::boolean,false),coalesce((p_request->>'isActive')::boolean,true),p_actor_employee_id)
    on conflict(category_id,supplier_vendor_id) do update set is_default=excluded.is_default,is_active=excluded.is_active,
      configured_by=p_actor_employee_id,updated_at=clock_timestamp();
    entity_id_value := category_id_value;
  end if;
  response_value := jsonb_build_object('id',entity_id_value,'action',action_value,'idempotentReplay',false);
  insert into public.pos_audit_events(location_id,actor_employee_id,event_type,entity_type,entity_id,event_summary,metadata)
  values(actor_location_id,p_actor_employee_id,'configuration.changed','CONFIGURATION',entity_id_value,'POS configuration changed',p_request-'action');
  insert into public.pos_idempotency_keys(action_name,actor_employee_id,idempotency_key,request_payload,response_payload)
  values(action_name_value,p_actor_employee_id,p_idempotency_key,p_request,response_value);
  return response_value;
exception when invalid_text_representation or numeric_value_out_of_range then
  raise exception 'Invalid POS configuration value' using errcode='22023';
end;
$$;

revoke all on function public.pos_post_transaction_v1(uuid,text,jsonb) from service_role;
revoke all on function public.pos_configure_supplier_v1(uuid,text,jsonb) from service_role;
revoke all on function public.pos_post_transaction_v2(uuid,text,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.pos_manage_configuration_v2(uuid,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.pos_post_transaction_v2(uuid,text,jsonb) to service_role;
grant execute on function public.pos_manage_configuration_v2(uuid,text,jsonb) to service_role;

insert into public.portal_schema_versions(component,version,applied_at)
values('pos',2026090901,clock_timestamp())
on conflict(component) do update set version=excluded.version,applied_at=excluded.applied_at;

commit;
