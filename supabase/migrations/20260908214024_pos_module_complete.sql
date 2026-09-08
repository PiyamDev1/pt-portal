-- Complete POS daily transaction foundation.
--
-- The legacy daily_ledger_* tables remain untouched as an Excel-era import source. They lack the
-- location, till, status, idempotency, audit, refund and reserve contracts needed for money writes.
-- All POS mutations are therefore append-only and pass through service-role-only PostgreSQL functions.

begin;
select pg_advisory_xact_lock(hashtextextended('pos:schema-migration', 0));

do $pos_forward_guard$
declare
  installed_version bigint;
begin
  select version into installed_version
  from public.portal_schema_versions
  where component = 'pos'
  for update;

  if installed_version is not null and installed_version > 2026090801 then
    raise exception 'POS migration capability % cannot run after installed capability %',
      2026090801, installed_version
      using errcode = '55000', hint = 'POS_FORWARD_MIGRATION_REPLAY_BLOCKED';
  end if;
end
$pos_forward_guard$;

create table if not exists public.pos_catalogue_items (
  id uuid primary key default gen_random_uuid(),
  item_key text not null unique check (item_key ~ '^[a-z][a-z0-9_-]{1,63}$'),
  group_key text not null check (group_key ~ '^[a-z][a-z0-9_-]{1,63}$'),
  label text not null check (length(btrim(label)) between 1 and 100),
  option_label text check (option_label is null or length(btrim(option_label)) between 1 and 100),
  classification text not null check (classification in ('SERVICE', 'EXPENSE', 'SUPPLIER', 'REFUND', 'CASH_MANAGEMENT')),
  default_direction text not null check (default_direction in ('IN', 'OUT', 'TRANSFER')),
  allowed_directions text[] not null check (allowed_directions <@ array['IN','OUT','TRANSFER']::text[]),
  tracked_source_type text check (tracked_source_type in ('LMS', 'TICKETING', 'APPLICATIONS', 'PACKAGES')),
  source_required boolean not null default false,
  customer_required boolean not null default false,
  loyalty_eligible boolean not null default false,
  points_per_gbp numeric(8,4) not null default 0 check (points_per_gbp >= 0),
  allowed_payment_methods text[] not null default array['CASH','CARD','BANK']::text[]
    check (allowed_payment_methods <@ array['CASH','CARD','BANK','OTHER']::text[]),
  note_required boolean not null default false,
  shortcut text check (shortcut is null or shortcut ~ '^[A-Z0-9]$'),
  display_order integer not null default 100 check (display_order >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint pos_catalogue_loyalty_boundary check (
    not loyalty_eligible
    or (classification = 'SERVICE' and tracked_source_type is null and default_direction = 'IN')
  )
);

create table if not exists public.pos_tills (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete restrict,
  till_code text not null check (length(btrim(till_code)) between 1 and 40),
  name text not null check (length(btrim(name)) between 1 and 100),
  currency text not null default 'GBP' check (currency = 'GBP'),
  is_active boolean not null default true,
  created_at timestamptz not null default clock_timestamp(),
  unique (location_id, till_code),
  unique (id, location_id)
);

create table if not exists public.pos_cash_reserves (
  id uuid primary key default gen_random_uuid(),
  till_id uuid not null unique references public.pos_tills(id) on delete restrict,
  currency text not null default 'GBP' check (currency = 'GBP'),
  opening_balance numeric(14,2) not null default 0 check (opening_balance >= 0),
  created_at timestamptz not null default clock_timestamp()
);

create table if not exists public.pos_shifts (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete restrict,
  till_id uuid not null references public.pos_tills(id) on delete restrict,
  business_date date not null,
  status text not null default 'OPEN' check (status in ('OPEN', 'CLOSED')),
  opening_float numeric(14,2) not null check (opening_float >= 0),
  opened_by uuid not null references public.employees(id) on delete restrict,
  opened_at timestamptz not null default clock_timestamp(),
  closed_by uuid references public.employees(id) on delete restrict,
  closed_at timestamptz,
  opening_override_reason text,
  constraint pos_shift_till_location_fkey foreign key (till_id, location_id)
    references public.pos_tills(id, location_id) on delete restrict,
  constraint pos_shift_closed_state check (
    (status = 'OPEN' and closed_by is null and closed_at is null)
    or (status = 'CLOSED' and closed_by is not null and closed_at is not null)
  )
);
create unique index if not exists pos_shifts_one_open_per_till_uq
  on public.pos_shifts(till_id) where status = 'OPEN';
create index if not exists pos_shifts_location_date_idx
  on public.pos_shifts(location_id, business_date desc, opened_at desc);

create table if not exists public.pos_reference_counters (
  location_id uuid not null references public.locations(id) on delete restrict,
  business_date date not null,
  next_number integer not null check (next_number > 0),
  primary key (location_id, business_date)
);

create table if not exists public.pos_transactions (
  id uuid primary key default gen_random_uuid(),
  reference_number text not null unique,
  location_id uuid not null references public.locations(id) on delete restrict,
  till_id uuid not null references public.pos_tills(id) on delete restrict,
  shift_id uuid not null references public.pos_shifts(id) on delete restrict,
  business_date date not null,
  occurred_at timestamptz not null default clock_timestamp(),
  transaction_kind text not null check (transaction_kind in ('SALE', 'MONEY_OUT', 'SUPPLIER', 'CORRECTION', 'LEGACY_IMPORT')),
  direction text not null check (direction in ('IN', 'OUT')),
  outgoing_type text check (outgoing_type in ('REFUND', 'EXPENSE', 'SUPPLIER_PAYMENT')),
  catalogue_item_id uuid not null references public.pos_catalogue_items(id) on delete restrict,
  pricing_row_id uuid references public.service_pricing(id) on delete restrict,
  pricing_option_label text,
  total_amount numeric(14,2) not null check (total_amount > 0),
  amount_paid numeric(14,2) not null check (amount_paid >= 0),
  currency text not null default 'GBP' check (currency = 'GBP'),
  customer_name text not null default 'Walk-in' check (length(btrim(customer_name)) between 1 and 160),
  customer_phone text check (customer_phone is null or length(btrim(customer_phone)) between 3 and 40),
  loyalty_mobile_user_id uuid references public.mobile_users(id) on delete restrict,
  loyalty_source_reference text,
  loyalty_points_awarded integer not null default 0 check (loyalty_points_awarded >= 0),
  supplier_vendor_id uuid references public.supplier_vendors(id) on delete restrict,
  supplier_movement_type text check (supplier_movement_type in ('OPENING', 'DEPOSIT', 'USE_BALANCE', 'REFUND', 'CORRECTION')),
  note text check (note is null or length(note) <= 2000),
  search_text text not null,
  search_document tsvector generated always as (to_tsvector('simple', search_text)) stored,
  created_by uuid not null references public.employees(id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  idempotency_key text not null check (length(idempotency_key) between 8 and 200),
  request_fingerprint text not null check (request_fingerprint ~ '^[0-9a-f]{64}$'),
  legacy_source text,
  legacy_row_key text,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  constraint pos_transaction_outgoing_type_check check (
    (direction = 'IN' and outgoing_type is null)
    or (direction = 'OUT' and outgoing_type is not null)
  ),
  constraint pos_transaction_supplier_check check (
    (supplier_movement_type is null and supplier_vendor_id is null)
    or (supplier_movement_type is not null and supplier_vendor_id is not null)
  ),
  constraint pos_transaction_legacy_check check (
    (transaction_kind <> 'LEGACY_IMPORT' and legacy_source is null and legacy_row_key is null)
    or (transaction_kind = 'LEGACY_IMPORT' and legacy_source is not null and legacy_row_key is not null)
  ),
  unique (created_by, idempotency_key),
  unique (legacy_source, legacy_row_key)
);
create index if not exists pos_transactions_location_date_idx
  on public.pos_transactions(location_id, business_date desc, occurred_at desc, id desc);
create index if not exists pos_transactions_location_agent_date_idx
  on public.pos_transactions(location_id, created_by, business_date desc);
create index if not exists pos_transactions_location_catalogue_date_idx
  on public.pos_transactions(location_id, catalogue_item_id, business_date desc);
create index if not exists pos_transactions_till_shift_idx
  on public.pos_transactions(till_id, shift_id, occurred_at desc);
create index if not exists pos_transactions_supplier_idx
  on public.pos_transactions(location_id, supplier_vendor_id, occurred_at desc)
  where supplier_vendor_id is not null;
create index if not exists pos_transactions_search_idx
  on public.pos_transactions using gin(search_document);

create table if not exists public.pos_transaction_tenders (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.pos_transactions(id) on delete restrict,
  payment_method text not null check (payment_method in ('CASH', 'CARD', 'BANK', 'OTHER')),
  amount numeric(14,2) not null check (amount > 0),
  currency text not null default 'GBP' check (currency = 'GBP'),
  external_reference text check (external_reference is null or length(btrim(external_reference)) between 1 and 200),
  reconciliation_status text not null check (reconciliation_status in ('RECORDED', 'PENDING', 'COMPLETED', 'FAILED')),
  created_at timestamptz not null default clock_timestamp()
);
create index if not exists pos_transaction_tenders_transaction_idx
  on public.pos_transaction_tenders(transaction_id, created_at);
create index if not exists pos_transaction_tenders_reconciliation_idx
  on public.pos_transaction_tenders(payment_method, reconciliation_status, created_at desc);

create table if not exists public.pos_transaction_source_links (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.pos_transactions(id) on delete restrict,
  source_type text not null check (source_type in ('LMS', 'TICKETING', 'APPLICATIONS', 'PACKAGES', 'POS', 'LEGACY')),
  source_namespace text check (source_namespace is null or source_namespace ~ '^[a-z][a-z0-9_-]{0,63}$'),
  source_record_id text not null check (length(btrim(source_record_id)) between 1 and 200),
  display_reference text check (display_reference is null or length(btrim(display_reference)) between 1 and 200),
  created_at timestamptz not null default clock_timestamp(),
  unique (transaction_id, source_type, source_namespace, source_record_id)
);
create index if not exists pos_source_links_lookup_idx
  on public.pos_transaction_source_links(source_type, source_record_id, transaction_id);

create table if not exists public.pos_supplier_profiles (
  supplier_vendor_id uuid primary key references public.supplier_vendors(id) on delete restrict,
  alternate_names text[] not null default '{}'::text[],
  source_area text check (source_area is null or length(btrim(source_area)) between 1 and 80),
  source_reference text check (source_reference is null or length(btrim(source_reference)) between 1 and 200),
  is_active boolean not null default true,
  configured_by uuid not null references public.employees(id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);
create unique index if not exists supplier_vendors_normalized_name_uq
  on public.supplier_vendors(lower(btrim(name)));
create index if not exists pos_supplier_profiles_aliases_idx
  on public.pos_supplier_profiles using gin(alternate_names);

create table if not exists public.pos_supplier_balance_entries (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete restrict,
  supplier_vendor_id uuid not null references public.supplier_vendors(id) on delete restrict,
  transaction_id uuid references public.pos_transactions(id) on delete restrict,
  movement_type text not null check (movement_type in ('OPENING', 'DEPOSIT', 'USE_BALANCE', 'REFUND', 'CORRECTION')),
  balance_delta numeric(14,2) not null check (balance_delta <> 0),
  currency text not null default 'GBP' check (currency = 'GBP'),
  payment_method text check (payment_method in ('CASH', 'CARD', 'BANK', 'OTHER', 'CREDIT')),
  reference text,
  note text check (note is null or length(note) <= 2000),
  created_by uuid not null references public.employees(id) on delete restrict,
  approved_by uuid references public.employees(id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  idempotency_key text not null check (length(idempotency_key) between 8 and 200),
  unique (created_by, idempotency_key)
);
create index if not exists pos_supplier_entries_balance_idx
  on public.pos_supplier_balance_entries(location_id, supplier_vendor_id, created_at, id);

create table if not exists public.pos_refunds (
  id uuid primary key default gen_random_uuid(),
  reference_number text not null unique,
  location_id uuid not null references public.locations(id) on delete restrict,
  till_id uuid not null references public.pos_tills(id) on delete restrict,
  shift_id uuid not null references public.pos_shifts(id) on delete restrict,
  business_date date not null,
  original_transaction_id uuid references public.pos_transactions(id) on delete restrict,
  refund_kind text not null check (refund_kind in ('LINKED', 'GENERAL')),
  amount numeric(14,2) not null check (amount > 0),
  currency text not null default 'GBP' check (currency = 'GBP'),
  status text not null check (status in ('RECORDED', 'PENDING', 'COMPLETED', 'FAILED')),
  reason_code text not null check (length(btrim(reason_code)) between 2 and 80),
  note text not null check (length(btrim(note)) between 3 and 2000),
  supporting_reference text,
  original_evidence jsonb not null default '{}'::jsonb check (jsonb_typeof(original_evidence) = 'object'),
  search_text text not null,
  search_document tsvector generated always as (to_tsvector('simple', search_text)) stored,
  created_by uuid not null references public.employees(id) on delete restrict,
  approved_by uuid references public.employees(id) on delete restrict,
  approval_reason text,
  fresh_factor_method text check (fresh_factor_method in ('totp', 'backup')),
  loyalty_points_reversed integer not null default 0 check (loyalty_points_reversed >= 0),
  loyalty_adjustment_award_id uuid references public.customer_loyalty_awards(id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  idempotency_key text not null check (length(idempotency_key) between 8 and 200),
  request_fingerprint text not null check (request_fingerprint ~ '^[0-9a-f]{64}$'),
  unique (created_by, idempotency_key),
  constraint pos_refund_original_check check (
    (refund_kind = 'LINKED' and original_transaction_id is not null)
    or (refund_kind = 'GENERAL' and original_transaction_id is null)
  )
);
create index if not exists pos_refunds_original_idx
  on public.pos_refunds(original_transaction_id, created_at)
  where original_transaction_id is not null;
create index if not exists pos_refunds_location_date_idx
  on public.pos_refunds(location_id, business_date desc, created_at desc, id desc);
create index if not exists pos_refunds_search_idx
  on public.pos_refunds using gin(search_document);

create table if not exists public.pos_loyalty_adjustments (
  refund_id uuid primary key references public.pos_refunds(id) on delete restrict,
  original_award_id uuid not null references public.customer_loyalty_awards(id) on delete restrict,
  adjustment_award_id uuid not null unique references public.customer_loyalty_awards(id) on delete restrict,
  points_reversed integer not null check (points_reversed > 0),
  is_final boolean not null,
  created_at timestamptz not null default clock_timestamp()
);
create index if not exists pos_loyalty_adjustments_original_idx
  on public.pos_loyalty_adjustments(original_award_id, created_at, refund_id);

create table if not exists public.pos_refund_tenders (
  id uuid primary key default gen_random_uuid(),
  refund_id uuid not null references public.pos_refunds(id) on delete restrict,
  payment_method text not null check (payment_method in ('CASH', 'CARD', 'BANK', 'OTHER')),
  amount numeric(14,2) not null check (amount > 0),
  currency text not null default 'GBP' check (currency = 'GBP'),
  external_reference text,
  reconciliation_status text not null check (reconciliation_status in ('RECORDED', 'PENDING', 'COMPLETED', 'FAILED')),
  created_at timestamptz not null default clock_timestamp()
);
create index if not exists pos_refund_tenders_refund_idx
  on public.pos_refund_tenders(refund_id, created_at);

create table if not exists public.pos_reconciliation_events (
  id bigint generated always as identity primary key,
  transaction_tender_id uuid references public.pos_transaction_tenders(id) on delete restrict,
  refund_tender_id uuid references public.pos_refund_tenders(id) on delete restrict,
  status text not null check (status in ('RECORDED', 'PENDING', 'COMPLETED', 'FAILED')),
  external_reference text,
  note text check (note is null or length(note) <= 1000),
  created_by uuid not null references public.employees(id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  idempotency_key text not null check (length(idempotency_key) between 8 and 200),
  constraint pos_reconciliation_target_check check (
    (transaction_tender_id is not null)::integer + (refund_tender_id is not null)::integer = 1
  ),
  unique (created_by, idempotency_key)
);
create index if not exists pos_reconciliation_transaction_idx
  on public.pos_reconciliation_events(transaction_tender_id, created_at desc, id desc)
  where transaction_tender_id is not null;
create index if not exists pos_reconciliation_refund_idx
  on public.pos_reconciliation_events(refund_tender_id, created_at desc, id desc)
  where refund_tender_id is not null;

create table if not exists public.pos_cash_movements (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete restrict,
  till_id uuid not null references public.pos_tills(id) on delete restrict,
  shift_id uuid not null references public.pos_shifts(id) on delete restrict,
  transaction_id uuid references public.pos_transactions(id) on delete restrict,
  refund_id uuid references public.pos_refunds(id) on delete restrict,
  movement_type text not null check (movement_type in (
    'TRANSACTION_TENDER', 'REFUND_TENDER', 'RESERVE_IN', 'RESERVE_OUT',
    'DEPOSIT', 'WITHDRAWAL', 'TRANSFER_IN', 'TRANSFER_OUT', 'CORRECTION'
  )),
  amount numeric(14,2) not null check (amount > 0),
  currency text not null default 'GBP' check (currency = 'GBP'),
  drawer_delta numeric(14,2) not null,
  reserve_delta numeric(14,2) not null default 0,
  denominations jsonb not null default '[]'::jsonb check (jsonb_typeof(denominations) = 'array'),
  reason text check (reason is null or length(btrim(reason)) between 3 and 1000),
  created_by uuid not null references public.employees(id) on delete restrict,
  approved_by uuid references public.employees(id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  idempotency_key text not null check (length(idempotency_key) between 8 and 240),
  unique (created_by, idempotency_key),
  constraint pos_cash_movement_delta_check check (
    drawer_delta <> 0 or reserve_delta <> 0
  )
);
create index if not exists pos_cash_movements_shift_idx
  on public.pos_cash_movements(shift_id, created_at, id);
create index if not exists pos_cash_movements_till_idx
  on public.pos_cash_movements(till_id, created_at, id);

create table if not exists public.pos_closeouts (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete restrict,
  till_id uuid not null references public.pos_tills(id) on delete restrict,
  shift_id uuid not null unique references public.pos_shifts(id) on delete restrict,
  expected_drawer numeric(14,2) not null,
  counted_drawer numeric(14,2) not null check (counted_drawer >= 0),
  drawer_difference numeric(14,2) generated always as (counted_drawer - expected_drawer) stored,
  expected_reserve numeric(14,2) not null,
  counted_reserve numeric(14,2) not null check (counted_reserve >= 0),
  reserve_difference numeric(14,2) generated always as (counted_reserve - expected_reserve) stored,
  drawer_denominations jsonb not null default '[]'::jsonb check (jsonb_typeof(drawer_denominations) = 'array'),
  reserve_denominations jsonb not null default '[]'::jsonb check (jsonb_typeof(reserve_denominations) = 'array'),
  reason text check (reason is null or length(btrim(reason)) between 3 and 1000),
  status text not null default 'PENDING_APPROVAL' check (status in ('PENDING_APPROVAL', 'APPROVED', 'REJECTED')),
  counted_by uuid not null references public.employees(id) on delete restrict,
  counted_at timestamptz not null default clock_timestamp(),
  approved_by uuid references public.employees(id) on delete restrict,
  approved_at timestamptz,
  approval_note text,
  fresh_factor_method text check (fresh_factor_method in ('totp', 'backup')),
  idempotency_key text not null check (length(idempotency_key) between 8 and 200),
  unique (counted_by, idempotency_key)
);
create index if not exists pos_closeouts_location_status_idx
  on public.pos_closeouts(location_id, status, counted_at desc);

create table if not exists public.pos_corrections (
  id uuid primary key default gen_random_uuid(),
  original_transaction_id uuid not null references public.pos_transactions(id) on delete restrict,
  correction_transaction_id uuid not null unique references public.pos_transactions(id) on delete restrict,
  reason text not null check (length(btrim(reason)) between 10 and 2000),
  created_by uuid not null references public.employees(id) on delete restrict,
  fresh_factor_method text not null check (fresh_factor_method in ('totp', 'backup')),
  created_at timestamptz not null default clock_timestamp(),
  unique (original_transaction_id)
);

create table if not exists public.pos_audit_events (
  id bigint generated always as identity primary key,
  location_id uuid not null references public.locations(id) on delete restrict,
  actor_employee_id uuid not null references public.employees(id) on delete restrict,
  event_type text not null check (length(btrim(event_type)) between 3 and 100),
  entity_type text not null check (entity_type in ('SHIFT', 'TRANSACTION', 'REFUND', 'CASH_MOVEMENT', 'CLOSEOUT', 'SUPPLIER', 'IMPORT', 'CORRECTION')),
  entity_id uuid not null,
  event_summary text not null check (length(btrim(event_summary)) between 3 and 240),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default clock_timestamp()
);
create index if not exists pos_audit_entity_idx
  on public.pos_audit_events(entity_type, entity_id, created_at, id);
create index if not exists pos_audit_location_date_idx
  on public.pos_audit_events(location_id, created_at desc, id desc);

create table if not exists public.pos_idempotency_keys (
  action_name text not null,
  actor_employee_id uuid not null references public.employees(id) on delete restrict,
  idempotency_key text not null check (length(idempotency_key) between 8 and 200),
  request_payload jsonb not null check (jsonb_typeof(request_payload) = 'object'),
  response_payload jsonb not null check (jsonb_typeof(response_payload) = 'object'),
  completed_at timestamptz not null default clock_timestamp(),
  primary key (action_name, actor_employee_id, idempotency_key)
);
create index if not exists pos_idempotency_completed_idx
  on public.pos_idempotency_keys(completed_at);

-- Every branch starts with one shared GBP till and a separate coin reserve. Additional tills can be
-- configured later without changing transaction ownership or closeout semantics.
insert into public.pos_tills (location_id, till_code, name)
select location.id, coalesce(nullif(btrim(location.branch_code), ''), left(location.id::text, 8)) || '-T1', 'Main till'
from public.locations location
on conflict (location_id, till_code) do nothing;

insert into public.pos_cash_reserves (till_id)
select till.id from public.pos_tills till
on conflict (till_id) do nothing;

insert into public.pos_catalogue_items (
  item_key, group_key, label, option_label, classification, default_direction, allowed_directions,
  tracked_source_type, source_required, customer_required, loyalty_eligible, points_per_gbp,
  allowed_payment_methods, note_required, shortcut, display_order
) values
  ('nicop-cnic','nadra','NADRA','NICOP/CNIC','SERVICE','IN',array['IN'],'APPLICATIONS',true,true,false,0,array['CASH','CARD','BANK'],false,'1',10),
  ('poc','nadra','NADRA','POC','SERVICE','IN',array['IN'],'APPLICATIONS',true,true,false,0,array['CASH','CARD','BANK'],false,'2',11),
  ('frc','nadra','NADRA','FRC','SERVICE','IN',array['IN'],'APPLICATIONS',true,true,false,0,array['CASH','CARD','BANK'],false,'3',12),
  ('crc','nadra','NADRA','CRC','SERVICE','IN',array['IN'],'APPLICATIONS',true,true,false,0,array['CASH','CARD','BANK'],false,'4',13),
  ('poa','nadra','NADRA','POA','SERVICE','IN',array['IN'],'APPLICATIONS',true,true,false,0,array['CASH','CARD','BANK'],false,'5',14),
  ('pk-passport','passports','PK Passport',null,'SERVICE','IN',array['IN'],'APPLICATIONS',true,true,false,0,array['CASH','CARD','BANK'],false,'6',20),
  ('gb-passport','passports','GB Passport',null,'SERVICE','IN',array['IN'],'APPLICATIONS',true,true,false,0,array['CASH','CARD','BANK'],false,'7',21),
  ('visa','applications','Visa',null,'SERVICE','IN',array['IN'],'APPLICATIONS',true,true,false,0,array['CASH','CARD','BANK'],false,'8',30),
  ('ticket-package','travel','Ticket & Package',null,'SERVICE','IN',array['IN','OUT'],'TICKETING',true,true,false,0,array['CASH','CARD','BANK'],false,'9',40),
  ('remittance-fee','untracked','Remittance service fee',null,'SERVICE','IN',array['IN'],null,false,false,true,1,array['CASH','CARD','BANK'],false,'R',50),
  ('cargo-delivery','untracked','Cargo / delivery',null,'SERVICE','IN',array['IN'],null,false,false,true,1,array['CASH','CARD','BANK'],false,'C',51),
  ('document-help','untracked','Document help',null,'SERVICE','IN',array['IN'],null,false,false,true,1,array['CASH','CARD','BANK'],false,'D',52),
  ('printing-copying','untracked','Printing / copying',null,'SERVICE','IN',array['IN'],null,false,false,true,1,array['CASH','CARD','BANK'],false,'P',53),
  ('other-service','untracked','Other service',null,'SERVICE','IN',array['IN'],null,false,false,false,0,array['CASH','CARD','BANK','OTHER'],true,'O',59),
  ('expense','money-out','Expense',null,'EXPENSE','OUT',array['OUT'],null,false,false,false,0,array['CASH','CARD','BANK','OTHER'],true,'E',70),
  ('supplier-payment','supplier','Supplier payment',null,'SUPPLIER','OUT',array['IN','OUT'],null,false,false,false,0,array['CASH','CARD','BANK','OTHER'],true,'S',71),
  ('general-refund','refunds','General refund',null,'REFUND','OUT',array['OUT'],null,false,true,false,0,array['CASH','CARD','BANK','OTHER'],true,'G',80)
on conflict (item_key) do update set
  group_key = excluded.group_key,
  label = excluded.label,
  option_label = excluded.option_label,
  classification = excluded.classification,
  default_direction = excluded.default_direction,
  allowed_directions = excluded.allowed_directions,
  tracked_source_type = excluded.tracked_source_type,
  source_required = excluded.source_required,
  customer_required = excluded.customer_required,
  loyalty_eligible = excluded.loyalty_eligible,
  points_per_gbp = excluded.points_per_gbp,
  allowed_payment_methods = excluded.allowed_payment_methods,
  note_required = excluded.note_required,
  shortcut = excluded.shortcut,
  display_order = excluded.display_order,
  is_active = true,
  updated_at = clock_timestamp();

create or replace function public.pos_schema_status()
returns jsonb
language sql
stable
security definer
set search_path = ''
set row_security = off
as $$
  select jsonb_build_object(
    'ready', coalesce((
      select version >= 2026090801
      from public.portal_schema_versions
      where component = 'pos'
    ), false),
    'version', coalesce((
      select version
      from public.portal_schema_versions
      where component = 'pos'
    ), 0)
  );
$$;

create or replace function public.pos_next_reference_v1(
  p_location_id uuid,
  p_business_date date,
  p_prefix text default 'POS'
)
returns text
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  branch_code_value text;
  sequence_value integer;
begin
  select upper(regexp_replace(coalesce(nullif(btrim(branch_code), ''), left(id::text, 6)), '[^A-Z0-9]', '', 'g'))
  into branch_code_value
  from public.locations
  where id = p_location_id;
  if not found then raise exception 'POS location not found' using errcode = 'P0002'; end if;

  insert into public.pos_reference_counters (location_id, business_date, next_number)
  values (p_location_id, p_business_date, 2)
  on conflict (location_id, business_date) do update
    set next_number = public.pos_reference_counters.next_number + 1
  returning next_number - 1 into sequence_value;

  return upper(p_prefix) || '-' || branch_code_value || '-' || to_char(p_business_date, 'YYYYMMDD')
    || '-' || lpad(sequence_value::text, 4, '0');
end;
$$;

create or replace function public.pos_denominations_total_v1(p_denominations jsonb)
returns numeric
language plpgsql
immutable
set search_path = ''
as $$
declare
  total_pence bigint;
begin
  if p_denominations is null or jsonb_typeof(p_denominations) <> 'array' then
    raise exception 'Coin denominations must be an array' using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_denominations) entry(value)
    where jsonb_typeof(entry.value) <> 'object'
      or jsonb_typeof(entry.value -> 'valuePence') <> 'number'
      or jsonb_typeof(entry.value -> 'count') <> 'number'
      or (entry.value ->> 'valuePence')::integer not in (1,2,5,10,20,50,100,200)
      or (entry.value ->> 'count')::integer < 0
      or (entry.value ->> 'count')::numeric <> trunc((entry.value ->> 'count')::numeric)
  ) then
    raise exception 'Invalid UK coin denomination breakdown' using errcode = '22023';
  end if;

  select coalesce(sum(
    (entry.value ->> 'valuePence')::bigint * (entry.value ->> 'count')::bigint
  ), 0)
  into total_pence
  from jsonb_array_elements(p_denominations) entry(value);
  return (total_pence::numeric / 100)::numeric(14,2);
exception
  when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'Invalid coin denomination breakdown' using errcode = '22023';
end;
$$;

create or replace function public.pos_expected_balances_v1(p_till_id uuid, p_shift_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
set row_security = off
as $$
declare
  opening_float_value numeric(14,2);
  opening_reserve_value numeric(14,2);
  drawer_delta_value numeric(14,2);
  reserve_delta_value numeric(14,2);
begin
  select opening_float into opening_float_value
  from public.pos_shifts
  where id = p_shift_id and till_id = p_till_id;
  if not found then raise exception 'POS shift not found' using errcode = 'P0002'; end if;

  select opening_balance into opening_reserve_value
  from public.pos_cash_reserves
  where till_id = p_till_id;
  if not found then raise exception 'POS reserve not found' using errcode = 'P0002'; end if;

  select coalesce(sum(drawer_delta), 0) into drawer_delta_value
  from public.pos_cash_movements
  where shift_id = p_shift_id;
  select coalesce(sum(reserve_delta), 0) into reserve_delta_value
  from public.pos_cash_movements
  where till_id = p_till_id;

  return jsonb_build_object(
    'drawer', round(opening_float_value + drawer_delta_value, 2),
    'reserve', round(opening_reserve_value + reserve_delta_value, 2),
    'openingFloat', opening_float_value
  );
end;
$$;

create or replace function public.pos_reject_immutable_mutation_v1()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Posted POS history is immutable' using errcode = '55000', hint = 'POS_IMMUTABLE_HISTORY';
end;
$$;

do $pos_immutable_triggers$
declare
  table_name_value text;
begin
  foreach table_name_value in array array[
    'pos_transactions', 'pos_transaction_tenders', 'pos_transaction_source_links',
    'pos_supplier_balance_entries', 'pos_refunds', 'pos_refund_tenders', 'pos_loyalty_adjustments',
    'pos_cash_movements', 'pos_reconciliation_events', 'pos_corrections', 'pos_audit_events'
  ] loop
    execute format('drop trigger if exists %I on public.%I', table_name_value || '_immutable', table_name_value);
    execute format(
      'create trigger %I before update or delete on public.%I for each row execute function public.pos_reject_immutable_mutation_v1()',
      table_name_value || '_immutable', table_name_value
    );
  end loop;
end
$pos_immutable_triggers$;

create or replace function public.pos_open_shift_v1(
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
  action_name_value constant text := 'pos.open_shift.v1';
  key_value text := btrim(coalesce(p_idempotency_key, ''));
  canonical_request jsonb := coalesce(p_request, '{}'::jsonb);
  existing_request jsonb;
  existing_response jsonb;
  location_id_value uuid;
  timezone_value text;
  role_level_value integer;
  till_row public.pos_tills%rowtype;
  shift_row public.pos_shifts%rowtype;
  last_closeout public.pos_closeouts%rowtype;
  business_date_value date;
  opening_float_value numeric(14,2);
  expected_float_value numeric(14,2) := 0;
  override_reason_value text := nullif(btrim(p_request ->> 'overrideReason'), '');
  response_value jsonb;
begin
  if length(key_value) not between 8 and 200 or jsonb_typeof(canonical_request) <> 'object' then
    raise exception 'Valid POS shift request required' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(action_name_value || ':' || p_actor_employee_id || ':' || key_value, 0));
  select request_payload, response_payload into existing_request, existing_response
  from public.pos_idempotency_keys
  where action_name = action_name_value and actor_employee_id = p_actor_employee_id and idempotency_key = key_value;
  if found then
    if existing_request is distinct from canonical_request then
      raise exception 'POS idempotency key reused with different shift details'
        using errcode = '22023', hint = 'POS_IDEMPOTENCY_CONFLICT';
    end if;
    return existing_response || jsonb_build_object('idempotentReplay', true);
  end if;

  select employee.location_id, location.timezone, role.level
  into location_id_value, timezone_value, role_level_value
  from public.employees employee
  join public.locations location on location.id = employee.location_id
  join public.roles role on role.id = employee.role_id
  where employee.id = p_actor_employee_id and employee.is_active
  for update of employee;
  if not found then raise exception 'Active branch employee required' using errcode = '42501'; end if;

  business_date_value := (clock_timestamp() at time zone timezone_value)::date;
  select * into till_row
  from public.pos_tills
  where id = nullif(p_request ->> 'tillId', '')::uuid
    and location_id = location_id_value and is_active
  for update;
  if not found then raise exception 'Active branch till not found' using errcode = 'P0002'; end if;

  if exists (select 1 from public.pos_shifts where till_id = till_row.id and status = 'OPEN') then
    raise exception 'This till already has an open shift' using errcode = '23505', hint = 'POS_SHIFT_ALREADY_OPEN';
  end if;

  select * into last_closeout
  from public.pos_closeouts
  where till_id = till_row.id
  order by counted_at desc, id desc
  limit 1;
  if found then
    if last_closeout.status <> 'APPROVED' and role_level_value > 2 then
      raise exception 'The previous closeout needs manager approval before staff can reopen this till'
        using errcode = '42501', hint = 'POS_CLOSEOUT_APPROVAL_REQUIRED';
    end if;
    expected_float_value := last_closeout.counted_drawer;
  end if;

  opening_float_value := coalesce((p_request ->> 'openingFloat')::numeric, expected_float_value);
  if opening_float_value < 0 or scale(opening_float_value) > 2 then
    raise exception 'Opening float is invalid' using errcode = '22023';
  end if;
  if opening_float_value is distinct from expected_float_value then
    if role_level_value > 2 or length(coalesce(override_reason_value, '')) < 10 then
      raise exception 'A manager and override reason are required to change the carried opening float'
        using errcode = '42501', hint = 'POS_OPENING_FLOAT_OVERRIDE_REQUIRED';
    end if;
  end if;

  insert into public.pos_shifts (
    location_id, till_id, business_date, opening_float, opened_by, opening_override_reason
  ) values (
    location_id_value, till_row.id, business_date_value, opening_float_value,
    p_actor_employee_id, override_reason_value
  ) returning * into shift_row;

  insert into public.pos_audit_events (
    location_id, actor_employee_id, event_type, entity_type, entity_id, event_summary, metadata
  ) values (
    location_id_value, p_actor_employee_id, 'shift.opened', 'SHIFT', shift_row.id,
    'POS till shift opened',
    jsonb_build_object('tillId', till_row.id, 'businessDate', business_date_value, 'openingFloat', opening_float_value)
  );
  response_value := jsonb_build_object(
    'shiftId', shift_row.id, 'tillId', till_row.id, 'businessDate', business_date_value,
    'openingFloat', opening_float_value, 'status', shift_row.status
  );
  insert into public.pos_idempotency_keys (
    action_name, actor_employee_id, idempotency_key, request_payload, response_payload
  ) values (action_name_value, p_actor_employee_id, key_value, canonical_request, response_value);
  return response_value;
exception
  when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'Invalid POS shift details' using errcode = '22023';
end;
$$;

create or replace function public.pos_record_cash_movement_v1(
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
  action_name_value constant text := 'pos.cash_movement.v1';
  key_value text := btrim(coalesce(p_idempotency_key, ''));
  canonical_request jsonb := coalesce(p_request, '{}'::jsonb);
  existing_request jsonb;
  existing_response jsonb;
  location_id_value uuid;
  role_level_value integer;
  shift_row public.pos_shifts%rowtype;
  movement_row public.pos_cash_movements%rowtype;
  movement_type_value text := upper(btrim(coalesce(p_request ->> 'movementType', '')));
  amount_value numeric(14,2);
  denomination_total numeric(14,2);
  denominations_value jsonb := coalesce(p_request -> 'denominations', '[]'::jsonb);
  reason_value text := nullif(btrim(p_request ->> 'reason'), '');
  drawer_delta_value numeric(14,2);
  reserve_delta_value numeric(14,2);
  balances_value jsonb;
  fresh_factor_method_value text := nullif(p_request ->> 'freshFactorMethod', '');
  response_value jsonb;
begin
  if length(key_value) not between 8 and 200 or jsonb_typeof(canonical_request) <> 'object' then
    raise exception 'Valid cash movement request required' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(action_name_value || ':' || p_actor_employee_id || ':' || key_value, 0));
  select request_payload, response_payload into existing_request, existing_response
  from public.pos_idempotency_keys
  where action_name = action_name_value and actor_employee_id = p_actor_employee_id and idempotency_key = key_value;
  if found then
    if existing_request is distinct from canonical_request then
      raise exception 'POS idempotency key reused with different cash movement details'
        using errcode = '22023', hint = 'POS_IDEMPOTENCY_CONFLICT';
    end if;
    return existing_response || jsonb_build_object('idempotentReplay', true);
  end if;

  select employee.location_id, role.level into location_id_value, role_level_value
  from public.employees employee
  join public.roles role on role.id = employee.role_id
  where employee.id = p_actor_employee_id and employee.is_active
  for update of employee;
  if not found or location_id_value is null then
    raise exception 'Active branch employee required' using errcode = '42501';
  end if;

  select * into shift_row
  from public.pos_shifts
  where id = nullif(p_request ->> 'shiftId', '')::uuid
    and location_id = location_id_value and status = 'OPEN'
  for update;
  if not found then raise exception 'An open branch till is required' using errcode = '55000', hint = 'POS_SHIFT_REQUIRED'; end if;

  amount_value := (p_request ->> 'amount')::numeric;
  if amount_value <= 0 or scale(amount_value) > 2 then
    raise exception 'Cash movement amount is invalid' using errcode = '22023';
  end if;
  if movement_type_value in ('RESERVE_IN', 'RESERVE_OUT') then
    if jsonb_array_length(denominations_value) = 0 then
      raise exception 'Coin denominations are required' using errcode = '22023';
    end if;
    denomination_total := public.pos_denominations_total_v1(denominations_value);
    if denomination_total is distinct from amount_value then
      raise exception 'Coin denomination total does not match the movement amount'
        using errcode = '22023', hint = 'POS_DENOMINATION_MISMATCH';
    end if;
  elsif denominations_value <> '[]'::jsonb then
    denomination_total := public.pos_denominations_total_v1(denominations_value);
    if denomination_total is distinct from amount_value then
      raise exception 'Denomination total does not match the movement amount'
        using errcode = '22023', hint = 'POS_DENOMINATION_MISMATCH';
    end if;
  end if;

  case movement_type_value
    when 'RESERVE_IN' then drawer_delta_value := -amount_value; reserve_delta_value := amount_value;
    when 'RESERVE_OUT' then drawer_delta_value := amount_value; reserve_delta_value := -amount_value;
    when 'DEPOSIT' then drawer_delta_value := -amount_value; reserve_delta_value := 0;
    when 'WITHDRAWAL' then drawer_delta_value := amount_value; reserve_delta_value := 0;
    when 'CORRECTION' then
      if p_request ->> 'direction' = 'IN' then drawer_delta_value := amount_value;
      elsif p_request ->> 'direction' = 'OUT' then drawer_delta_value := -amount_value;
      else raise exception 'Correction direction is required' using errcode = '22023'; end if;
      reserve_delta_value := 0;
    else raise exception 'Unsupported cash movement type' using errcode = '22023';
  end case;

  if movement_type_value in ('DEPOSIT', 'WITHDRAWAL', 'CORRECTION') then
    if role_level_value > 2 or fresh_factor_method_value not in ('totp', 'backup') or length(coalesce(reason_value, '')) < 10 then
      raise exception 'Manager verification and a reason are required for this cash movement'
        using errcode = '42501', hint = 'POS_MANAGER_VERIFICATION_REQUIRED';
    end if;
  elsif length(coalesce(reason_value, '')) < 3 then
    raise exception 'A movement reason is required' using errcode = '22023';
  end if;

  balances_value := public.pos_expected_balances_v1(shift_row.till_id, shift_row.id);
  if (balances_value ->> 'drawer')::numeric + drawer_delta_value < 0 then
    raise exception 'The drawer does not contain enough expected cash'
      using errcode = '23514', hint = 'POS_INSUFFICIENT_DRAWER';
  end if;
  if (balances_value ->> 'reserve')::numeric + reserve_delta_value < 0 then
    raise exception 'The reserve does not contain enough expected cash'
      using errcode = '23514', hint = 'POS_INSUFFICIENT_RESERVE';
  end if;

  insert into public.pos_cash_movements (
    location_id, till_id, shift_id, movement_type, amount, drawer_delta, reserve_delta,
    denominations, reason, created_by, approved_by, idempotency_key
  ) values (
    location_id_value, shift_row.till_id, shift_row.id, movement_type_value, amount_value,
    drawer_delta_value, reserve_delta_value, denominations_value, reason_value, p_actor_employee_id,
    case when movement_type_value in ('DEPOSIT','WITHDRAWAL','CORRECTION') then p_actor_employee_id end,
    key_value
  ) returning * into movement_row;

  insert into public.pos_audit_events (
    location_id, actor_employee_id, event_type, entity_type, entity_id, event_summary, metadata
  ) values (
    location_id_value, p_actor_employee_id, 'cash.movement_recorded', 'CASH_MOVEMENT', movement_row.id,
    'POS cash movement recorded',
    jsonb_build_object('movementType', movement_type_value, 'amount', amount_value,
      'drawerDelta', drawer_delta_value, 'reserveDelta', reserve_delta_value)
  );
  balances_value := public.pos_expected_balances_v1(shift_row.till_id, shift_row.id);
  response_value := jsonb_build_object(
    'movementId', movement_row.id, 'movementType', movement_type_value, 'amount', amount_value,
    'drawerBalance', balances_value -> 'drawer', 'reserveBalance', balances_value -> 'reserve'
  );
  insert into public.pos_idempotency_keys (
    action_name, actor_employee_id, idempotency_key, request_payload, response_payload
  ) values (action_name_value, p_actor_employee_id, key_value, canonical_request, response_value);
  return response_value;
exception
  when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'Invalid cash movement details' using errcode = '22023';
end;
$$;

create or replace function public.pos_close_shift_v1(
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
  action_name_value constant text := 'pos.close_shift.v1';
  key_value text := btrim(coalesce(p_idempotency_key, ''));
  canonical_request jsonb := coalesce(p_request, '{}'::jsonb);
  existing_request jsonb;
  existing_response jsonb;
  location_id_value uuid;
  shift_row public.pos_shifts%rowtype;
  closeout_row public.pos_closeouts%rowtype;
  balances_value jsonb;
  counted_drawer_value numeric(14,2);
  counted_reserve_value numeric(14,2);
  drawer_denominations_value jsonb := coalesce(p_request -> 'drawerDenominations', '[]'::jsonb);
  reserve_denominations_value jsonb := coalesce(p_request -> 'reserveDenominations', '[]'::jsonb);
  reason_value text := nullif(btrim(p_request ->> 'reason'), '');
  response_value jsonb;
begin
  if length(key_value) not between 8 and 200 or jsonb_typeof(canonical_request) <> 'object' then
    raise exception 'Valid closeout request required' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(action_name_value || ':' || p_actor_employee_id || ':' || key_value, 0));
  select request_payload, response_payload into existing_request, existing_response
  from public.pos_idempotency_keys
  where action_name = action_name_value and actor_employee_id = p_actor_employee_id and idempotency_key = key_value;
  if found then
    if existing_request is distinct from canonical_request then
      raise exception 'POS idempotency key reused with different closeout details'
        using errcode = '22023', hint = 'POS_IDEMPOTENCY_CONFLICT';
    end if;
    return existing_response || jsonb_build_object('idempotentReplay', true);
  end if;

  select location_id into location_id_value
  from public.employees
  where id = p_actor_employee_id and is_active
  for update;
  if not found or location_id_value is null then
    raise exception 'Active branch employee required' using errcode = '42501';
  end if;
  select * into shift_row
  from public.pos_shifts
  where id = nullif(p_request ->> 'shiftId', '')::uuid
    and location_id = location_id_value and status = 'OPEN'
  for update;
  if not found then raise exception 'Open shift not found' using errcode = 'P0002'; end if;

  counted_drawer_value := (p_request ->> 'countedDrawer')::numeric;
  counted_reserve_value := (p_request ->> 'countedReserve')::numeric;
  if counted_drawer_value < 0 or counted_reserve_value < 0
    or scale(counted_drawer_value) > 2 or scale(counted_reserve_value) > 2 then
    raise exception 'Closeout cash counts are invalid' using errcode = '22023';
  end if;
  if drawer_denominations_value <> '[]'::jsonb
    and public.pos_denominations_total_v1(drawer_denominations_value) is distinct from counted_drawer_value then
    raise exception 'Drawer denominations do not match the counted amount' using errcode = '22023';
  end if;
  if reserve_denominations_value <> '[]'::jsonb
    and public.pos_denominations_total_v1(reserve_denominations_value) is distinct from counted_reserve_value then
    raise exception 'Reserve denominations do not match the counted amount' using errcode = '22023';
  end if;

  balances_value := public.pos_expected_balances_v1(shift_row.till_id, shift_row.id);
  if ((counted_drawer_value - (balances_value ->> 'drawer')::numeric) <> 0
      or (counted_reserve_value - (balances_value ->> 'reserve')::numeric) <> 0)
    and length(coalesce(reason_value, '')) < 10 then
    raise exception 'A reason is required for a closeout difference' using errcode = '22023';
  end if;

  insert into public.pos_closeouts (
    location_id, till_id, shift_id, expected_drawer, counted_drawer, expected_reserve,
    counted_reserve, drawer_denominations, reserve_denominations, reason, counted_by, idempotency_key
  ) values (
    location_id_value, shift_row.till_id, shift_row.id,
    (balances_value ->> 'drawer')::numeric, counted_drawer_value,
    (balances_value ->> 'reserve')::numeric, counted_reserve_value,
    drawer_denominations_value, reserve_denominations_value, reason_value,
    p_actor_employee_id, key_value
  ) returning * into closeout_row;

  update public.pos_shifts
  set status = 'CLOSED', closed_by = p_actor_employee_id, closed_at = clock_timestamp()
  where id = shift_row.id;
  insert into public.pos_audit_events (
    location_id, actor_employee_id, event_type, entity_type, entity_id, event_summary, metadata
  ) values (
    location_id_value, p_actor_employee_id, 'closeout.counted', 'CLOSEOUT', closeout_row.id,
    'POS shift counted and closed',
    jsonb_build_object('shiftId', shift_row.id, 'drawerDifference', closeout_row.drawer_difference,
      'reserveDifference', closeout_row.reserve_difference)
  );
  response_value := jsonb_build_object(
    'closeoutId', closeout_row.id, 'shiftId', shift_row.id, 'status', closeout_row.status,
    'expectedDrawer', closeout_row.expected_drawer, 'countedDrawer', closeout_row.counted_drawer,
    'drawerDifference', closeout_row.drawer_difference, 'expectedReserve', closeout_row.expected_reserve,
    'countedReserve', closeout_row.counted_reserve, 'reserveDifference', closeout_row.reserve_difference
  );
  insert into public.pos_idempotency_keys (
    action_name, actor_employee_id, idempotency_key, request_payload, response_payload
  ) values (action_name_value, p_actor_employee_id, key_value, canonical_request, response_value);
  return response_value;
exception
  when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'Invalid closeout details' using errcode = '22023';
end;
$$;

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

  select employee.location_id, role.level into actor_location_id, role_level_value
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
  if closeout_row.counted_by = p_actor_employee_id then
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
    'POS closeout approved', jsonb_build_object('shiftId', closeout_row.shift_id)
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

create or replace function public.pos_post_transaction_v1(
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
  action_name_value constant text := 'pos.post_transaction.v1';
  key_value text := btrim(coalesce(p_idempotency_key, ''));
  canonical_request jsonb := coalesce(p_request, '{}'::jsonb) - 'confirmDuplicate';
  existing_request jsonb;
  existing_response jsonb;
  location_id_value uuid;
  timezone_value text;
  shift_row public.pos_shifts%rowtype;
  catalogue_row public.pos_catalogue_items%rowtype;
  pricing_row public.service_pricing%rowtype;
  transaction_id_value uuid := gen_random_uuid();
  reference_value text;
  business_date_value date;
  occurred_at_value timestamptz := clock_timestamp();
  direction_value text := upper(btrim(coalesce(p_request ->> 'direction', '')));
  outgoing_type_value text := nullif(upper(btrim(p_request ->> 'outgoingType')), '');
  transaction_kind_value text;
  amount_value numeric(14,2);
  amount_paid_value numeric(14,2);
  tender_total_value numeric(14,2);
  tender_count_value integer;
  tenders_value jsonb := coalesce(p_request -> 'tenders', '[]'::jsonb);
  customer_name_value text := coalesce(nullif(btrim(p_request ->> 'customerName'), ''), 'Walk-in');
  customer_phone_value text := nullif(btrim(p_request ->> 'customerPhone'), '');
  note_value text := nullif(btrim(p_request ->> 'note'), '');
  source_value jsonb := p_request -> 'source';
  source_type_value text;
  source_namespace_value text;
  source_record_id_value text;
  source_display_reference_value text;
  supplier_id_value uuid := nullif(p_request ->> 'supplierId', '')::uuid;
  pricing_id_value uuid := nullif(p_request ->> 'pricingId', '')::uuid;
  supplier_movement_value text := nullif(upper(btrim(p_request ->> 'supplierMovementType')), '');
  supplier_balance_value numeric(14,2);
  supplier_delta_value numeric(14,2);
  supplier_payment_method_value text;
  loyalty_code_value text := nullif(upper(btrim(p_request ->> 'loyaltyCode')), '');
  loyalty_user public.mobile_users%rowtype;
  loyalty_points_value integer := 0;
  loyalty_source_reference_value text;
  loyalty_award public.customer_loyalty_awards%rowtype;
  lms_value jsonb := p_request -> 'lms';
  lms_response jsonb;
  search_text_value text;
  balances_value jsonb;
  cash_delta_value numeric(14,2);
  tender_entry record;
  tender_id_value uuid;
  tender_method_value text;
  tender_amount_value numeric(14,2);
  tender_external_reference_value text;
  tender_reconciliation_value text;
  response_value jsonb;
begin
  if length(key_value) not between 8 and 200 or jsonb_typeof(coalesce(p_request, 'null'::jsonb)) <> 'object'
    or jsonb_typeof(tenders_value) <> 'array' then
    raise exception 'Valid POS transaction request required' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(action_name_value || ':' || p_actor_employee_id || ':' || key_value, 0));
  select request_payload, response_payload into existing_request, existing_response
  from public.pos_idempotency_keys
  where action_name = action_name_value and actor_employee_id = p_actor_employee_id and idempotency_key = key_value;
  if found then
    if existing_request is distinct from canonical_request then
      raise exception 'POS idempotency key reused with different transaction details'
        using errcode = '22023', hint = 'POS_IDEMPOTENCY_CONFLICT';
    end if;
    return existing_response || jsonb_build_object('idempotentReplay', true);
  end if;

  select employee.location_id, location.timezone into location_id_value, timezone_value
  from public.employees employee
  join public.locations location on location.id = employee.location_id
  where employee.id = p_actor_employee_id and employee.is_active
  for update of employee;
  if not found or location_id_value is null then
    raise exception 'Active branch employee required' using errcode = '42501';
  end if;
  select * into shift_row
  from public.pos_shifts
  where id = nullif(p_request ->> 'shiftId', '')::uuid
    and location_id = location_id_value and status = 'OPEN'
  for update;
  if not found then raise exception 'An open branch till is required' using errcode = '55000', hint = 'POS_SHIFT_REQUIRED'; end if;

  business_date_value := (occurred_at_value at time zone timezone_value)::date;
  if business_date_value <> shift_row.business_date then
    raise exception 'The active till belongs to a different business day; close and reopen it'
      using errcode = '55000', hint = 'POS_BUSINESS_DAY_ROLLOVER_REQUIRED';
  end if;
  select * into catalogue_row
  from public.pos_catalogue_items
  where item_key = p_request ->> 'catalogueKey' and is_active;
  if not found or catalogue_row.classification in ('REFUND', 'CASH_MANAGEMENT') then
    raise exception 'Active transaction category not found' using errcode = 'P0002';
  end if;

  amount_value := (p_request ->> 'totalAmount')::numeric;
  if amount_value <= 0 or scale(amount_value) > 2 then
    raise exception 'Transaction amount is invalid' using errcode = '22023';
  end if;
  if direction_value not in ('IN', 'OUT') or not (direction_value = any(catalogue_row.allowed_directions)) then
    raise exception 'Direction is not allowed for this category' using errcode = '22023';
  end if;
  if direction_value = 'OUT' and outgoing_type_value not in ('REFUND', 'EXPENSE', 'SUPPLIER_PAYMENT') then
    raise exception 'Money out must be Refund, Expense, or Supplier payment' using errcode = '22023';
  end if;
  if outgoing_type_value = 'REFUND' then
    raise exception 'Refunds must use the controlled linked or general refund workflow'
      using errcode = '22023', hint = 'POS_REFUND_WORKFLOW_REQUIRED';
  end if;
  if direction_value = 'IN' then outgoing_type_value := null; end if;
  if catalogue_row.note_required and length(coalesce(note_value, '')) < 3 then
    raise exception 'A note is required for this category' using errcode = '22023';
  end if;
  if catalogue_row.customer_required and customer_name_value = 'Walk-in' then
    raise exception 'Customer name is required for this category' using errcode = '22023';
  end if;
  if length(customer_name_value) > 160 or length(coalesce(customer_phone_value, '')) > 40
    or length(coalesce(note_value, '')) > 2000 then
    raise exception 'Transaction details are too long' using errcode = '22023';
  end if;

  if source_value is not null then
    if jsonb_typeof(source_value) <> 'object' then
      raise exception 'Source link is invalid' using errcode = '22023';
    end if;
    source_type_value := upper(btrim(source_value ->> 'type'));
    source_namespace_value := nullif(lower(btrim(source_value ->> 'namespace')), '');
    source_record_id_value := nullif(btrim(source_value ->> 'recordId'), '');
    source_display_reference_value := nullif(btrim(source_value ->> 'displayReference'), '');
    if source_type_value not in ('LMS','TICKETING','APPLICATIONS','PACKAGES')
      or length(coalesce(source_record_id_value, '')) not between 1 and 200
      or (source_namespace_value is not null and source_namespace_value !~ '^[a-z][a-z0-9_-]{0,63}$') then
      raise exception 'Typed source link is invalid' using errcode = '22023';
    end if;
  end if;
  if catalogue_row.source_required and source_record_id_value is null then
    raise exception 'This tracked service requires a source record link'
      using errcode = '22023', hint = 'POS_SOURCE_LINK_REQUIRED';
  end if;
  if catalogue_row.tracked_source_type = 'APPLICATIONS'
    and source_type_value is distinct from 'APPLICATIONS' then
    raise exception 'Application category requires an Applications source link' using errcode = '22023';
  end if;
  if catalogue_row.item_key = 'ticket-package'
    and source_type_value not in ('TICKETING', 'PACKAGES') then
    raise exception 'Ticket & Package requires a Ticketing or Packages source link' using errcode = '22023';
  end if;

  if pricing_id_value is not null then
    select * into pricing_row from public.service_pricing
    where id = pricing_id_value and is_active and sale_price = amount_value;
    if not found then
      raise exception 'The selected active pricing option does not match the transaction total'
        using errcode = '22023', hint = 'POS_PRICING_CONFIRMATION_REQUIRED';
    end if;
  elsif catalogue_row.tracked_source_type = 'APPLICATIONS'
    and coalesce((p_request ->> 'pricingConfirmed')::boolean, false) is false then
    raise exception 'Confirm the manual total when no unique pricing option is selected'
      using errcode = '22023', hint = 'POS_PRICING_CONFIRMATION_REQUIRED';
  end if;

  select count(*)::integer, coalesce(sum((entry.value ->> 'amount')::numeric), 0)::numeric(14,2)
  into tender_count_value, tender_total_value
  from jsonb_array_elements(tenders_value) entry(value);
  if exists (
    select 1 from jsonb_array_elements(tenders_value) entry(value)
    where jsonb_typeof(entry.value) <> 'object'
      or upper(entry.value ->> 'method') not in ('CASH','CARD','BANK','OTHER')
      or not (upper(entry.value ->> 'method') = any(catalogue_row.allowed_payment_methods))
      or jsonb_typeof(entry.value -> 'amount') <> 'number'
      or (entry.value ->> 'amount')::numeric <= 0
      or scale((entry.value ->> 'amount')::numeric) > 2
      or length(coalesce(entry.value ->> 'externalReference', '')) > 200
  ) then
    raise exception 'Payment tender is invalid' using errcode = '22023';
  end if;
  amount_paid_value := tender_total_value;

  if catalogue_row.classification = 'SUPPLIER' or outgoing_type_value = 'SUPPLIER_PAYMENT' then
    if supplier_id_value is null or supplier_movement_value not in ('DEPOSIT','USE_BALANCE','REFUND') then
      raise exception 'A configured supplier and movement are required' using errcode = '22023';
    end if;
    perform 1 from public.pos_supplier_profiles profile
    join public.supplier_vendors supplier on supplier.id = profile.supplier_vendor_id
    where profile.supplier_vendor_id = supplier_id_value and profile.is_active and supplier.is_approved
    for update of profile;
    if not found then raise exception 'Configured supplier not found' using errcode = 'P0002'; end if;
    if supplier_movement_value = 'DEPOSIT' and (direction_value <> 'OUT' or amount_paid_value <> amount_value) then
      raise exception 'Supplier deposit must record the full outgoing payment' using errcode = '22023';
    elsif supplier_movement_value = 'USE_BALANCE' and (direction_value <> 'OUT' or tender_count_value <> 0) then
      raise exception 'Using supplier balance cannot move money a second time' using errcode = '22023';
    elsif supplier_movement_value = 'REFUND' and direction_value <> 'IN' then
      raise exception 'Supplier refund must be money or credit returned' using errcode = '22023';
    end if;
    select coalesce(sum(balance_delta), 0) into supplier_balance_value
    from public.pos_supplier_balance_entries
    where location_id = location_id_value and supplier_vendor_id = supplier_id_value;
    supplier_delta_value := case when supplier_movement_value = 'DEPOSIT' then amount_value else -amount_value end;
    if supplier_balance_value + supplier_delta_value < 0 then
      raise exception 'Supplier balance is insufficient' using errcode = '23514', hint = 'POS_INSUFFICIENT_SUPPLIER_BALANCE';
    end if;
  elsif supplier_id_value is not null or supplier_movement_value is not null then
    raise exception 'Supplier details are not allowed for this transaction' using errcode = '22023';
  end if;

  if supplier_movement_value = 'USE_BALANCE' then
    amount_paid_value := 0;
  elsif supplier_movement_value = 'REFUND' and tender_count_value = 0 then
    amount_paid_value := 0;
  elsif amount_paid_value > amount_value then
    raise exception 'Tender total cannot exceed the transaction amount' using errcode = '22023';
  elsif amount_paid_value < amount_value and source_record_id_value is null then
    raise exception 'A remaining balance must belong to a linked source system'
      using errcode = '22023', hint = 'POS_SHADOW_DEBT_FORBIDDEN';
  end if;

  if source_type_value = 'LMS' and amount_paid_value > 0 then
    if tender_count_value <> 1 or jsonb_typeof(coalesce(lms_value, 'null'::jsonb)) <> 'object'
      or nullif(lms_value ->> 'loanId', '') is null
      or nullif(lms_value ->> 'paymentMethodId', '') is null then
      raise exception 'An LMS payment requires one mapped payment method and loan'
        using errcode = '22023';
    end if;
    lms_response := public.lms_record_payment(
      (lms_value ->> 'loanId')::uuid,
      p_actor_employee_id,
      amount_paid_value,
      (lms_value ->> 'paymentMethodId')::uuid,
      'POS ' || customer_name_value || coalesce(' - ' || note_value, ''),
      occurred_at_value,
      'pos:' || key_value
    );
    source_record_id_value := coalesce(lms_response ->> 'transactionId', source_record_id_value);
    source_display_reference_value := coalesce(source_display_reference_value, lms_response ->> 'recordedPaymentLoanId');
  end if;

  if loyalty_code_value is not null then
    if not catalogue_row.loyalty_eligible or direction_value <> 'IN' or amount_paid_value <> amount_value then
      raise exception 'This transaction is not eligible for POS loyalty points' using errcode = '22023';
    end if;
    select * into loyalty_user
    from public.mobile_users
    where customer_code = loyalty_code_value and customer_lifecycle_status = 'active'
    for update;
    if not found then raise exception 'Active loyalty member not found' using errcode = 'P0002', hint = 'POS_LOYALTY_NOT_FOUND'; end if;
    loyalty_points_value := floor(amount_value * catalogue_row.points_per_gbp)::integer;
    if loyalty_points_value <= 0 then loyalty_code_value := null; end if;
  end if;

  if coalesce((p_request ->> 'confirmDuplicate')::boolean, false) = false and exists (
    select 1 from public.pos_transactions transaction
    where transaction.location_id = location_id_value
      and transaction.created_by = p_actor_employee_id
      and transaction.catalogue_item_id = catalogue_row.id
      and transaction.total_amount = amount_value
      and lower(transaction.customer_name) = lower(customer_name_value)
      and transaction.created_at >= clock_timestamp() - interval '5 minutes'
  ) then
    raise exception 'A similar transaction was posted recently'
      using errcode = '23505', hint = 'POS_DUPLICATE_WARNING';
  end if;

  balances_value := public.pos_expected_balances_v1(shift_row.till_id, shift_row.id);
  select coalesce(sum((entry.value ->> 'amount')::numeric), 0) * case when direction_value = 'OUT' then -1 else 1 end
  into cash_delta_value
  from jsonb_array_elements(tenders_value) entry(value)
  where upper(entry.value ->> 'method') = 'CASH';
  if (balances_value ->> 'drawer')::numeric + cash_delta_value < 0 then
    raise exception 'The drawer does not contain enough expected cash'
      using errcode = '23514', hint = 'POS_INSUFFICIENT_DRAWER';
  end if;

  reference_value := public.pos_next_reference_v1(location_id_value, business_date_value, 'POS');
  transaction_kind_value := case
    when catalogue_row.classification = 'SUPPLIER' or outgoing_type_value = 'SUPPLIER_PAYMENT' then 'SUPPLIER'
    when direction_value = 'OUT' then 'MONEY_OUT'
    else 'SALE'
  end;
  if loyalty_code_value is not null then
    loyalty_source_reference_value := public.customer_loyalty_source_reference_v1('service', 'pos', transaction_id_value);
  end if;
  search_text_value := concat_ws(' ', reference_value, customer_name_value, customer_phone_value,
    catalogue_row.label, catalogue_row.option_label, note_value, source_record_id_value,
    source_display_reference_value, (select string_agg(entry.value ->> 'externalReference', ' ')
      from jsonb_array_elements(tenders_value) entry(value)));

  insert into public.pos_transactions (
    id, reference_number, location_id, till_id, shift_id, business_date, occurred_at,
    transaction_kind, direction, outgoing_type, catalogue_item_id, pricing_row_id, pricing_option_label,
    total_amount, amount_paid,
    customer_name, customer_phone, loyalty_mobile_user_id, loyalty_source_reference,
    loyalty_points_awarded, supplier_vendor_id, supplier_movement_type, note, search_text,
    created_by, idempotency_key, request_fingerprint
  ) values (
    transaction_id_value, reference_value, location_id_value, shift_row.till_id, shift_row.id,
    business_date_value, occurred_at_value, transaction_kind_value, direction_value,
    outgoing_type_value, catalogue_row.id, pricing_row.id,
    case when pricing_id_value is not null then pricing_row.service_option end,
    amount_value, amount_paid_value, customer_name_value,
    customer_phone_value, case when loyalty_code_value is not null then loyalty_user.id end,
    loyalty_source_reference_value, loyalty_points_value, supplier_id_value, supplier_movement_value,
    note_value, search_text_value, p_actor_employee_id, key_value,
    encode(public.digest(canonical_request::text, 'sha256'), 'hex')
  );

  for tender_entry in select value, ordinality from jsonb_array_elements(tenders_value) with ordinality loop
    tender_method_value := upper(tender_entry.value ->> 'method');
    tender_amount_value := (tender_entry.value ->> 'amount')::numeric;
    tender_external_reference_value := nullif(btrim(tender_entry.value ->> 'externalReference'), '');
    tender_reconciliation_value := case
      when tender_method_value = 'CASH' then 'COMPLETED'
      else coalesce(nullif(upper(tender_entry.value ->> 'reconciliationStatus'), ''), 'RECORDED')
    end;
    if tender_reconciliation_value not in ('RECORDED','PENDING','COMPLETED','FAILED') then
      raise exception 'Tender reconciliation status is invalid' using errcode = '22023';
    end if;
    insert into public.pos_transaction_tenders (
      transaction_id, payment_method, amount, external_reference, reconciliation_status
    ) values (
      transaction_id_value, tender_method_value, tender_amount_value,
      tender_external_reference_value, tender_reconciliation_value
    ) returning id into tender_id_value;
    if tender_method_value = 'CASH' then
      insert into public.pos_cash_movements (
        location_id, till_id, shift_id, transaction_id, movement_type, amount, drawer_delta,
        reason, created_by, idempotency_key
      ) values (
        location_id_value, shift_row.till_id, shift_row.id, transaction_id_value,
        'TRANSACTION_TENDER', tender_amount_value,
        case when direction_value = 'OUT' then -tender_amount_value else tender_amount_value end,
        'Cash component for ' || reference_value, p_actor_employee_id,
        key_value || ':tender:' || tender_entry.ordinality
      );
    end if;
  end loop;

  if source_record_id_value is not null then
    insert into public.pos_transaction_source_links (
      transaction_id, source_type, source_namespace, source_record_id, display_reference
    ) values (
      transaction_id_value, source_type_value, source_namespace_value, source_record_id_value,
      source_display_reference_value
    );
  end if;

  if supplier_id_value is not null then
    select upper(entry.value ->> 'method') into supplier_payment_method_value
    from jsonb_array_elements(tenders_value) entry(value) limit 1;
    insert into public.pos_supplier_balance_entries (
      location_id, supplier_vendor_id, transaction_id, movement_type, balance_delta,
      payment_method, reference, note, created_by, idempotency_key
    ) values (
      location_id_value, supplier_id_value, transaction_id_value, supplier_movement_value,
      supplier_delta_value,
      case when supplier_movement_value = 'USE_BALANCE' or tender_count_value = 0 then 'CREDIT'
        else supplier_payment_method_value end,
      reference_value, note_value, p_actor_employee_id, key_value
    );
  end if;

  if loyalty_code_value is not null then
    perform public.customer_loyalty_register_code_source_v1(
      loyalty_code_value, 'service', 'pos', transaction_id_value,
      catalogue_row.label || coalesce(' · ' || catalogue_row.option_label, ''), loyalty_points_value
    );
    perform public.customer_loyalty_record_service_event_v1(
      'pos', transaction_id_value, 'pos.completed:' || transaction_id_value, 'completed', occurred_at_value
    );
    perform public.customer_loyalty_record_service_event_v1(
      'pos', transaction_id_value, 'pos.paid:' || transaction_id_value, 'paid', occurred_at_value
    );
    select * into loyalty_award from public.customer_loyalty_awards
    where source_reference = loyalty_source_reference_value;
  end if;

  insert into public.pos_audit_events (
    location_id, actor_employee_id, event_type, entity_type, entity_id, event_summary, metadata
  ) values (
    location_id_value, p_actor_employee_id, 'transaction.posted', 'TRANSACTION', transaction_id_value,
    'POS transaction posted',
    jsonb_build_object('reference', reference_value, 'direction', direction_value,
      'amount', amount_value, 'amountPaid', amount_paid_value, 'categoryKey', catalogue_row.item_key,
      'loyaltyPoints', loyalty_points_value)
  );
  response_value := jsonb_build_object(
    'transactionId', transaction_id_value, 'reference', reference_value,
    'businessDate', business_date_value, 'totalAmount', amount_value, 'amountPaid', amount_paid_value,
    'balanceRemaining', amount_value - amount_paid_value, 'loyaltyPointsAwarded', loyalty_points_value,
    'loyaltyAwardId', loyalty_award.id, 'supplierBalance',
      case when supplier_id_value is not null then supplier_balance_value + supplier_delta_value end,
    'idempotentReplay', false
  );
  insert into public.pos_idempotency_keys (
    action_name, actor_employee_id, idempotency_key, request_payload, response_payload
  ) values (action_name_value, p_actor_employee_id, key_value, canonical_request, response_value);
  return response_value;
exception
  when invalid_text_representation or numeric_value_out_of_range or division_by_zero then
    raise exception 'Invalid POS transaction details' using errcode = '22023';
end;
$$;

create or replace function public.pos_record_refund_v1(
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
  action_name_value constant text := 'pos.record_refund.v1';
  key_value text := btrim(coalesce(p_idempotency_key, ''));
  canonical_request jsonb := coalesce(p_request, '{}'::jsonb) - 'freshFactorMethod';
  existing_request jsonb;
  existing_response jsonb;
  actor_location_id uuid;
  role_level_value integer;
  shift_row public.pos_shifts%rowtype;
  original_row public.pos_transactions%rowtype;
  original_shift_status text;
  original_award public.customer_loyalty_awards%rowtype;
  refund_id_value uuid := gen_random_uuid();
  reference_value text;
  refund_kind_value text := upper(btrim(coalesce(p_request ->> 'refundKind', 'LINKED')));
  amount_value numeric(14,2);
  refunded_before_value numeric(14,2) := 0;
  remaining_value numeric(14,2);
  cumulative_refund_value numeric(14,2);
  tenders_value jsonb := coalesce(p_request -> 'tenders', '[]'::jsonb);
  tender_total_value numeric(14,2);
  tender_count_value integer;
  tender_entry record;
  tender_method_value text;
  tender_amount_value numeric(14,2);
  tender_external_reference_value text;
  tender_reconciliation_value text;
  overall_status_value text := 'COMPLETED';
  cash_refund_value numeric(14,2) := 0;
  balances_value jsonb;
  reason_code_value text := nullif(upper(btrim(p_request ->> 'reasonCode')), '');
  note_value text := nullif(btrim(p_request ->> 'note'), '');
  supporting_reference_value text := nullif(btrim(p_request ->> 'supportingReference'), '');
  original_evidence_value jsonb := coalesce(p_request -> 'originalEvidence', '{}'::jsonb);
  fresh_factor_method_value text := nullif(p_request ->> 'freshFactorMethod', '');
  approval_reason_value text := nullif(btrim(p_request ->> 'approvalReason'), '');
  manager_required boolean := false;
  points_reversed_before integer := 0;
  target_points_reversed integer := 0;
  points_to_reverse integer := 0;
  available_points_value integer := 0;
  final_reversal_value boolean := false;
  adjustment_award public.customer_loyalty_awards%rowtype;
  earned_ledger public.loyalty_points_ledger%rowtype;
  response_value jsonb;
begin
  if length(key_value) not between 8 and 200 or jsonb_typeof(coalesce(p_request, 'null'::jsonb)) <> 'object'
    or jsonb_typeof(tenders_value) <> 'array' or jsonb_typeof(original_evidence_value) <> 'object' then
    raise exception 'Valid POS refund request required' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(action_name_value || ':' || p_actor_employee_id || ':' || key_value, 0));
  select request_payload, response_payload into existing_request, existing_response
  from public.pos_idempotency_keys
  where action_name = action_name_value and actor_employee_id = p_actor_employee_id and idempotency_key = key_value;
  if found then
    if existing_request is distinct from canonical_request then
      raise exception 'POS idempotency key reused with different refund details'
        using errcode = '22023', hint = 'POS_IDEMPOTENCY_CONFLICT';
    end if;
    return existing_response || jsonb_build_object('idempotentReplay', true);
  end if;

  select employee.location_id, role.level into actor_location_id, role_level_value
  from public.employees employee
  join public.roles role on role.id = employee.role_id
  where employee.id = p_actor_employee_id and employee.is_active
  for update of employee;
  if not found or actor_location_id is null then
    raise exception 'Active branch employee required' using errcode = '42501';
  end if;
  select * into shift_row
  from public.pos_shifts
  where id = nullif(p_request ->> 'shiftId', '')::uuid
    and location_id = actor_location_id and status = 'OPEN'
  for update;
  if not found then raise exception 'An open branch till is required' using errcode = '55000', hint = 'POS_SHIFT_REQUIRED'; end if;

  amount_value := (p_request ->> 'amount')::numeric;
  if amount_value <= 0 or scale(amount_value) > 2
    or length(coalesce(reason_code_value, '')) not between 2 and 80
    or length(coalesce(note_value, '')) not between 3 and 2000 then
    raise exception 'Refund amount, reason and note are required' using errcode = '22023';
  end if;

  if refund_kind_value = 'LINKED' then
    select * into original_row
    from public.pos_transactions transaction_row
    where transaction_row.id = nullif(p_request ->> 'originalTransactionId', '')::uuid
      and transaction_row.location_id = actor_location_id
    for update;
    if not found then raise exception 'Original POS transaction not found' using errcode = 'P0002'; end if;
    select status into original_shift_status
    from public.pos_shifts
    where id = original_row.shift_id
    for share;
    if original_row.direction <> 'IN' or original_row.amount_paid <= 0 then
      raise exception 'Only received customer payments can be refunded' using errcode = '22023';
    end if;
    if exists (select 1 from public.pos_corrections where original_transaction_id = original_row.id) then
      raise exception 'A corrected transaction cannot also be refunded' using errcode = '55000';
    end if;
    select coalesce(sum(amount), 0) into refunded_before_value
    from public.pos_refunds
    where original_transaction_id = original_row.id and status <> 'FAILED';
    remaining_value := original_row.amount_paid - refunded_before_value;
    if amount_value > remaining_value then
      raise exception 'Refund exceeds the remaining refundable amount'
        using errcode = '23514', hint = 'POS_REFUND_EXCEEDS_REMAINING';
    end if;
    manager_required := amount_value >= 500 or original_shift_status = 'CLOSED';
    original_evidence_value := '{}'::jsonb;
  elsif refund_kind_value = 'GENERAL' then
    manager_required := true;
    if not (original_evidence_value ?& array[
      'originalDate','customerName','service','originalAmount','originalPaymentMethod'
    ]) or length(coalesce(supporting_reference_value, note_value, '')) < 3 then
      raise exception 'General refund evidence is incomplete' using errcode = '22023';
    end if;
    remaining_value := amount_value;
  else
    raise exception 'Refund kind is invalid' using errcode = '22023';
  end if;

  if manager_required and (
    role_level_value > 2 or fresh_factor_method_value not in ('totp', 'backup')
    or length(coalesce(approval_reason_value, '')) < 10
  ) then
    raise exception 'Manager approval and fresh verification are required for this refund'
      using errcode = '42501', hint = 'POS_MANAGER_VERIFICATION_REQUIRED';
  end if;

  select count(*)::integer, coalesce(sum((entry.value ->> 'amount')::numeric), 0)::numeric(14,2)
  into tender_count_value, tender_total_value
  from jsonb_array_elements(tenders_value) entry(value);
  if tender_count_value = 0 or tender_total_value <> amount_value or exists (
    select 1 from jsonb_array_elements(tenders_value) entry(value)
    where jsonb_typeof(entry.value) <> 'object'
      or upper(entry.value ->> 'method') not in ('CASH','CARD','BANK','OTHER')
      or jsonb_typeof(entry.value -> 'amount') <> 'number'
      or (entry.value ->> 'amount')::numeric <= 0
      or scale((entry.value ->> 'amount')::numeric) > 2
      or length(coalesce(entry.value ->> 'externalReference', '')) > 200
  ) then
    raise exception 'Refund tenders must equal the refund amount' using errcode = '22023';
  end if;
  select coalesce(sum((entry.value ->> 'amount')::numeric), 0) into cash_refund_value
  from jsonb_array_elements(tenders_value) entry(value)
  where upper(entry.value ->> 'method') = 'CASH';
  balances_value := public.pos_expected_balances_v1(shift_row.till_id, shift_row.id);
  if (balances_value ->> 'drawer')::numeric < cash_refund_value then
    raise exception 'The drawer does not contain enough expected cash for this refund'
      using errcode = '23514', hint = 'POS_INSUFFICIENT_DRAWER';
  end if;

  if exists (
    select 1 from jsonb_array_elements(tenders_value) entry(value)
    where upper(entry.value ->> 'method') <> 'CASH'
      and coalesce(nullif(upper(entry.value ->> 'reconciliationStatus'), ''), 'RECORDED') <> 'COMPLETED'
  ) then
    overall_status_value := 'RECORDED';
  end if;

  reference_value := public.pos_next_reference_v1(actor_location_id, shift_row.business_date, 'RF');

  if refund_kind_value = 'LINKED' and original_row.loyalty_source_reference is not null
    and original_row.loyalty_points_awarded > 0 then
    select * into original_award from public.customer_loyalty_awards
    where source_reference = original_row.loyalty_source_reference
    for update;
    if found then
      select coalesce(sum(points_reversed), 0) into points_reversed_before
      from public.pos_loyalty_adjustments
      where original_award_id = original_award.id;
      cumulative_refund_value := refunded_before_value + amount_value;
      final_reversal_value := cumulative_refund_value >= original_row.amount_paid;
      target_points_reversed := case when final_reversal_value then original_row.loyalty_points_awarded
        else floor(original_row.loyalty_points_awarded * cumulative_refund_value / original_row.amount_paid)::integer end;
      points_to_reverse := greatest(target_points_reversed - points_reversed_before, 0);

      if final_reversal_value then
        update public.customer_loyalty_awards set state = 'reversed', reversed_at = clock_timestamp()
        where id = original_award.id;
        update public.customer_loyalty_awards award set state = 'reversed', reversed_at = clock_timestamp()
        where award.id in (
          select adjustment.adjustment_award_id from public.pos_loyalty_adjustments adjustment
          where adjustment.original_award_id = original_award.id
        );
      end if;

      if points_to_reverse > 0 then
        select coalesce(sum(points_change), 0)::integer into available_points_value
        from public.loyalty_points_ledger
        where mobile_user_id = original_award.mobile_user_id;
        if available_points_value < points_to_reverse and (
          role_level_value > 2 or fresh_factor_method_value not in ('totp', 'backup')
        ) then
          raise exception 'Refunded loyalty points may have been redeemed; manager verification is required'
            using errcode = '42501', hint = 'POS_LOYALTY_MANAGER_REVIEW_REQUIRED';
        end if;

        insert into public.customer_loyalty_awards (
          mobile_user_id, source_type, source_reference, description, points, state,
          activation_milestone, reversal_of, activated_at, reversed_at
        ) values (
          original_award.mobile_user_id, 'adjustment', 'pos.refund.v1:' || refund_id_value,
          'POS refund ' || reference_value, -points_to_reverse,
          case when final_reversal_value then 'reversed' else 'available' end,
          'refund_or_cancellation', case when final_reversal_value then original_award.id end,
          case when final_reversal_value then null else clock_timestamp() end,
          case when final_reversal_value then clock_timestamp() end
        ) returning * into adjustment_award;

        select * into earned_ledger from public.loyalty_points_ledger
        where customer_source_reference = original_award.source_reference;
        insert into public.loyalty_points_ledger (
          mobile_user_id, transaction_type, points_change, reason, source_ledger_id,
          customer_state, customer_source_reference, customer_activation_milestone, customer_reversal_of
        ) values (
          original_award.mobile_user_id, 'Adjusted', -points_to_reverse, 'POS refund ' || reference_value,
          earned_ledger.id, case when final_reversal_value then 'reversed' else 'available' end,
          adjustment_award.source_reference, 'refund_or_cancellation', original_award.id
        );
      end if;
    end if;
  end if;

  insert into public.pos_refunds (
    id, reference_number, location_id, till_id, shift_id, business_date, original_transaction_id, refund_kind,
    amount, status, reason_code, note, supporting_reference, original_evidence, search_text, created_by,
    approved_by, approval_reason, fresh_factor_method, loyalty_points_reversed,
    loyalty_adjustment_award_id, idempotency_key, request_fingerprint
  ) values (
    refund_id_value, reference_value, actor_location_id, shift_row.till_id, shift_row.id, shift_row.business_date,
    case when refund_kind_value = 'LINKED' then original_row.id end, refund_kind_value, amount_value,
    overall_status_value, reason_code_value, note_value, supporting_reference_value, original_evidence_value,
    concat_ws(' ', reference_value, original_row.reference_number, original_row.customer_name,
      original_evidence_value ->> 'customerName', original_evidence_value ->> 'service',
      reason_code_value, note_value, supporting_reference_value),
    p_actor_employee_id, case when manager_required then p_actor_employee_id end,
    approval_reason_value, case when manager_required then fresh_factor_method_value end,
    points_to_reverse, adjustment_award.id, key_value,
    encode(public.digest(canonical_request::text, 'sha256'), 'hex')
  );
  if points_to_reverse > 0 then
    insert into public.pos_loyalty_adjustments (
      refund_id, original_award_id, adjustment_award_id, points_reversed, is_final
    ) values (
      refund_id_value, original_award.id, adjustment_award.id, points_to_reverse, final_reversal_value
    );
  end if;

  for tender_entry in select value, ordinality from jsonb_array_elements(tenders_value) with ordinality loop
    tender_method_value := upper(tender_entry.value ->> 'method');
    tender_amount_value := (tender_entry.value ->> 'amount')::numeric;
    tender_external_reference_value := nullif(btrim(tender_entry.value ->> 'externalReference'), '');
    tender_reconciliation_value := case when tender_method_value = 'CASH' then 'COMPLETED'
      else coalesce(nullif(upper(tender_entry.value ->> 'reconciliationStatus'), ''), 'RECORDED') end;
    if tender_reconciliation_value not in ('RECORDED','PENDING','COMPLETED','FAILED') then
      raise exception 'Refund reconciliation status is invalid' using errcode = '22023';
    end if;
    if tender_reconciliation_value <> 'COMPLETED' then overall_status_value := 'RECORDED'; end if;
    insert into public.pos_refund_tenders (
      refund_id, payment_method, amount, external_reference, reconciliation_status
    ) values (
      refund_id_value, tender_method_value, tender_amount_value,
      tender_external_reference_value, tender_reconciliation_value
    );
    if tender_method_value = 'CASH' then
      insert into public.pos_cash_movements (
        location_id, till_id, shift_id, refund_id, movement_type, amount, drawer_delta,
        reason, created_by, idempotency_key
      ) values (
        actor_location_id, shift_row.till_id, shift_row.id, refund_id_value, 'REFUND_TENDER',
        tender_amount_value, -tender_amount_value, 'Cash refund ' || reference_value,
        p_actor_employee_id, key_value || ':tender:' || tender_entry.ordinality
      );
    end if;
  end loop;

  insert into public.pos_audit_events (
    location_id, actor_employee_id, event_type, entity_type, entity_id, event_summary, metadata
  ) values (
    actor_location_id, p_actor_employee_id,
    case when refund_kind_value = 'GENERAL' then 'refund.general_recorded' else 'refund.linked_recorded' end,
    'REFUND', refund_id_value, 'POS refund recorded',
    jsonb_build_object('reference', reference_value, 'amount', amount_value,
      'originalTransactionId', original_row.id, 'loyaltyPointsReversed', points_to_reverse,
      'managerApproved', manager_required)
  );
  response_value := jsonb_build_object(
    'refundId', refund_id_value, 'reference', reference_value, 'status', overall_status_value,
    'amount', amount_value, 'remainingRefundable', case when refund_kind_value = 'LINKED'
      then remaining_value - amount_value else null end,
    'loyaltyPointsReversed', points_to_reverse, 'idempotentReplay', false
  );
  insert into public.pos_idempotency_keys (
    action_name, actor_employee_id, idempotency_key, request_payload, response_payload
  ) values (action_name_value, p_actor_employee_id, key_value, canonical_request, response_value);
  return response_value;
exception
  when invalid_text_representation or numeric_value_out_of_range or division_by_zero then
    raise exception 'Invalid POS refund details' using errcode = '22023';
end;
$$;

create or replace function public.pos_configure_supplier_v1(
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
  action_name_value constant text := 'pos.configure_supplier.v1';
  key_value text := btrim(coalesce(p_idempotency_key, ''));
  canonical_request jsonb := coalesce(p_request, '{}'::jsonb) - 'freshFactorMethod';
  existing_request jsonb;
  existing_response jsonb;
  actor_location_id uuid;
  role_level_value integer;
  supplier_row public.supplier_vendors%rowtype;
  name_value text := nullif(btrim(p_request ->> 'name'), '');
  alternate_names_value text[];
  source_area_value text := nullif(btrim(p_request ->> 'sourceArea'), '');
  source_reference_value text := nullif(btrim(p_request ->> 'sourceReference'), '');
  opening_balance_value numeric(14,2) := coalesce((p_request ->> 'openingBalance')::numeric, 0);
  opening_note_value text := nullif(btrim(p_request ->> 'openingNote'), '');
  fresh_factor_method_value text := nullif(p_request ->> 'freshFactorMethod', '');
  response_value jsonb;
begin
  if length(key_value) not between 8 and 200 or jsonb_typeof(coalesce(p_request, 'null'::jsonb)) <> 'object'
    or length(coalesce(name_value, '')) not between 2 and 160
    or length(coalesce(source_area_value, '')) > 80
    or length(coalesce(source_reference_value, '')) > 200
    or opening_balance_value < 0 or scale(opening_balance_value) > 2 then
    raise exception 'Valid configured supplier details required' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(action_name_value || ':' || p_actor_employee_id || ':' || key_value, 0));
  select request_payload, response_payload into existing_request, existing_response
  from public.pos_idempotency_keys
  where action_name = action_name_value and actor_employee_id = p_actor_employee_id and idempotency_key = key_value;
  if found then
    if existing_request is distinct from canonical_request then
      raise exception 'POS idempotency key reused with different supplier details'
        using errcode = '22023', hint = 'POS_IDEMPOTENCY_CONFLICT';
    end if;
    return existing_response || jsonb_build_object('idempotentReplay', true);
  end if;

  select employee.location_id, role.level into actor_location_id, role_level_value
  from public.employees employee
  join public.roles role on role.id = employee.role_id
  where employee.id = p_actor_employee_id and employee.is_active
  for update of employee;
  if not found or role_level_value > 2 then
    raise exception 'Manager access required to configure suppliers' using errcode = '42501';
  end if;
  if opening_balance_value > 0 and (
    fresh_factor_method_value not in ('totp', 'backup') or length(coalesce(opening_note_value, '')) < 10
  ) then
    raise exception 'Fresh verification and a note are required for an opening supplier balance'
      using errcode = '42501', hint = 'POS_MANAGER_VERIFICATION_REQUIRED';
  end if;

  select coalesce(array_agg(distinct lower(btrim(value))) filter (where length(btrim(value)) > 0), '{}'::text[])
  into alternate_names_value
  from jsonb_array_elements_text(coalesce(p_request -> 'alternateNames', '[]'::jsonb)) alias(value);
  if cardinality(alternate_names_value) > 20
    or exists (select 1 from unnest(alternate_names_value) alias where length(alias) > 160) then
    raise exception 'Supplier alternate names are invalid' using errcode = '22023';
  end if;

  insert into public.supplier_vendors (name, vendor_type, is_approved)
  values (name_value, 'Supplier', true)
  on conflict (lower(btrim(name))) do update set is_approved = true
  returning * into supplier_row;
  insert into public.pos_supplier_profiles (
    supplier_vendor_id, alternate_names, source_area, source_reference, configured_by
  ) values (
    supplier_row.id, alternate_names_value, source_area_value, source_reference_value, p_actor_employee_id
  ) on conflict (supplier_vendor_id) do update set
    alternate_names = excluded.alternate_names,
    source_area = excluded.source_area,
    source_reference = excluded.source_reference,
    is_active = true,
    updated_at = clock_timestamp();

  if opening_balance_value > 0 then
    insert into public.pos_supplier_balance_entries (
      location_id, supplier_vendor_id, movement_type, balance_delta, payment_method,
      reference, note, created_by, approved_by, idempotency_key
    ) values (
      actor_location_id, supplier_row.id, 'OPENING', opening_balance_value, 'CREDIT',
      source_reference_value, opening_note_value, p_actor_employee_id, p_actor_employee_id, key_value
    );
  end if;
  insert into public.pos_audit_events (
    location_id, actor_employee_id, event_type, entity_type, entity_id, event_summary, metadata
  ) values (
    actor_location_id, p_actor_employee_id, 'supplier.configured', 'SUPPLIER', supplier_row.id,
    'POS supplier configured', jsonb_build_object('openingBalance', opening_balance_value)
  );
  response_value := jsonb_build_object(
    'supplierId', supplier_row.id, 'name', supplier_row.name,
    'openingBalance', opening_balance_value, 'idempotentReplay', false
  );
  insert into public.pos_idempotency_keys (
    action_name, actor_employee_id, idempotency_key, request_payload, response_payload
  ) values (action_name_value, p_actor_employee_id, key_value, canonical_request, response_value);
  return response_value;
exception
  when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'Invalid configured supplier details' using errcode = '22023';
end;
$$;

create or replace function public.pos_correct_expense_v1(
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
  action_name_value constant text := 'pos.correct_expense.v1';
  key_value text := btrim(coalesce(p_idempotency_key, ''));
  canonical_request jsonb := coalesce(p_request, '{}'::jsonb) - 'freshFactorMethod';
  existing_request jsonb;
  existing_response jsonb;
  actor_location_id uuid;
  role_level_value integer;
  shift_row public.pos_shifts%rowtype;
  original_row public.pos_transactions%rowtype;
  correction_id_value uuid := gen_random_uuid();
  correction_transaction_id_value uuid := gen_random_uuid();
  reference_value text;
  reason_value text := nullif(btrim(p_request ->> 'reason'), '');
  factor_method_value text := nullif(p_request ->> 'freshFactorMethod', '');
  cash_total_value numeric(14,2) := 0;
  balances_value jsonb;
  tender_row public.pos_transaction_tenders%rowtype;
  supplier_entry public.pos_supplier_balance_entries%rowtype;
  tender_ordinal integer := 0;
  response_value jsonb;
begin
  if length(key_value) not between 8 and 200 or jsonb_typeof(coalesce(p_request, 'null'::jsonb)) <> 'object'
    or length(coalesce(reason_value, '')) not between 10 and 2000
    or factor_method_value not in ('totp', 'backup') then
    raise exception 'Valid verified expense correction required' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(action_name_value || ':' || p_actor_employee_id || ':' || key_value, 0));
  select request_payload, response_payload into existing_request, existing_response
  from public.pos_idempotency_keys
  where action_name = action_name_value and actor_employee_id = p_actor_employee_id and idempotency_key = key_value;
  if found then
    if existing_request is distinct from canonical_request then
      raise exception 'POS idempotency key reused with different correction details'
        using errcode = '22023', hint = 'POS_IDEMPOTENCY_CONFLICT';
    end if;
    return existing_response || jsonb_build_object('idempotentReplay', true);
  end if;

  select employee.location_id, role.level into actor_location_id, role_level_value
  from public.employees employee
  join public.roles role on role.id = employee.role_id
  where employee.id = p_actor_employee_id and employee.is_active
  for update of employee;
  if not found or role_level_value > 2 then
    raise exception 'Manager verification required for an expense correction' using errcode = '42501';
  end if;
  select * into shift_row from public.pos_shifts
  where id = nullif(p_request ->> 'shiftId', '')::uuid
    and location_id = actor_location_id and status = 'OPEN'
  for update;
  if not found then raise exception 'An open branch till is required' using errcode = '55000', hint = 'POS_SHIFT_REQUIRED'; end if;
  select * into original_row from public.pos_transactions
  where id = nullif(p_request ->> 'originalTransactionId', '')::uuid
    and location_id = actor_location_id
  for update;
  if not found then raise exception 'Original POS transaction not found' using errcode = 'P0002'; end if;
  if original_row.direction <> 'OUT' or original_row.transaction_kind = 'CORRECTION' then
    raise exception 'Only an original money-out entry can use expense correction' using errcode = '22023';
  end if;
  if exists (select 1 from public.pos_corrections where original_transaction_id = original_row.id) then
    raise exception 'This transaction is already corrected' using errcode = '23505';
  end if;
  if exists (select 1 from public.pos_refunds where original_transaction_id = original_row.id) then
    raise exception 'A refunded transaction cannot be corrected' using errcode = '55000';
  end if;
  select coalesce(sum(amount), 0) into cash_total_value
  from public.pos_transaction_tenders
  where transaction_id = original_row.id and payment_method = 'CASH';

  reference_value := public.pos_next_reference_v1(actor_location_id, shift_row.business_date, 'CR');
  insert into public.pos_transactions (
    id, reference_number, location_id, till_id, shift_id, business_date, transaction_kind,
    direction, catalogue_item_id, total_amount, amount_paid, customer_name, customer_phone,
    supplier_vendor_id, supplier_movement_type, note, search_text, created_by,
    idempotency_key, request_fingerprint, metadata
  ) values (
    correction_transaction_id_value, reference_value, actor_location_id, shift_row.till_id, shift_row.id,
    shift_row.business_date, 'CORRECTION', 'IN', original_row.catalogue_item_id,
    original_row.total_amount, original_row.amount_paid, original_row.customer_name,
    original_row.customer_phone, original_row.supplier_vendor_id,
    case when original_row.supplier_movement_type is not null then 'CORRECTION' end,
    reason_value, concat_ws(' ', reference_value, original_row.reference_number, original_row.customer_name,
      reason_value, 'expense correction'), p_actor_employee_id, key_value,
    encode(public.digest(canonical_request::text, 'sha256'), 'hex'),
    jsonb_build_object('correctsTransactionId', original_row.id)
  );

  for tender_row in select * from public.pos_transaction_tenders where transaction_id = original_row.id order by created_at, id loop
    tender_ordinal := tender_ordinal + 1;
    insert into public.pos_transaction_tenders (
      transaction_id, payment_method, amount, external_reference, reconciliation_status
    ) values (
      correction_transaction_id_value, tender_row.payment_method, tender_row.amount,
      tender_row.external_reference, case when tender_row.payment_method = 'CASH' then 'COMPLETED' else 'RECORDED' end
    );
    if tender_row.payment_method = 'CASH' then
      insert into public.pos_cash_movements (
        location_id, till_id, shift_id, transaction_id, movement_type, amount, drawer_delta,
        reason, created_by, approved_by, idempotency_key
      ) values (
        actor_location_id, shift_row.till_id, shift_row.id, correction_transaction_id_value,
        'CORRECTION', tender_row.amount, tender_row.amount, reason_value,
        p_actor_employee_id, p_actor_employee_id, key_value || ':tender:' || tender_ordinal
      );
    end if;
  end loop;

  insert into public.pos_transaction_source_links (
    transaction_id, source_type, source_namespace, source_record_id, display_reference
  ) values (
    correction_transaction_id_value, 'POS', 'correction', original_row.id::text, original_row.reference_number
  );
  if original_row.supplier_vendor_id is not null then
    select * into supplier_entry from public.pos_supplier_balance_entries
    where transaction_id = original_row.id order by created_at, id limit 1;
    if found then
      insert into public.pos_supplier_balance_entries (
        location_id, supplier_vendor_id, transaction_id, movement_type, balance_delta,
        payment_method, reference, note, created_by, approved_by, idempotency_key
      ) values (
        actor_location_id, original_row.supplier_vendor_id, correction_transaction_id_value,
        'CORRECTION', -supplier_entry.balance_delta, supplier_entry.payment_method,
        reference_value, reason_value, p_actor_employee_id, p_actor_employee_id, key_value
      );
    end if;
  end if;

  insert into public.pos_corrections (
    id, original_transaction_id, correction_transaction_id, reason, created_by, fresh_factor_method
  ) values (
    correction_id_value, original_row.id, correction_transaction_id_value, reason_value,
    p_actor_employee_id, factor_method_value
  );
  insert into public.pos_audit_events (
    location_id, actor_employee_id, event_type, entity_type, entity_id, event_summary, metadata
  ) values (
    actor_location_id, p_actor_employee_id, 'transaction.expense_corrected', 'CORRECTION', correction_id_value,
    'POS expense correction posted', jsonb_build_object(
      'originalTransactionId', original_row.id, 'correctionTransactionId', correction_transaction_id_value,
      'originalReference', original_row.reference_number, 'correctionReference', reference_value
    )
  );
  response_value := jsonb_build_object(
    'correctionId', correction_id_value, 'transactionId', correction_transaction_id_value,
    'reference', reference_value, 'originalReference', original_row.reference_number,
    'idempotentReplay', false
  );
  insert into public.pos_idempotency_keys (
    action_name, actor_employee_id, idempotency_key, request_payload, response_payload
  ) values (action_name_value, p_actor_employee_id, key_value, canonical_request, response_value);
  return response_value;
exception
  when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'Invalid POS correction details' using errcode = '22023';
end;
$$;

create or replace function public.pos_record_reconciliation_v1(
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
  action_name_value constant text := 'pos.record_reconciliation.v1';
  key_value text := btrim(coalesce(p_idempotency_key, ''));
  canonical_request jsonb := coalesce(p_request, '{}'::jsonb);
  existing_request jsonb;
  existing_response jsonb;
  actor_location_id uuid;
  transaction_tender_id_value uuid := nullif(p_request ->> 'transactionTenderId', '')::uuid;
  refund_tender_id_value uuid := nullif(p_request ->> 'refundTenderId', '')::uuid;
  status_value text := upper(btrim(coalesce(p_request ->> 'status', '')));
  external_reference_value text := nullif(btrim(p_request ->> 'externalReference'), '');
  note_value text := nullif(btrim(p_request ->> 'note'), '');
  entity_type_value text;
  entity_id_value uuid;
  event_id_value bigint;
  response_value jsonb;
begin
  if length(key_value) not between 8 and 200 or jsonb_typeof(coalesce(p_request, 'null'::jsonb)) <> 'object'
    or (transaction_tender_id_value is not null)::integer + (refund_tender_id_value is not null)::integer <> 1
    or status_value not in ('RECORDED','PENDING','COMPLETED','FAILED')
    or length(coalesce(external_reference_value, '')) > 200 or length(coalesce(note_value, '')) > 1000 then
    raise exception 'Valid reconciliation update required' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(action_name_value || ':' || p_actor_employee_id || ':' || key_value, 0));
  select request_payload, response_payload into existing_request, existing_response
  from public.pos_idempotency_keys
  where action_name = action_name_value and actor_employee_id = p_actor_employee_id and idempotency_key = key_value;
  if found then
    if existing_request is distinct from canonical_request then
      raise exception 'POS idempotency key reused with different reconciliation details'
        using errcode = '22023', hint = 'POS_IDEMPOTENCY_CONFLICT';
    end if;
    return existing_response || jsonb_build_object('idempotentReplay', true);
  end if;

  select location_id into actor_location_id
  from public.employees where id = p_actor_employee_id and is_active for update;
  if not found or actor_location_id is null then
    raise exception 'Active branch employee required' using errcode = '42501';
  end if;
  if transaction_tender_id_value is not null then
    select transaction.id into entity_id_value
    from public.pos_transaction_tenders tender
    join public.pos_transactions transaction on transaction.id = tender.transaction_id
    where tender.id = transaction_tender_id_value and transaction.location_id = actor_location_id
      and tender.payment_method <> 'CASH';
    entity_type_value := 'TRANSACTION';
  else
    select refund.id into entity_id_value
    from public.pos_refund_tenders tender
    join public.pos_refunds refund on refund.id = tender.refund_id
    where tender.id = refund_tender_id_value and refund.location_id = actor_location_id
      and tender.payment_method <> 'CASH';
    entity_type_value := 'REFUND';
  end if;
  if entity_id_value is null then raise exception 'Branch non-cash tender not found' using errcode = 'P0002'; end if;

  insert into public.pos_reconciliation_events (
    transaction_tender_id, refund_tender_id, status, external_reference, note, created_by, idempotency_key
  ) values (
    transaction_tender_id_value, refund_tender_id_value, status_value,
    external_reference_value, note_value, p_actor_employee_id, key_value
  ) returning id into event_id_value;
  insert into public.pos_audit_events (
    location_id, actor_employee_id, event_type, entity_type, entity_id, event_summary, metadata
  ) values (
    actor_location_id, p_actor_employee_id, 'reconciliation.recorded', entity_type_value, entity_id_value,
    'POS tender reconciliation updated', jsonb_build_object('status', status_value, 'eventId', event_id_value)
  );
  response_value := jsonb_build_object('eventId', event_id_value, 'status', status_value, 'idempotentReplay', false);
  insert into public.pos_idempotency_keys (
    action_name, actor_employee_id, idempotency_key, request_payload, response_payload
  ) values (action_name_value, p_actor_employee_id, key_value, canonical_request, response_value);
  return response_value;
exception
  when invalid_text_representation then
    raise exception 'Invalid reconciliation details' using errcode = '22023';
end;
$$;

create or replace function public.pos_import_legacy_row_v1(
  p_actor_employee_id uuid,
  p_idempotency_key text,
  p_row jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  action_name_value constant text := 'pos.import_legacy_row.v1';
  key_value text := btrim(coalesce(p_idempotency_key, ''));
  canonical_request jsonb := coalesce(p_row, '{}'::jsonb) - 'freshFactorMethod';
  existing_request jsonb;
  existing_response jsonb;
  actor_location_id uuid;
  role_level_value integer;
  till_row public.pos_tills%rowtype;
  shift_row public.pos_shifts%rowtype;
  catalogue_row public.pos_catalogue_items%rowtype;
  transaction_id_value uuid := gen_random_uuid();
  business_date_value date;
  occurred_at_value timestamptz;
  direction_value text := upper(btrim(coalesce(p_row ->> 'direction', '')));
  amount_value numeric(14,2);
  reference_value text;
  source_value text := nullif(btrim(p_row ->> 'legacySource'), '');
  row_key_value text := nullif(btrim(p_row ->> 'legacyRowKey'), '');
  customer_name_value text := coalesce(nullif(btrim(p_row ->> 'customerName'), ''), 'Walk-in');
  note_value text := nullif(btrim(p_row ->> 'note'), '');
  method_value text := upper(btrim(coalesce(p_row ->> 'paymentMethod', 'OTHER')));
  existing_transaction public.pos_transactions%rowtype;
  response_value jsonb;
begin
  if length(key_value) not between 8 and 200 or jsonb_typeof(coalesce(p_row, 'null'::jsonb)) <> 'object'
    or (p_row ->> 'freshFactorMethod') not in ('totp', 'backup')
    or length(coalesce(source_value, '')) not between 2 and 100
    or length(coalesce(row_key_value, '')) not between 1 and 200 then
    raise exception 'Valid verified legacy row required' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(action_name_value || ':' || p_actor_employee_id || ':' || key_value, 0));
  select request_payload, response_payload into existing_request, existing_response
  from public.pos_idempotency_keys
  where action_name = action_name_value and actor_employee_id = p_actor_employee_id and idempotency_key = key_value;
  if found then
    if existing_request is distinct from canonical_request then
      raise exception 'POS idempotency key reused with different import row'
        using errcode = '22023', hint = 'POS_IDEMPOTENCY_CONFLICT';
    end if;
    return existing_response || jsonb_build_object('idempotentReplay', true);
  end if;
  select * into existing_transaction from public.pos_transactions
  where legacy_source = source_value and legacy_row_key = row_key_value;
  if found then
    return jsonb_build_object('transactionId', existing_transaction.id,
      'reference', existing_transaction.reference_number, 'idempotentReplay', true);
  end if;

  select employee.location_id, role.level into actor_location_id, role_level_value
  from public.employees employee join public.roles role on role.id = employee.role_id
  where employee.id = p_actor_employee_id and employee.is_active
  for update of employee;
  if not found or role_level_value > 2 then
    raise exception 'Manager verification required for legacy import' using errcode = '42501';
  end if;
  select * into till_row from public.pos_tills
  where location_id = actor_location_id and is_active order by created_at, id limit 1;
  if not found then raise exception 'Branch till not found' using errcode = 'P0002'; end if;
  select * into catalogue_row from public.pos_catalogue_items
  where item_key = p_row ->> 'catalogueKey' and is_active;
  if not found or catalogue_row.classification = 'CASH_MANAGEMENT' then
    raise exception 'Import category not found' using errcode = 'P0002';
  end if;

  business_date_value := (p_row ->> 'businessDate')::date;
  occurred_at_value := coalesce((p_row ->> 'occurredAt')::timestamptz, business_date_value::timestamptz);
  amount_value := (p_row ->> 'amount')::numeric;
  if business_date_value > current_date or amount_value <= 0 or scale(amount_value) > 2
    or direction_value not in ('IN','OUT') or method_value not in ('CASH','CARD','BANK','OTHER') then
    raise exception 'Legacy row values are invalid' using errcode = '22023';
  end if;

  select * into shift_row from public.pos_shifts
  where till_id = till_row.id and business_date = business_date_value
    and opening_override_reason = 'Legacy import session'
  order by opened_at limit 1;
  if not found then
    insert into public.pos_shifts (
      location_id, till_id, business_date, status, opening_float, opened_by,
      opened_at, closed_by, closed_at, opening_override_reason
    ) values (
      actor_location_id, till_row.id, business_date_value, 'CLOSED', 0, p_actor_employee_id,
      occurred_at_value, p_actor_employee_id, occurred_at_value, 'Legacy import session'
    ) returning * into shift_row;
  end if;

  reference_value := public.pos_next_reference_v1(actor_location_id, business_date_value, 'LG');
  insert into public.pos_transactions (
    id, reference_number, location_id, till_id, shift_id, business_date, occurred_at,
    transaction_kind, direction, outgoing_type, catalogue_item_id, total_amount, amount_paid,
    customer_name, note, search_text, created_by, idempotency_key, request_fingerprint,
    legacy_source, legacy_row_key, metadata
  ) values (
    transaction_id_value, reference_value, actor_location_id, till_row.id, shift_row.id,
    business_date_value, occurred_at_value, 'LEGACY_IMPORT', direction_value,
    case when direction_value = 'OUT' then coalesce(nullif(upper(p_row ->> 'outgoingType'), ''), 'EXPENSE') end,
    catalogue_row.id, amount_value, amount_value, customer_name_value, note_value,
    concat_ws(' ', reference_value, customer_name_value, catalogue_row.label,
      catalogue_row.option_label, note_value, source_value, row_key_value),
    p_actor_employee_id, key_value, encode(public.digest(canonical_request::text, 'sha256'), 'hex'),
    source_value, row_key_value, jsonb_build_object('originalReference', p_row ->> 'originalReference')
  );
  insert into public.pos_transaction_tenders (
    transaction_id, payment_method, amount, external_reference, reconciliation_status
  ) values (
    transaction_id_value, method_value, amount_value, nullif(btrim(p_row ->> 'externalReference'), ''),
    case when method_value = 'CASH' then 'COMPLETED' else 'RECORDED' end
  );
  insert into public.pos_transaction_source_links (
    transaction_id, source_type, source_namespace, source_record_id, display_reference
  ) values (transaction_id_value, 'LEGACY', 'excel', row_key_value, nullif(p_row ->> 'originalReference', ''));
  insert into public.pos_audit_events (
    location_id, actor_employee_id, event_type, entity_type, entity_id, event_summary, metadata
  ) values (
    actor_location_id, p_actor_employee_id, 'import.row_created', 'IMPORT', transaction_id_value,
    'Legacy POS row imported', jsonb_build_object('legacySource', source_value, 'legacyRowKey', row_key_value)
  );
  response_value := jsonb_build_object('transactionId', transaction_id_value, 'reference', reference_value,
    'idempotentReplay', false);
  insert into public.pos_idempotency_keys (
    action_name, actor_employee_id, idempotency_key, request_payload, response_payload
  ) values (action_name_value, p_actor_employee_id, key_value, canonical_request, response_value);
  return response_value;
exception
  when invalid_text_representation or numeric_value_out_of_range or datetime_field_overflow then
    raise exception 'Invalid legacy POS row' using errcode = '22023';
end;
$$;

do $pos_rls$
declare
  table_name_value text;
begin
  foreach table_name_value in array array[
    'pos_catalogue_items', 'pos_tills', 'pos_cash_reserves', 'pos_shifts',
    'pos_reference_counters', 'pos_transactions', 'pos_transaction_tenders',
    'pos_transaction_source_links', 'pos_supplier_profiles', 'pos_supplier_balance_entries',
    'pos_refunds', 'pos_loyalty_adjustments', 'pos_refund_tenders', 'pos_reconciliation_events',
    'pos_cash_movements', 'pos_closeouts', 'pos_corrections', 'pos_audit_events',
    'pos_idempotency_keys'
  ] loop
    execute format('alter table public.%I enable row level security', table_name_value);
    execute format('alter table public.%I force row level security', table_name_value);
    execute format('revoke all on public.%I from public, anon, authenticated, service_role', table_name_value);
  end loop;
end
$pos_rls$;

grant select on public.pos_catalogue_items, public.pos_tills, public.pos_cash_reserves,
  public.pos_shifts, public.pos_transactions, public.pos_transaction_tenders,
  public.pos_transaction_source_links, public.pos_supplier_profiles,
  public.pos_supplier_balance_entries, public.pos_refunds, public.pos_loyalty_adjustments,
  public.pos_refund_tenders, public.pos_reconciliation_events, public.pos_cash_movements,
  public.pos_closeouts, public.pos_corrections, public.pos_audit_events
to service_role;

revoke all on sequence public.pos_audit_events_id_seq from public, anon, authenticated, service_role;
revoke all on sequence public.pos_reconciliation_events_id_seq from public, anon, authenticated, service_role;

revoke all on function public.pos_schema_status() from public, anon, authenticated, service_role;
revoke all on function public.pos_next_reference_v1(uuid,date,text) from public, anon, authenticated, service_role;
revoke all on function public.pos_denominations_total_v1(jsonb) from public, anon, authenticated, service_role;
revoke all on function public.pos_expected_balances_v1(uuid,uuid) from public, anon, authenticated, service_role;
revoke all on function public.pos_reject_immutable_mutation_v1() from public, anon, authenticated, service_role;
revoke all on function public.pos_open_shift_v1(uuid,text,jsonb) from public, anon, authenticated, service_role;
revoke all on function public.pos_record_cash_movement_v1(uuid,text,jsonb) from public, anon, authenticated, service_role;
revoke all on function public.pos_close_shift_v1(uuid,text,jsonb) from public, anon, authenticated, service_role;
revoke all on function public.pos_approve_closeout_v1(uuid,text,jsonb) from public, anon, authenticated, service_role;
revoke all on function public.pos_post_transaction_v1(uuid,text,jsonb) from public, anon, authenticated, service_role;
revoke all on function public.pos_record_refund_v1(uuid,text,jsonb) from public, anon, authenticated, service_role;
revoke all on function public.pos_configure_supplier_v1(uuid,text,jsonb) from public, anon, authenticated, service_role;
revoke all on function public.pos_correct_expense_v1(uuid,text,jsonb) from public, anon, authenticated, service_role;
revoke all on function public.pos_record_reconciliation_v1(uuid,text,jsonb) from public, anon, authenticated, service_role;
revoke all on function public.pos_import_legacy_row_v1(uuid,text,jsonb) from public, anon, authenticated, service_role;

grant execute on function public.pos_schema_status() to service_role;
grant execute on function public.pos_expected_balances_v1(uuid,uuid) to service_role;
grant execute on function public.pos_open_shift_v1(uuid,text,jsonb) to service_role;
grant execute on function public.pos_record_cash_movement_v1(uuid,text,jsonb) to service_role;
grant execute on function public.pos_close_shift_v1(uuid,text,jsonb) to service_role;
grant execute on function public.pos_approve_closeout_v1(uuid,text,jsonb) to service_role;
grant execute on function public.pos_post_transaction_v1(uuid,text,jsonb) to service_role;
grant execute on function public.pos_record_refund_v1(uuid,text,jsonb) to service_role;
grant execute on function public.pos_configure_supplier_v1(uuid,text,jsonb) to service_role;
grant execute on function public.pos_correct_expense_v1(uuid,text,jsonb) to service_role;
grant execute on function public.pos_record_reconciliation_v1(uuid,text,jsonb) to service_role;
grant execute on function public.pos_import_legacy_row_v1(uuid,text,jsonb) to service_role;

insert into public.portal_schema_versions (component, version, applied_at, details)
values (
  'pos', 2026090801, clock_timestamp(),
  jsonb_build_object(
    'migration', '20260908214024_pos_module_complete.sql',
    'currency', 'GBP',
    'refundApprovalThreshold', 500,
    'loyaltyFormula', 'floor(eligible_paid_gbp * points_per_gbp)',
    'capabilities', jsonb_build_array(
      'branch-tills-and-shifts', 'split-tender-posting', 'immutable-audit',
      'idempotent-money-writes', 'typed-source-links', 'pos-loyalty',
      'linked-and-general-refunds', 'proportional-loyalty-reversal',
      'coin-reserve-denominations', 'supplier-running-balances',
      'independent-closeout-approval', 'reconciliation-events', 'legacy-import'
    )
  )
)
on conflict (component) do update
set version = excluded.version, applied_at = excluded.applied_at, details = excluded.details
where public.portal_schema_versions.version < excluded.version;

commit;
