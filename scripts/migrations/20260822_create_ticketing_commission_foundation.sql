-- Secure normalized Ticketing foundation and the Commission source-event boundary.
--
-- This migration deliberately leaves the legacy public.ticket_ledger and the
-- existing commission rule tables intact. New application writes use the
-- normalized tables below; legacy rows are captured for reviewed migration.

begin;

create extension if not exists pgcrypto;

create table if not exists public.portal_schema_versions (
  component text primary key,
  version bigint not null,
  applied_at timestamptz not null default now(),
  details jsonb not null default '{}'::jsonb,
  constraint portal_schema_versions_component_not_blank
    check (length(btrim(component)) between 1 and 100),
  constraint portal_schema_versions_version_positive check (version > 0)
);

create or replace function public.normalize_ticket_pnr_v1(p_value text)
returns text
language sql
immutable
parallel safe
set search_path = pg_catalog, pg_temp
as $$
  select nullif(regexp_replace(upper(btrim(p_value)), '[[:space:]]+', '', 'g'), '')
$$;

comment on function public.normalize_ticket_pnr_v1(text) is
  'Ticketing PNR normalizer v1: trim, uppercase and remove whitespace only.';

create or replace function public.is_valid_iana_timezone(p_value text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
  select p_value is not null
    and exists (
      select 1
      from pg_catalog.pg_timezone_names
      where name = p_value
    )
$$;

create or replace function public.set_ticketing_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end
$$;

create or replace function public.normalize_airline_directory_row()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.iata_code := upper(btrim(new.iata_code));
  new.name := btrim(new.name);
  new.updated_at := now();
  return new;
end
$$;

create or replace function public.advance_ticketing_row_version()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.version := old.version + 1;
  new.updated_at := now();
  return new;
end
$$;

create or replace function public.reject_immutable_event_mutation()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception '% rows are append-only', tg_table_name using errcode = '55000';
end
$$;

-- Ratchet the existing airline directory into a safe lookup table.
alter table public.airlines
  add column if not exists is_active boolean not null default true,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if exists (
    select 1
    from public.airlines
    group by upper(btrim(iata_code))
    having count(*) > 1
  ) then
    raise exception 'Duplicate normalized airline IATA codes must be resolved before Ticketing migration';
  end if;
end
$$;

update public.airlines
set iata_code = upper(btrim(iata_code)),
    name = btrim(name),
    updated_at = now()
where iata_code is distinct from upper(btrim(iata_code))
   or name is distinct from btrim(name);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.airlines'::regclass
      and conname = 'airlines_iata_code_format_check'
  ) then
    alter table public.airlines
      add constraint airlines_iata_code_format_check
      check (iata_code ~ '^[A-Z0-9]{2}$');
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.airlines'::regclass
      and conname = 'airlines_name_not_blank_check'
  ) then
    alter table public.airlines
      add constraint airlines_name_not_blank_check
      check (length(btrim(name)) between 1 and 200);
  end if;
end
$$;

create unique index if not exists airlines_normalized_iata_code_idx
  on public.airlines (upper(btrim(iata_code)));

drop trigger if exists airlines_ticketing_normalize on public.airlines;
create trigger airlines_ticketing_normalize
  before insert or update on public.airlines
  for each row execute function public.normalize_airline_directory_row();

-- Store branch-local deadline context while keeping timestamps in UTC.
alter table public.locations
  add column if not exists timezone text;

update public.locations
set timezone = 'Europe/London'
where timezone is null or btrim(timezone) = '';

alter table public.locations
  alter column timezone set default 'Europe/London',
  alter column timezone set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.locations'::regclass
      and conname = 'locations_timezone_iana_check'
  ) then
    alter table public.locations
      add constraint locations_timezone_iana_check
      check (public.is_valid_iana_timezone(timezone));
  end if;
end
$$;

-- Package PNR lookup uses the same stable normalizer as Ticketing.
alter table public.travel_package_reservations
  add column if not exists normalized_booking_reference text
    generated always as (public.normalize_ticket_pnr_v1(booking_reference)) stored;

create index if not exists travel_package_reservations_flight_pnr_idx
  on public.travel_package_reservations (normalized_booking_reference, package_id)
  where reservation_type = 'flight'
    and normalized_booking_reference is not null
    and status not in ('cancelled', 'failed');

create unique index if not exists travel_package_reservations_id_package_idx
  on public.travel_package_reservations (id, package_id);

create table if not exists public.ticket_bookings (
  id uuid primary key default gen_random_uuid(),
  owner_employee_id uuid not null references public.employees(id) on delete restrict,
  location_id uuid not null references public.locations(id) on delete restrict,
  airline_id uuid not null references public.airlines(id) on delete restrict,
  pnr text not null,
  normalized_pnr text generated always as (public.normalize_ticket_pnr_v1(pnr)) stored,
  customer_name text not null,
  contact_phone text,
  booking_date date not null,
  operational_status text not null default 'draft',
  payment_status text not null default 'unpaid',
  time_limit_at timestamptz,
  time_limit_timezone text,
  departure_date date,
  return_date date,
  package_match_status text not null default 'unmatched',
  commission_scope text not null default 'ticket',
  created_by uuid not null references public.employees(id) on delete restrict,
  updated_by uuid not null references public.employees(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  version bigint not null default 1,
  constraint ticket_bookings_pnr_not_blank_check
    check (normalized_pnr is not null and length(normalized_pnr) between 1 and 20),
  constraint ticket_bookings_customer_name_check
    check (length(btrim(customer_name)) between 1 and 200),
  constraint ticket_bookings_operational_status_check
    check (operational_status in (
      'draft', 'held', 'issued', 'expired', 'cancelled', 'part_refunded', 'refunded'
    )),
  constraint ticket_bookings_payment_status_check
    check (payment_status in ('unpaid', 'part_paid', 'paid')),
  constraint ticket_bookings_package_match_status_check
    check (package_match_status in ('unmatched', 'matched', 'ambiguous', 'manually_resolved')),
  constraint ticket_bookings_commission_scope_check
    check (commission_scope in ('ticket', 'package', 'unresolved')),
  constraint ticket_bookings_match_scope_check
    check (
      (package_match_status = 'unmatched' and commission_scope = 'ticket')
      or (package_match_status in ('matched', 'manually_resolved') and commission_scope = 'package')
      or (package_match_status = 'ambiguous' and commission_scope = 'unresolved')
    ),
  constraint ticket_bookings_held_deadline_check
    check (
      operational_status <> 'held'
      or (time_limit_at is not null and time_limit_timezone is not null)
    ),
  constraint ticket_bookings_deadline_timezone_pair_check
    check ((time_limit_at is null) = (time_limit_timezone is null)),
  constraint ticket_bookings_deadline_timezone_iana_check
    check (time_limit_timezone is null or public.is_valid_iana_timezone(time_limit_timezone)),
  constraint ticket_bookings_date_order_check
    check (return_date is null or departure_date is null or return_date >= departure_date),
  constraint ticket_bookings_version_positive_check check (version > 0)
);

create index if not exists ticket_bookings_owner_created_idx
  on public.ticket_bookings (owner_employee_id, created_at desc)
  where archived_at is null;
create index if not exists ticket_bookings_airline_pnr_idx
  on public.ticket_bookings (airline_id, normalized_pnr);
create index if not exists ticket_bookings_held_deadline_idx
  on public.ticket_bookings (time_limit_at)
  where operational_status = 'held' and archived_at is null;
create index if not exists ticket_bookings_ambiguous_package_idx
  on public.ticket_bookings (created_at)
  where package_match_status = 'ambiguous' and archived_at is null;

drop trigger if exists ticket_bookings_advance_version on public.ticket_bookings;
create trigger ticket_bookings_advance_version
  before update on public.ticket_bookings
  for each row execute function public.advance_ticketing_row_version();

create table if not exists public.ticket_transactions (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.ticket_bookings(id) on delete restrict,
  parent_transaction_id uuid,
  supersedes_transaction_id uuid,
  service_type text not null,
  owner_employee_id uuid not null references public.employees(id) on delete restrict,
  acting_employee_id uuid not null references public.employees(id) on delete restrict,
  operational_status text not null default 'draft',
  payment_status text not null default 'unpaid',
  booking_date date not null,
  time_limit_at timestamptz,
  time_limit_timezone text,
  issued_at timestamptz,
  paid_at timestamptz,
  cancelled_at timestamptz,
  refunded_at timestamptz,
  passenger_ticket_count integer not null default 0,
  currency text not null default 'GBP',
  supplier_cost_source numeric(14,2),
  supplier_cost_gbp numeric(14,2),
  sale_price_source numeric(14,2),
  sale_price_gbp numeric(14,2),
  notes text,
  correction_reason text,
  idempotency_key text,
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ticket_transactions_service_type_check
    check (service_type in ('TK', 'DC', 'R-ER')),
  constraint ticket_transactions_operational_status_check
    check (operational_status in (
      'draft', 'held', 'issued', 'expired', 'cancelled', 'part_refunded', 'refunded'
    )),
  constraint ticket_transactions_payment_status_check
    check (payment_status in ('unpaid', 'part_paid', 'paid')),
  constraint ticket_transactions_currency_check check (currency ~ '^[A-Z]{3}$'),
  constraint ticket_transactions_passenger_count_check check (passenger_ticket_count >= 0),
  constraint ticket_transactions_money_nonnegative_check check (
    (supplier_cost_source is null or supplier_cost_source >= 0)
    and (supplier_cost_gbp is null or supplier_cost_gbp >= 0)
    and (sale_price_source is null or sale_price_source >= 0)
    and (sale_price_gbp is null or sale_price_gbp >= 0)
  ),
  constraint ticket_transactions_supplier_money_pair_check
    check (supplier_cost_gbp is null or supplier_cost_source is not null),
  constraint ticket_transactions_sale_money_pair_check
    check (sale_price_gbp is null or sale_price_source is not null),
  constraint ticket_transactions_gbp_values_check check (
    currency <> 'GBP'
    or (
      (
        (supplier_cost_source is null and supplier_cost_gbp is null)
        or supplier_cost_source = supplier_cost_gbp
      )
      and (
        (sale_price_source is null and sale_price_gbp is null)
        or sale_price_source = sale_price_gbp
      )
    )
  ),
  constraint ticket_transactions_held_deadline_check check (
    operational_status <> 'held'
    or (time_limit_at is not null and time_limit_timezone is not null)
  ),
  constraint ticket_transactions_deadline_timezone_pair_check
    check ((time_limit_at is null) = (time_limit_timezone is null)),
  constraint ticket_transactions_deadline_timezone_iana_check
    check (time_limit_timezone is null or public.is_valid_iana_timezone(time_limit_timezone)),
  constraint ticket_transactions_issued_fields_check check (
    operational_status not in ('issued', 'part_refunded', 'refunded')
    or (issued_at is not null and passenger_ticket_count > 0)
  ),
  constraint ticket_transactions_paid_timestamp_check
    check ((payment_status = 'paid') = (paid_at is not null)),
  constraint ticket_transactions_paid_fields_check check (
    payment_status <> 'paid'
    or (
      supplier_cost_source is not null
      and supplier_cost_gbp is not null
      and sale_price_source is not null
      and sale_price_gbp is not null
    )
  ),
  constraint ticket_transactions_cancelled_timestamp_check check (
    (operational_status <> 'cancelled' or cancelled_at is not null)
    and (
      cancelled_at is null
      or operational_status in ('cancelled', 'part_refunded', 'refunded')
    )
  ),
  constraint ticket_transactions_refunded_timestamp_check
    check ((operational_status = 'refunded') = (refunded_at is not null)),
  constraint ticket_transactions_parent_not_self_check
    check (parent_transaction_id is null or parent_transaction_id <> id),
  constraint ticket_transactions_supersedes_not_self_check
    check (supersedes_transaction_id is null or supersedes_transaction_id <> id),
  constraint ticket_transactions_service_parent_check check (
    (service_type = 'TK' and parent_transaction_id is null)
    or (service_type in ('DC', 'R-ER') and parent_transaction_id is not null)
  ),
  constraint ticket_transactions_idempotency_key_check
    check (idempotency_key is null or length(btrim(idempotency_key)) between 1 and 200),
  constraint ticket_transactions_version_positive_check check (version > 0),
  constraint ticket_transactions_id_booking_unique unique (id, booking_id),
  constraint ticket_transactions_parent_same_booking_fkey
    foreign key (parent_transaction_id, booking_id)
    references public.ticket_transactions(id, booking_id)
    on delete restrict,
  constraint ticket_transactions_supersedes_same_booking_fkey
    foreign key (supersedes_transaction_id, booking_id)
    references public.ticket_transactions(id, booking_id)
    on delete restrict
);

create index if not exists ticket_transactions_booking_created_idx
  on public.ticket_transactions (booking_id, created_at desc);
create index if not exists ticket_transactions_owner_issued_idx
  on public.ticket_transactions (owner_employee_id, issued_at desc)
  where issued_at is not null;
create unique index if not exists ticket_transactions_one_root_tk_idx
  on public.ticket_transactions (booking_id)
  where service_type = 'TK' and parent_transaction_id is null;
create unique index if not exists ticket_transactions_idempotency_idx
  on public.ticket_transactions (acting_employee_id, idempotency_key)
  where idempotency_key is not null;

drop trigger if exists ticket_transactions_advance_version on public.ticket_transactions;
create trigger ticket_transactions_advance_version
  before update on public.ticket_transactions
  for each row execute function public.advance_ticketing_row_version();

create table if not exists public.ticket_passenger_fare_lines (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.ticket_transactions(id) on delete restrict,
  passenger_type text not null,
  quantity integer not null,
  currency text not null default 'GBP',
  unit_supplier_cost_source numeric(14,2),
  unit_supplier_cost_gbp numeric(14,2),
  unit_sale_price_source numeric(14,2),
  unit_sale_price_gbp numeric(14,2),
  supplier_total_source numeric(14,2)
    generated always as (round(quantity * unit_supplier_cost_source, 2)) stored,
  supplier_total_gbp numeric(14,2)
    generated always as (round(quantity * unit_supplier_cost_gbp, 2)) stored,
  sale_total_source numeric(14,2)
    generated always as (round(quantity * unit_sale_price_source, 2)) stored,
  sale_total_gbp numeric(14,2)
    generated always as (round(quantity * unit_sale_price_gbp, 2)) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ticket_passenger_fare_lines_type_check check (passenger_type in ('ADT', 'CHD', 'INF')),
  constraint ticket_passenger_fare_lines_quantity_check check (quantity > 0),
  constraint ticket_passenger_fare_lines_currency_check check (currency ~ '^[A-Z]{3}$'),
  constraint ticket_passenger_fare_lines_money_nonnegative_check check (
    (unit_supplier_cost_source is null or unit_supplier_cost_source >= 0)
    and (unit_supplier_cost_gbp is null or unit_supplier_cost_gbp >= 0)
    and (unit_sale_price_source is null or unit_sale_price_source >= 0)
    and (unit_sale_price_gbp is null or unit_sale_price_gbp >= 0)
  ),
  constraint ticket_passenger_fare_lines_supplier_pair_check
    check (unit_supplier_cost_gbp is null or unit_supplier_cost_source is not null),
  constraint ticket_passenger_fare_lines_sale_pair_check
    check (unit_sale_price_gbp is null or unit_sale_price_source is not null),
  constraint ticket_passenger_fare_lines_gbp_values_check check (
    currency <> 'GBP'
    or (
      (
        (unit_supplier_cost_source is null and unit_supplier_cost_gbp is null)
        or unit_supplier_cost_source = unit_supplier_cost_gbp
      )
      and (
        (unit_sale_price_source is null and unit_sale_price_gbp is null)
        or unit_sale_price_source = unit_sale_price_gbp
      )
    )
  ),
  constraint ticket_passenger_fare_lines_unique_type unique (transaction_id, passenger_type),
  constraint ticket_passenger_fare_lines_id_transaction_unique unique (id, transaction_id)
);

create index if not exists ticket_passenger_fare_lines_transaction_idx
  on public.ticket_passenger_fare_lines (transaction_id);

drop trigger if exists ticket_passenger_fare_lines_updated_at on public.ticket_passenger_fare_lines;
create trigger ticket_passenger_fare_lines_updated_at
  before update on public.ticket_passenger_fare_lines
  for each row execute function public.set_ticketing_updated_at();

create table if not exists public.ticket_passengers (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.ticket_bookings(id) on delete restrict,
  passenger_type text not null,
  full_name text,
  contact_phone text,
  date_of_birth date,
  created_by uuid not null references public.employees(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ticket_passengers_type_check check (passenger_type in ('ADT', 'CHD', 'INF')),
  constraint ticket_passengers_name_check
    check (full_name is null or length(btrim(full_name)) between 1 and 200),
  constraint ticket_passengers_id_booking_unique unique (id, booking_id)
);

create index if not exists ticket_passengers_booking_idx
  on public.ticket_passengers (booking_id, created_at);

drop trigger if exists ticket_passengers_updated_at on public.ticket_passengers;
create trigger ticket_passengers_updated_at
  before update on public.ticket_passengers
  for each row execute function public.set_ticketing_updated_at();

create table if not exists public.ticket_transaction_passengers (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null,
  transaction_id uuid not null,
  passenger_id uuid not null,
  fare_line_id uuid,
  ticket_number text,
  created_at timestamptz not null default now(),
  constraint ticket_transaction_passengers_unique unique (transaction_id, passenger_id),
  constraint ticket_transaction_passengers_ticket_number_check
    check (ticket_number is null or length(btrim(ticket_number)) between 1 and 50),
  constraint ticket_transaction_passengers_transaction_booking_fkey
    foreign key (transaction_id, booking_id)
    references public.ticket_transactions(id, booking_id)
    on delete restrict,
  constraint ticket_transaction_passengers_passenger_booking_fkey
    foreign key (passenger_id, booking_id)
    references public.ticket_passengers(id, booking_id)
    on delete restrict,
  constraint ticket_transaction_passengers_fare_line_transaction_fkey
    foreign key (fare_line_id, transaction_id)
    references public.ticket_passenger_fare_lines(id, transaction_id)
    on delete restrict
);

create index if not exists ticket_transaction_passengers_passenger_idx
  on public.ticket_transaction_passengers (passenger_id, transaction_id);

create or replace function public.protect_allocated_ticket_passenger_type()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.passenger_type is distinct from old.passenger_type
    and exists (
      select 1
      from public.ticket_transaction_passengers allocation
      where allocation.passenger_id = old.id
    )
  then
    raise exception 'Allocated passenger type is immutable; remove or correct the allocation first'
      using errcode = '55000';
  end if;

  return new;
end
$$;

drop trigger if exists ticket_passengers_protect_allocated_type
  on public.ticket_passengers;
create trigger ticket_passengers_protect_allocated_type
  before update of passenger_type on public.ticket_passengers
  for each row execute function public.protect_allocated_ticket_passenger_type();

create or replace function public.validate_ticket_child_currency()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  transaction_currency text;
begin
  select currency
  into transaction_currency
  from public.ticket_transactions
  where id = new.transaction_id;

  if not found or new.currency <> transaction_currency then
    raise exception 'Ticket child currency must match its transaction currency'
      using errcode = '23514';
  end if;

  return new;
end
$$;

drop trigger if exists ticket_passenger_fare_lines_validate_currency
  on public.ticket_passenger_fare_lines;
create trigger ticket_passenger_fare_lines_validate_currency
  before insert or update on public.ticket_passenger_fare_lines
  for each row execute function public.validate_ticket_child_currency();

create or replace function public.validate_ticket_passenger_fare_type()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  allocated_passenger_type text;
  allocated_fare_type text;
begin
  if new.fare_line_id is null then
    return new;
  end if;

  select passenger.passenger_type, fare_line.passenger_type
  into allocated_passenger_type, allocated_fare_type
  from public.ticket_passengers passenger
  cross join public.ticket_passenger_fare_lines fare_line
  where passenger.id = new.passenger_id
    and fare_line.id = new.fare_line_id;

  -- Missing references are rejected by the foreign keys after this trigger.
  if not found then
    return new;
  end if;

  if allocated_passenger_type <> allocated_fare_type then
    raise exception 'Allocated passenger type must match the passenger fare line type'
      using errcode = '23514';
  end if;

  return new;
end
$$;

drop trigger if exists ticket_transaction_passengers_validate_fare_type
  on public.ticket_transaction_passengers;
create trigger ticket_transaction_passengers_validate_fare_type
  before insert or update on public.ticket_transaction_passengers
  for each row execute function public.validate_ticket_passenger_fare_type();

create or replace function public.reconcile_ticket_transaction_before_post()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  fare_quantity integer;
  supplier_source numeric(14,2);
  supplier_gbp numeric(14,2);
  sale_source numeric(14,2);
  sale_gbp numeric(14,2);
begin
  if exists (
    select 1
    from public.ticket_passenger_fare_lines line
    where line.transaction_id = new.id
      and line.currency <> new.currency
  ) then
    raise exception 'Fare-line currency does not match transaction currency'
      using errcode = '23514';
  end if;

  if new.operational_status not in ('issued', 'part_refunded', 'refunded')
    and new.payment_status <> 'paid'
  then
    return new;
  end if;

  select
    coalesce(sum(quantity), 0)::integer,
    case
      when count(*) > 0 and bool_and(unit_supplier_cost_source is not null)
      then sum(supplier_total_source)
    end,
    case
      when count(*) > 0 and bool_and(unit_supplier_cost_gbp is not null)
      then sum(supplier_total_gbp)
    end,
    case
      when count(*) > 0 and bool_and(unit_sale_price_source is not null)
      then sum(sale_total_source)
    end,
    case
      when count(*) > 0 and bool_and(unit_sale_price_gbp is not null)
      then sum(sale_total_gbp)
    end
  into fare_quantity, supplier_source, supplier_gbp, sale_source, sale_gbp
  from public.ticket_passenger_fare_lines
  where transaction_id = new.id;

  if fare_quantity <= 0 or supplier_source is null then
    raise exception 'Issued/paid transactions require passenger fare lines and supplier fares'
      using errcode = '23514';
  end if;

  new.passenger_ticket_count := fare_quantity;
  new.supplier_cost_source := supplier_source;
  new.supplier_cost_gbp := supplier_gbp;
  new.sale_price_source := sale_source;
  new.sale_price_gbp := sale_gbp;

  if new.payment_status = 'paid'
    and (
      supplier_gbp is null
      or sale_source is null
      or sale_gbp is null
      or new.paid_at is null
    )
  then
    raise exception 'Paid transactions require complete source and actual GBP fares'
      using errcode = '23514';
  end if;

  return new;
end
$$;

drop trigger if exists ticket_transactions_reconcile_before_post
  on public.ticket_transactions;
create trigger ticket_transactions_reconcile_before_post
  before insert or update on public.ticket_transactions
  for each row execute function public.reconcile_ticket_transaction_before_post();

create or replace function public.protect_ticket_transaction_history()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Ticket transactions cannot be deleted; archive or append a correction'
      using errcode = '55000';
  end if;

  if old.operational_status in ('issued', 'cancelled', 'part_refunded', 'refunded') then
    if (
      old.operational_status = 'issued'
      and new.operational_status not in ('issued', 'cancelled', 'part_refunded', 'refunded')
    ) or (
      old.operational_status = 'cancelled'
      and new.operational_status <> 'cancelled'
    ) or (
      old.operational_status = 'part_refunded'
      and new.operational_status not in ('part_refunded', 'refunded')
    ) or (
      old.operational_status = 'refunded'
      and new.operational_status <> 'refunded'
    ) then
      raise exception 'Posted ticket lifecycle cannot move backwards'
        using errcode = '55000';
    end if;
  end if;

  if (old.payment_status = 'part_paid' and new.payment_status = 'unpaid')
    or (old.payment_status = 'paid' and new.payment_status <> 'paid')
  then
    raise exception 'Ticket payment status cannot move backwards'
      using errcode = '55000';
  end if;

  if old.operational_status in ('issued', 'cancelled', 'part_refunded', 'refunded')
    and row(
      new.booking_id,
      new.parent_transaction_id,
      new.supersedes_transaction_id,
      new.service_type,
      new.owner_employee_id,
      new.acting_employee_id,
      new.booking_date,
      new.time_limit_at,
      new.time_limit_timezone,
      new.issued_at,
      new.passenger_ticket_count,
      new.currency,
      new.supplier_cost_source,
      new.supplier_cost_gbp,
      new.sale_price_source,
      new.sale_price_gbp,
      new.idempotency_key
    ) is distinct from row(
      old.booking_id,
      old.parent_transaction_id,
      old.supersedes_transaction_id,
      old.service_type,
      old.owner_employee_id,
      old.acting_employee_id,
      old.booking_date,
      old.time_limit_at,
      old.time_limit_timezone,
      old.issued_at,
      old.passenger_ticket_count,
      old.currency,
      old.supplier_cost_source,
      old.supplier_cost_gbp,
      old.sale_price_source,
      old.sale_price_gbp,
      old.idempotency_key
    )
  then
    raise exception 'Posted ticket identity and financial facts are immutable; append a correction'
      using errcode = '55000';
  end if;

  if (old.paid_at is not null and new.paid_at is distinct from old.paid_at)
    or (old.cancelled_at is not null and new.cancelled_at is distinct from old.cancelled_at)
    or (old.refunded_at is not null and new.refunded_at is distinct from old.refunded_at)
  then
    raise exception 'Posted ticket lifecycle timestamps are immutable; append a correction'
      using errcode = '55000';
  end if;

  return new;
end
$$;

drop trigger if exists ticket_transactions_protect_history
  on public.ticket_transactions;
create trigger ticket_transactions_protect_history
  before update or delete on public.ticket_transactions
  for each row execute function public.protect_ticket_transaction_history();

create or replace function public.protect_posted_ticket_fare_lines()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  transaction_status text;
  transaction_payment_status text;
begin
  if tg_op = 'UPDATE' and new.transaction_id is distinct from old.transaction_id then
    raise exception 'Passenger fare lines cannot move between transactions'
      using errcode = '55000';
  end if;

  if tg_op = 'UPDATE'
    and new.passenger_type is distinct from old.passenger_type
    and exists (
      select 1
      from public.ticket_transaction_passengers allocation
      where allocation.fare_line_id = old.id
    )
  then
    raise exception 'Allocated passenger fare type is immutable; correct the allocation first'
      using errcode = '55000';
  end if;

  select operational_status, payment_status
  into transaction_status, transaction_payment_status
  from public.ticket_transactions
  where id = case when tg_op = 'INSERT' then new.transaction_id else old.transaction_id end;

  if transaction_status in ('issued', 'cancelled', 'part_refunded', 'refunded')
    or transaction_payment_status = 'paid'
  then
    if tg_op = 'UPDATE'
      and transaction_payment_status <> 'paid'
      and row(
        new.transaction_id,
        new.passenger_type,
        new.quantity,
        new.currency,
        new.unit_supplier_cost_source
      ) is not distinct from row(
        old.transaction_id,
        old.passenger_type,
        old.quantity,
        old.currency,
        old.unit_supplier_cost_source
      )
      and (old.unit_sale_price_source is null or new.unit_sale_price_source = old.unit_sale_price_source)
      and (old.unit_supplier_cost_gbp is null or new.unit_supplier_cost_gbp = old.unit_supplier_cost_gbp)
      and (old.unit_sale_price_gbp is null or new.unit_sale_price_gbp = old.unit_sale_price_gbp)
    then
      return new;
    end if;

    raise exception 'Posted passenger fare lines are immutable; create a correction transaction'
      using errcode = '55000';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end
$$;

drop trigger if exists ticket_passenger_fare_lines_protect_posted
  on public.ticket_passenger_fare_lines;
create trigger ticket_passenger_fare_lines_protect_posted
  before insert or update or delete on public.ticket_passenger_fare_lines
  for each row execute function public.protect_posted_ticket_fare_lines();

create table if not exists public.ticket_itinerary_sectors (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.ticket_bookings(id) on delete restrict,
  source_transaction_id uuid,
  sequence_number integer not null,
  airline_id uuid references public.airlines(id) on delete restrict,
  flight_number text,
  origin_airport_code text not null,
  destination_airport_code text not null,
  departure_local timestamp without time zone not null,
  departure_timezone text not null,
  departure_at_utc timestamptz not null,
  arrival_local timestamp without time zone,
  arrival_timezone text,
  arrival_at_utc timestamptz,
  schedule_status text not null default 'on_schedule',
  is_active boolean not null default true,
  created_by uuid not null references public.employees(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ticket_itinerary_sectors_sequence_check check (sequence_number > 0),
  constraint ticket_itinerary_sectors_origin_check check (origin_airport_code ~ '^[A-Z]{3}$'),
  constraint ticket_itinerary_sectors_destination_check check (destination_airport_code ~ '^[A-Z]{3}$'),
  constraint ticket_itinerary_sectors_route_check check (origin_airport_code <> destination_airport_code),
  constraint ticket_itinerary_sectors_departure_timezone_check
    check (public.is_valid_iana_timezone(departure_timezone)),
  constraint ticket_itinerary_sectors_arrival_fields_check check (
    (arrival_local is null and arrival_timezone is null and arrival_at_utc is null)
    or (
      arrival_local is not null
      and arrival_timezone is not null
      and arrival_at_utc is not null
      and public.is_valid_iana_timezone(arrival_timezone)
      and arrival_at_utc >= departure_at_utc
    )
  ),
  constraint ticket_itinerary_sectors_schedule_status_check
    check (schedule_status in ('on_schedule', 'change_marked', 'awaiting_finalisation')),
  constraint ticket_itinerary_sectors_transaction_booking_fkey
    foreign key (source_transaction_id, booking_id)
    references public.ticket_transactions(id, booking_id)
    on delete restrict
);

create unique index if not exists ticket_itinerary_sectors_active_sequence_idx
  on public.ticket_itinerary_sectors (booking_id, sequence_number)
  where is_active;
create index if not exists ticket_itinerary_sectors_upcoming_idx
  on public.ticket_itinerary_sectors (departure_at_utc)
  where is_active;

drop trigger if exists ticket_itinerary_sectors_updated_at on public.ticket_itinerary_sectors;
create trigger ticket_itinerary_sectors_updated_at
  before update on public.ticket_itinerary_sectors
  for each row execute function public.set_ticketing_updated_at();

create table if not exists public.ticket_schedule_events (
  id uuid primary key default gen_random_uuid(),
  sector_id uuid not null references public.ticket_itinerary_sectors(id) on delete restrict,
  event_type text not null,
  previous_schedule jsonb not null default '{}'::jsonb,
  proposed_schedule jsonb not null default '{}'::jsonb,
  actor_employee_id uuid not null references public.employees(id) on delete restrict,
  reviewed_by uuid references public.employees(id) on delete restrict,
  review_reason text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  constraint ticket_schedule_events_type_check
    check (event_type in ('marked', 'reviewed', 'finalised', 'dismissed')),
  constraint ticket_schedule_events_previous_object_check
    check (jsonb_typeof(previous_schedule) = 'object'),
  constraint ticket_schedule_events_proposed_object_check
    check (jsonb_typeof(proposed_schedule) = 'object')
);

create index if not exists ticket_schedule_events_sector_created_idx
  on public.ticket_schedule_events (sector_id, created_at desc);

create table if not exists public.ticket_package_links (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.ticket_bookings(id) on delete restrict,
  package_id uuid references public.travel_packages(id) on delete set null,
  reservation_id uuid,
  group_id uuid references public.travel_package_groups(id) on delete set null,
  match_status text not null,
  resolution_method text not null default 'automatic',
  matched_pnr text not null,
  package_reference_snapshot text,
  package_type_snapshot text,
  resolved_by uuid references public.employees(id) on delete restrict,
  resolution_reason text,
  detected_at timestamptz not null default now(),
  retired_at timestamptz,
  constraint ticket_package_links_match_status_check
    check (match_status in ('matched', 'ambiguous', 'retired')),
  constraint ticket_package_links_resolution_method_check
    check (resolution_method in ('automatic', 'manual')),
  constraint ticket_package_links_pnr_check
    check (public.normalize_ticket_pnr_v1(matched_pnr) is not null),
  constraint ticket_package_links_active_evidence_check check (
    match_status = 'retired'
    or (
      package_id is not null
      and reservation_id is not null
      and package_reference_snapshot is not null
      and package_type_snapshot in ('umrah', 'holiday', 'ziyarat')
    )
  ),
  constraint ticket_package_links_retired_at_check check (
    (match_status = 'retired' and retired_at is not null)
    or (match_status in ('matched', 'ambiguous') and retired_at is null)
  ),
  constraint ticket_package_links_reference_snapshot_check check (
    package_reference_snapshot is null
    or length(btrim(package_reference_snapshot)) between 1 and 100
  ),
  constraint ticket_package_links_type_snapshot_check check (
    package_type_snapshot is null
    or package_type_snapshot in ('umrah', 'holiday', 'ziyarat')
  ),
  constraint ticket_package_links_manual_resolution_check check (
    resolution_method <> 'manual'
    or (
      resolved_by is not null
      and resolution_reason is not null
      and length(btrim(resolution_reason)) between 1 and 500
    )
  ),
  constraint ticket_package_links_reservation_package_fkey
    foreign key (reservation_id, package_id)
    references public.travel_package_reservations(id, package_id)
    on delete set null
);

create index if not exists ticket_package_links_booking_idx
  on public.ticket_package_links (booking_id, detected_at desc);
create unique index if not exists ticket_package_links_active_reservation_idx
  on public.ticket_package_links (booking_id, reservation_id)
  where retired_at is null and reservation_id is not null;
create unique index if not exists ticket_package_links_one_active_match_idx
  on public.ticket_package_links (booking_id)
  where retired_at is null and match_status = 'matched';

create or replace function public.validate_ticket_package_link_evidence()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  booking_pnr text;
  reservation_pnr text;
  reservation_kind text;
  reservation_status text;
  package_reference_value text;
  package_type_value text;
  package_status_value text;
begin
  if tg_op = 'UPDATE' and new.booking_id is distinct from old.booking_id then
    raise exception 'Ticket package links cannot move between bookings'
      using errcode = '55000';
  end if;

  if tg_op = 'INSERT' and new.match_status = 'retired' then
    raise exception 'Ticket package links must be active when first recorded'
      using errcode = '23514';
  end if;

  if new.match_status = 'retired' then
    new.retired_at := coalesce(new.retired_at, now());
    return new;
  end if;

  select
    booking.normalized_pnr,
    reservation.normalized_booking_reference,
    reservation.reservation_type,
    reservation.status,
    package.package_reference,
    lower(btrim(package.package_type)),
    lower(btrim(package.status))
  into
    booking_pnr,
    reservation_pnr,
    reservation_kind,
    reservation_status,
    package_reference_value,
    package_type_value,
    package_status_value
  from public.ticket_bookings booking
  join public.travel_packages package on package.id = new.package_id
  join public.travel_package_reservations reservation
    on reservation.id = new.reservation_id
    and reservation.package_id = package.id
  where booking.id = new.booking_id;

  if not found
    or reservation_kind is distinct from 'flight'
    or reservation_status is null
    or lower(btrim(reservation_status)) in ('cancelled', 'failed')
    or reservation_pnr is null
    or reservation_pnr <> booking_pnr
    or package_type_value is null
    or package_type_value not in ('umrah', 'holiday', 'ziyarat')
    or package_status_value is null
    or package_status_value in ('cancelled', 'archived')
  then
    raise exception 'Active package scope requires a supported package flight with the same PNR'
      using errcode = '23514';
  end if;

  new.matched_pnr := booking_pnr;
  new.package_reference_snapshot := package_reference_value;
  new.package_type_snapshot := package_type_value;
  new.retired_at := null;

  return new;
end
$$;

drop trigger if exists ticket_package_links_validate_evidence
  on public.ticket_package_links;
create trigger ticket_package_links_validate_evidence
  before insert or update on public.ticket_package_links
  for each row execute function public.validate_ticket_package_link_evidence();

create or replace function public.validate_ticket_booking_package_scope()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  booking_id_value uuid;
  match_status_value text;
  commission_scope_value text;
  matched_link_count integer;
  automatic_match_count integer;
  manual_match_count integer;
  ambiguous_link_count integer;
begin
  if tg_table_name = 'ticket_bookings' then
    booking_id_value := case when tg_op = 'DELETE' then old.id else new.id end;
  else
    booking_id_value := case when tg_op = 'DELETE' then old.booking_id else new.booking_id end;
  end if;

  select booking.package_match_status, booking.commission_scope
  into match_status_value, commission_scope_value
  from public.ticket_bookings booking
  where booking.id = booking_id_value;

  if not found then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  select
    count(*) filter (where link.match_status = 'matched'),
    count(*) filter (
      where link.match_status = 'matched' and link.resolution_method = 'automatic'
    ),
    count(*) filter (
      where link.match_status = 'matched' and link.resolution_method = 'manual'
    ),
    count(*) filter (where link.match_status = 'ambiguous')
  into
    matched_link_count,
    automatic_match_count,
    manual_match_count,
    ambiguous_link_count
  from public.ticket_package_links link
  where link.booking_id = booking_id_value
    and link.retired_at is null;

  if match_status_value = 'unmatched'
    and (
      commission_scope_value <> 'ticket'
      or matched_link_count <> 0
      or ambiguous_link_count <> 0
    )
  then
    raise exception 'Unmatched Ticketing bookings cannot retain active package evidence'
      using errcode = '23514';
  elsif match_status_value = 'matched'
    and (
      commission_scope_value <> 'package'
      or matched_link_count <> 1
      or automatic_match_count <> 1
      or ambiguous_link_count <> 0
    )
  then
    raise exception 'Matched Ticketing bookings require one automatic package-flight link'
      using errcode = '23514';
  elsif match_status_value = 'manually_resolved'
    and (
      commission_scope_value <> 'package'
      or matched_link_count <> 1
      or manual_match_count <> 1
      or ambiguous_link_count <> 0
    )
  then
    raise exception 'Manually resolved Ticketing bookings require one manual package-flight link'
      using errcode = '23514';
  elsif match_status_value = 'ambiguous'
    and (
      commission_scope_value <> 'unresolved'
      or matched_link_count <> 0
      or ambiguous_link_count < 2
    )
  then
    raise exception 'Ambiguous Ticketing bookings require at least two package-flight candidates'
      using errcode = '23514';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end
$$;

drop trigger if exists ticket_bookings_validate_package_scope
  on public.ticket_bookings;
create constraint trigger ticket_bookings_validate_package_scope
  after insert or update on public.ticket_bookings
  deferrable initially deferred
  for each row execute function public.validate_ticket_booking_package_scope();

drop trigger if exists ticket_package_links_validate_booking_scope
  on public.ticket_package_links;
create constraint trigger ticket_package_links_validate_booking_scope
  after insert or update or delete on public.ticket_package_links
  deferrable initially deferred
  for each row execute function public.validate_ticket_booking_package_scope();

create or replace function public.protect_ticket_booking_package_pnr()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if public.normalize_ticket_pnr_v1(new.pnr)
      is distinct from public.normalize_ticket_pnr_v1(old.pnr)
    and exists (
      select 1
      from public.ticket_package_links link
      where link.booking_id = old.id
        and link.retired_at is null
    )
  then
    raise exception 'Retire and reconcile active package links before changing the booking PNR'
      using errcode = '55000';
  end if;

  return new;
end
$$;

drop trigger if exists ticket_bookings_protect_package_pnr
  on public.ticket_bookings;
create trigger ticket_bookings_protect_package_pnr
  before update of pnr on public.ticket_bookings
  for each row execute function public.protect_ticket_booking_package_pnr();

create or replace function public.protect_linked_ticket_package_reservation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if exists (
    select 1
    from public.ticket_package_links link
    where link.reservation_id = old.id
      and link.retired_at is null
  ) and (
    tg_op = 'DELETE'
    or new.package_id is distinct from old.package_id
    or new.reservation_type is distinct from old.reservation_type
    or public.normalize_ticket_pnr_v1(new.booking_reference)
      is distinct from public.normalize_ticket_pnr_v1(old.booking_reference)
    or (
      lower(btrim(new.status)) in ('cancelled', 'failed')
      and lower(btrim(old.status)) not in ('cancelled', 'failed')
    )
  ) then
    raise exception 'Retire and reconcile active Ticketing links before changing package flight evidence'
      using errcode = '55000';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end
$$;

drop trigger if exists travel_package_reservations_protect_ticket_links
  on public.travel_package_reservations;
create trigger travel_package_reservations_protect_ticket_links
  before update of package_id, reservation_type, booking_reference, status
    or delete on public.travel_package_reservations
  for each row execute function public.protect_linked_ticket_package_reservation();

create or replace function public.protect_linked_ticket_package()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if exists (
    select 1
    from public.ticket_package_links link
    where link.package_id = old.id
      and link.retired_at is null
  ) and (
    tg_op = 'DELETE'
    or new.package_reference is distinct from old.package_reference
    or lower(btrim(new.package_type)) is distinct from lower(btrim(old.package_type))
    or (
      lower(btrim(new.status)) in ('cancelled', 'archived')
      and lower(btrim(old.status)) not in ('cancelled', 'archived')
    )
  ) then
    raise exception 'Retire and reconcile active Ticketing links before changing package evidence'
      using errcode = '55000';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end
$$;

drop trigger if exists travel_packages_protect_ticket_links
  on public.travel_packages;
create trigger travel_packages_protect_ticket_links
  before update of package_reference, package_type, status or delete on public.travel_packages
  for each row execute function public.protect_linked_ticket_package();

create table if not exists public.ticket_idempotency_keys (
  id uuid primary key default gen_random_uuid(),
  action_name text not null,
  actor_employee_id uuid not null references public.employees(id) on delete restrict,
  idempotency_key text not null,
  request_payload jsonb not null,
  response_payload jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint ticket_idempotency_keys_action_check
    check (length(btrim(action_name)) between 1 and 100),
  constraint ticket_idempotency_keys_key_check
    check (length(btrim(idempotency_key)) between 1 and 200),
  constraint ticket_idempotency_keys_request_object_check
    check (jsonb_typeof(request_payload) = 'object'),
  constraint ticket_idempotency_keys_response_object_check
    check (response_payload is null or jsonb_typeof(response_payload) = 'object'),
  constraint ticket_idempotency_keys_unique unique (action_name, actor_employee_id, idempotency_key)
);

create index if not exists ticket_idempotency_keys_created_idx
  on public.ticket_idempotency_keys (created_at desc);

create table if not exists public.ticket_audit_events (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id uuid not null,
  booking_id uuid references public.ticket_bookings(id) on delete restrict,
  transaction_id uuid references public.ticket_transactions(id) on delete restrict,
  action text not null,
  actor_employee_id uuid not null references public.employees(id) on delete restrict,
  reason text,
  before_state jsonb,
  after_state jsonb,
  created_at timestamptz not null default now(),
  constraint ticket_audit_events_entity_type_check
    check (entity_type in (
      'booking', 'transaction', 'passenger', 'sector', 'package_link', 'legacy_migration'
    )),
  constraint ticket_audit_events_action_check
    check (length(btrim(action)) between 1 and 100),
  constraint ticket_audit_events_before_object_check
    check (before_state is null or jsonb_typeof(before_state) = 'object'),
  constraint ticket_audit_events_after_object_check
    check (after_state is null or jsonb_typeof(after_state) = 'object')
);

create index if not exists ticket_audit_events_entity_created_idx
  on public.ticket_audit_events (entity_type, entity_id, created_at desc);
create index if not exists ticket_audit_events_booking_created_idx
  on public.ticket_audit_events (booking_id, created_at desc)
  where booking_id is not null;

create table if not exists public.ticket_notification_events (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id uuid not null,
  booking_id uuid references public.ticket_bookings(id) on delete restrict,
  notification_type text not null,
  threshold_key text not null,
  recipient_employee_id uuid not null references public.employees(id) on delete restrict,
  scheduled_for timestamptz not null,
  delivery_status text not null default 'pending',
  delivered_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  constraint ticket_notification_events_entity_type_check
    check (entity_type in ('booking', 'voucher')),
  constraint ticket_notification_events_booking_entity_check
    check (entity_type <> 'booking' or booking_id = entity_id),
  constraint ticket_notification_events_type_check
    check (notification_type in ('time_limit', 'voucher_claim')),
  constraint ticket_notification_events_delivery_status_check
    check (delivery_status in ('pending', 'sent', 'failed', 'cancelled')),
  constraint ticket_notification_events_unique
    unique (entity_type, entity_id, notification_type, threshold_key, recipient_employee_id)
);

create index if not exists ticket_notification_events_pending_idx
  on public.ticket_notification_events (scheduled_for)
  where delivery_status in ('pending', 'failed');

-- Commission owns this ingestion boundary. Ticketing writes variables only;
-- no calculated earnings or profit columns exist in Ticketing tables.
create table if not exists public.commission_source_events (
  id uuid primary key default gen_random_uuid(),
  source_module text not null,
  source_event_id uuid not null,
  source_fact_key text not null,
  source_record_id uuid not null,
  event_type text not null,
  contract_version integer not null default 1,
  event_version integer not null default 1,
  supersedes_event_id uuid references public.commission_source_events(id) on delete restrict,
  employee_id uuid not null references public.employees(id) on delete restrict,
  owner_employee_id uuid references public.employees(id) on delete restrict,
  location_id uuid references public.locations(id) on delete restrict,
  occurred_at timestamptz not null,
  effective_on date not null,
  source_path text not null,
  variables jsonb not null,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  constraint commission_source_events_source_module_check
    check (length(btrim(source_module)) between 1 and 50),
  constraint commission_source_events_fact_key_check
    check (length(btrim(source_fact_key)) between 1 and 200),
  constraint commission_source_events_event_type_check
    check (length(btrim(event_type)) between 1 and 100),
  constraint commission_source_events_contract_version_check check (contract_version > 0),
  constraint commission_source_events_event_version_check check (event_version > 0),
  constraint commission_source_events_source_path_check
    check (source_path ~ '^/' and source_path !~ '^//'),
  constraint commission_source_events_variables_object_check
    check (jsonb_typeof(variables) = 'object'),
  constraint commission_source_events_idempotency_key_check
    check (length(btrim(idempotency_key)) between 1 and 200),
  constraint commission_source_events_unique_fact_version
    unique (source_module, source_fact_key, event_version),
  constraint commission_source_events_unique_idempotency
    unique (source_module, idempotency_key),
  constraint commission_source_events_unique_event_identity
    unique (source_module, source_event_id),
  constraint commission_source_events_supersedes_not_self_check
    check (supersedes_event_id is null or supersedes_event_id <> id)
);

comment on table public.commission_source_events is
  'Commission-owned immutable source variables. Producers must not store calculated earnings here.';

create index if not exists commission_source_events_employee_effective_idx
  on public.commission_source_events (employee_id, effective_on desc, created_at desc);
create index if not exists commission_source_events_record_idx
  on public.commission_source_events (source_module, source_record_id, created_at desc);

create table if not exists public.commission_source_event_states (
  event_id uuid primary key references public.commission_source_events(id) on delete cascade,
  processing_status text not null default 'pending',
  attempt_count integer not null default 0,
  next_attempt_at timestamptz,
  last_error text,
  updated_at timestamptz not null default now(),
  constraint commission_source_event_states_status_check
    check (processing_status in ('pending', 'processing', 'processed', 'held', 'rejected')),
  constraint commission_source_event_states_attempt_count_check check (attempt_count >= 0)
);

create index if not exists commission_source_event_states_pending_idx
  on public.commission_source_event_states (processing_status, next_attempt_at)
  where processing_status in ('pending', 'held');

create or replace function public.validate_commission_source_event_lineage()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  previous_event public.commission_source_events%rowtype;
begin
  if new.event_version = 1 then
    if new.supersedes_event_id is not null then
      raise exception 'Version 1 source events cannot supersede another event'
        using errcode = '23514';
    end if;
    return new;
  end if;

  if new.supersedes_event_id is null then
    raise exception 'Corrected source events must identify the event they supersede'
      using errcode = '23514';
  end if;

  select *
  into previous_event
  from public.commission_source_events
  where id = new.supersedes_event_id;

  if not found
    or previous_event.source_module <> new.source_module
    or previous_event.source_fact_key <> new.source_fact_key
    or previous_event.event_version <> new.event_version - 1
  then
    raise exception 'Invalid Commission source-event correction lineage'
      using errcode = '23514';
  end if;

  return new;
end
$$;

create or replace function public.create_commission_source_event_state()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  insert into public.commission_source_event_states (event_id)
  values (new.id);
  return new;
end
$$;

drop trigger if exists commission_source_events_validate_lineage
  on public.commission_source_events;
create trigger commission_source_events_validate_lineage
  before insert on public.commission_source_events
  for each row execute function public.validate_commission_source_event_lineage();

drop trigger if exists commission_source_events_create_state
  on public.commission_source_events;
create trigger commission_source_events_create_state
  after insert on public.commission_source_events
  for each row execute function public.create_commission_source_event_state();

drop trigger if exists commission_source_event_states_updated_at
  on public.commission_source_event_states;
create trigger commission_source_event_states_updated_at
  before update on public.commission_source_event_states
  for each row execute function public.set_ticketing_updated_at();

create or replace function public.reject_commission_source_event_state_delete()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception 'Commission source-event processing states cannot be deleted'
    using errcode = '55000';
end
$$;

drop trigger if exists commission_source_event_states_protect_delete
  on public.commission_source_event_states;
create trigger commission_source_event_states_protect_delete
  before delete on public.commission_source_event_states
  for each row execute function public.reject_commission_source_event_state_delete();

drop trigger if exists commission_source_events_immutable
  on public.commission_source_events;
create trigger commission_source_events_immutable
  before update or delete on public.commission_source_events
  for each row execute function public.reject_immutable_event_mutation();

drop trigger if exists ticket_audit_events_immutable
  on public.ticket_audit_events;
create trigger ticket_audit_events_immutable
  before update or delete on public.ticket_audit_events
  for each row execute function public.reject_immutable_event_mutation();

drop trigger if exists ticket_schedule_events_immutable
  on public.ticket_schedule_events;
create trigger ticket_schedule_events_immutable
  before update or delete on public.ticket_schedule_events
  for each row execute function public.reject_immutable_event_mutation();

create or replace function public.append_commission_source_event(p_event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
set row_security = off
as $$
declare
  expected_keys constant text[] := array[
    'source_module',
    'source_event_id',
    'source_fact_key',
    'source_record_id',
    'event_type',
    'contract_version',
    'event_version',
    'supersedes_event_id',
    'employee_id',
    'owner_employee_id',
    'location_id',
    'occurred_at',
    'effective_on',
    'source_path',
    'variables',
    'idempotency_key'
  ];
  unknown_key text;
  existing_event public.commission_source_events%rowtype;
  source_module_value text;
  source_event_id_value uuid;
  source_fact_key_value text;
  source_record_id_value uuid;
  event_type_value text;
  contract_version_value integer;
  event_version_value integer;
  supersedes_source_event_id_value uuid;
  supersedes_event_row_id uuid;
  employee_id_value uuid;
  owner_employee_id_value uuid;
  location_id_value uuid;
  occurred_at_value timestamptz;
  effective_on_value date;
  source_path_value text;
  variables_value jsonb;
  idempotency_key_value text;
begin
  if p_event is null or jsonb_typeof(p_event) is distinct from 'object' then
    raise exception 'Commission source event must be a JSON object'
      using errcode = '22023';
  end if;

  select supplied.key
  into unknown_key
  from jsonb_object_keys(p_event) as supplied(key)
  where supplied.key <> all (expected_keys)
  limit 1;

  if found then
    raise exception 'Unknown Commission source-event field: %', unknown_key
      using errcode = '22023';
  end if;

  if not p_event ?& expected_keys then
    raise exception 'Commission source event is missing one or more required fields'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from unnest(array[
      'source_module',
      'source_event_id',
      'source_fact_key',
      'source_record_id',
      'event_type',
      'employee_id',
      'occurred_at',
      'effective_on',
      'source_path',
      'idempotency_key'
    ]) as required_string(key_name)
    where jsonb_typeof(p_event -> key_name) is distinct from 'string'
  ) or exists (
    select 1
    from unnest(array['contract_version', 'event_version']) as required_number(key_name)
    where jsonb_typeof(p_event -> key_name) is distinct from 'number'
  ) or exists (
    select 1
    from unnest(array[
      'supersedes_event_id',
      'owner_employee_id',
      'location_id'
    ]) as nullable_uuid(key_name)
    where not (jsonb_typeof(p_event -> key_name) in ('string', 'null'))
  ) or jsonb_typeof(p_event -> 'variables') is distinct from 'object'
  then
    raise exception 'Commission source event contains invalid value types'
      using errcode = '22023';
  end if;

  begin
    source_module_value := lower(btrim(p_event ->> 'source_module'));
    source_event_id_value := (p_event ->> 'source_event_id')::uuid;
    source_fact_key_value := btrim(p_event ->> 'source_fact_key');
    source_record_id_value := (p_event ->> 'source_record_id')::uuid;
    event_type_value := btrim(p_event ->> 'event_type');
    contract_version_value := (p_event ->> 'contract_version')::integer;
    event_version_value := (p_event ->> 'event_version')::integer;
    supersedes_source_event_id_value := (p_event ->> 'supersedes_event_id')::uuid;
    employee_id_value := (p_event ->> 'employee_id')::uuid;
    owner_employee_id_value := (p_event ->> 'owner_employee_id')::uuid;
    location_id_value := (p_event ->> 'location_id')::uuid;
    occurred_at_value := (p_event ->> 'occurred_at')::timestamptz;
    effective_on_value := (p_event ->> 'effective_on')::date;
    source_path_value := btrim(p_event ->> 'source_path');
    variables_value := p_event -> 'variables';
    idempotency_key_value := btrim(p_event ->> 'idempotency_key');
  exception
    when invalid_text_representation
      or invalid_datetime_format
      or datetime_field_overflow
      or numeric_value_out_of_range
    then
      raise exception 'Commission source event contains invalid typed values'
        using errcode = '22023';
  end;

  if length(source_module_value) not between 1 and 50
    or length(source_fact_key_value) not between 1 and 200
    or length(event_type_value) not between 1 and 100
    or length(idempotency_key_value) not between 1 and 200
    or source_path_value !~ '^/'
    or source_path_value ~ '^//'
    or contract_version_value <> 1
    or event_version_value < 1
  then
    raise exception 'Commission source event contains invalid contract values'
      using errcode = '22023';
  end if;

  if (event_version_value = 1 and supersedes_source_event_id_value is not null)
    or (event_version_value > 1 and supersedes_source_event_id_value is null)
  then
    raise exception 'Commission source event has invalid correction lineage'
      using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'commission-source-event:'
        || length(source_module_value)::text
        || ':'
        || source_module_value
        || ':'
        || idempotency_key_value,
      0
    )
  );

  if supersedes_source_event_id_value is not null then
    select id
    into supersedes_event_row_id
    from public.commission_source_events
    where source_module = source_module_value
      and source_event_id = supersedes_source_event_id_value;

    if not found then
      raise exception 'Superseded Commission source event does not exist'
        using errcode = '22023';
    end if;
  end if;

  select *
  into existing_event
  from public.commission_source_events
  where source_module = source_module_value
    and idempotency_key = idempotency_key_value;

  if found then
    if row(
      existing_event.source_module,
      existing_event.source_event_id,
      existing_event.source_fact_key,
      existing_event.source_record_id,
      existing_event.event_type,
      existing_event.contract_version,
      existing_event.event_version,
      existing_event.supersedes_event_id,
      existing_event.employee_id,
      existing_event.owner_employee_id,
      existing_event.location_id,
      existing_event.occurred_at,
      existing_event.effective_on,
      existing_event.source_path,
      existing_event.variables,
      existing_event.idempotency_key
    ) is not distinct from row(
      source_module_value,
      source_event_id_value,
      source_fact_key_value,
      source_record_id_value,
      event_type_value,
      contract_version_value,
      event_version_value,
      supersedes_event_row_id,
      employee_id_value,
      owner_employee_id_value,
      location_id_value,
      occurred_at_value,
      effective_on_value,
      source_path_value,
      variables_value,
      idempotency_key_value
    ) then
      return jsonb_build_object(
        'id', existing_event.id,
        'sourceEventId', existing_event.source_event_id,
        'eventVersion', existing_event.event_version,
        'idempotentReplay', true
      );
    end if;

    raise exception 'Commission source-event idempotency key was reused with a different payload'
      using errcode = '22023';
  end if;

  insert into public.commission_source_events (
    source_module,
    source_event_id,
    source_fact_key,
    source_record_id,
    event_type,
    contract_version,
    event_version,
    supersedes_event_id,
    employee_id,
    owner_employee_id,
    location_id,
    occurred_at,
    effective_on,
    source_path,
    variables,
    idempotency_key
  ) values (
    source_module_value,
    source_event_id_value,
    source_fact_key_value,
    source_record_id_value,
    event_type_value,
    contract_version_value,
    event_version_value,
    supersedes_event_row_id,
    employee_id_value,
    owner_employee_id_value,
    location_id_value,
    occurred_at_value,
    effective_on_value,
    source_path_value,
    variables_value,
    idempotency_key_value
  )
  returning * into existing_event;

  return jsonb_build_object(
    'id', existing_event.id,
    'sourceEventId', existing_event.source_event_id,
    'eventVersion', existing_event.event_version,
    'idempotentReplay', false
  );
end
$$;

comment on function public.append_commission_source_event(jsonb) is
  'Strict retry-safe ingestion boundary for immutable Commission source variables.';

create table if not exists public.ticket_legacy_migration_map (
  legacy_ticket_ledger_id uuid primary key references public.ticket_ledger(id) on delete restrict,
  booking_id uuid references public.ticket_bookings(id) on delete restrict,
  transaction_id uuid references public.ticket_transactions(id) on delete restrict,
  migration_status text not null default 'needs_review',
  review_reason text not null,
  legacy_payload jsonb not null,
  reviewed_by uuid references public.employees(id) on delete restrict,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint ticket_legacy_migration_map_status_check
    check (migration_status in ('needs_review', 'migrated', 'ignored')),
  constraint ticket_legacy_migration_map_payload_object_check
    check (jsonb_typeof(legacy_payload) = 'object')
);

insert into public.ticket_legacy_migration_map (
  legacy_ticket_ledger_id,
  migration_status,
  review_reason,
  legacy_payload
)
select
  legacy.id,
  'needs_review',
  'Legacy rows lack a reliable ADT/CHD/INF split and require reviewed mapping.',
  to_jsonb(legacy)
from public.ticket_ledger legacy
on conflict (legacy_ticket_ledger_id) do nothing;

comment on table public.ticket_ledger is
  'Deprecated read-only Ticketing ledger. New writes use ticket_bookings and ticket_transactions.';

-- Sensitive tables are server-route-only. Staff APIs authenticate first, then
-- use the service role after enforcing own/team access in application code.
do $$
declare
  table_name text;
  policy_row record;
begin
  foreach table_name in array array[
    'ticket_bookings',
    'ticket_transactions',
    'ticket_passenger_fare_lines',
    'ticket_passengers',
    'ticket_transaction_passengers',
    'ticket_itinerary_sectors',
    'ticket_schedule_events',
    'ticket_package_links',
    'ticket_idempotency_keys',
    'ticket_audit_events',
    'ticket_notification_events',
    'ticket_legacy_migration_map',
    'commission_source_events',
    'commission_source_event_states',
    'commission_rules',
    'commission_rate_components',
    'commission_tiers',
    'employee_commission_assignments'
  ]
  loop
    execute format('alter table public.%I enable row level security', table_name);

    for policy_row in
      select policyname
      from pg_policies
      where schemaname = 'public' and tablename = table_name
    loop
      execute format('drop policy if exists %I on public.%I', policy_row.policyname, table_name);
    end loop;

    execute format('revoke all on table public.%I from public, anon, authenticated', table_name);
    execute format(
      'create policy %I on public.%I for all to service_role using (true) with check (true)',
      'Service role manages ' || table_name,
      table_name
    );
    execute format(
      'grant select, insert, update, delete on table public.%I to service_role',
      table_name
    );
  end loop;
end
$$;

-- Business fact and audit rows are append-only. Mutable processing state is
-- kept in separate tables such as commission_source_event_states.
do $$
declare
  table_name text;
  policy_row record;
begin
  foreach table_name in array array[
    'ticket_schedule_events',
    'ticket_audit_events'
  ]
  loop
    for policy_row in
      select policyname
      from pg_policies
      where schemaname = 'public' and tablename = table_name
    loop
      execute format('drop policy if exists %I on public.%I', policy_row.policyname, table_name);
    end loop;

    execute format('revoke all on table public.%I from service_role', table_name);
    execute format('grant select, insert on table public.%I to service_role', table_name);
    execute format(
      'create policy %I on public.%I for select to service_role using (true)',
      'Service role reads ' || table_name,
      table_name
    );
    execute format(
      'create policy %I on public.%I for insert to service_role with check (true)',
      'Service role appends ' || table_name,
      table_name
    );
  end loop;
end
$$;

-- Commission source facts may only be appended through the strict retry-safe
-- function. The service role can read facts but cannot bypass payload checks.
drop policy if exists "Service role manages commission_source_events"
  on public.commission_source_events;
revoke all on table public.commission_source_events from service_role;
grant select on table public.commission_source_events to service_role;
create policy "Service role reads commission_source_events"
  on public.commission_source_events for select to service_role using (true);

-- Processor state is trigger-created. Workers may update processing fields but
-- cannot create, move, or erase state rows.
drop policy if exists "Service role manages commission_source_event_states"
  on public.commission_source_event_states;
revoke all on table public.commission_source_event_states from service_role;
grant select on table public.commission_source_event_states to service_role;
grant update (
  processing_status,
  attempt_count,
  next_attempt_at,
  last_error
) on table public.commission_source_event_states to service_role;
create policy "Service role reads commission_source_event_states"
  on public.commission_source_event_states for select to service_role using (true);
create policy "Service role updates commission_source_event_states"
  on public.commission_source_event_states
  for update to service_role using (true) with check (true);

-- Freeze the legacy ledger: the service role may inspect/backfill but no role
-- receives new insert/update/delete privileges.
do $$
declare
  policy_row record;
begin
  alter table public.ticket_ledger enable row level security;
  for policy_row in
    select policyname
    from pg_policies
    where schemaname = 'public' and tablename = 'ticket_ledger'
  loop
    execute format('drop policy if exists %I on public.ticket_ledger', policy_row.policyname);
  end loop;
end
$$;

revoke all on table public.ticket_ledger from public, anon, authenticated, service_role;
grant select on table public.ticket_ledger to service_role;
create policy "Service role reads legacy ticket ledger"
  on public.ticket_ledger for select to service_role using (true);

-- Airline names/codes are safe authenticated lookup data; mutations remain
-- service-route-only.
do $$
declare
  policy_row record;
begin
  alter table public.airlines enable row level security;
  for policy_row in
    select policyname
    from pg_policies
    where schemaname = 'public' and tablename = 'airlines'
  loop
    execute format('drop policy if exists %I on public.airlines', policy_row.policyname);
  end loop;
end
$$;

revoke all on table public.airlines from public, anon, authenticated;
grant select on table public.airlines to authenticated;
grant select, insert, update, delete on table public.airlines to service_role;
create policy "Authenticated reads active airlines"
  on public.airlines for select to authenticated using (is_active);
create policy "Service role manages airlines"
  on public.airlines for all to service_role using (true) with check (true);

alter table public.portal_schema_versions enable row level security;
drop policy if exists "Service role reads portal schema versions"
  on public.portal_schema_versions;
create policy "Service role reads portal schema versions"
  on public.portal_schema_versions for select to service_role using (true);
revoke all on table public.portal_schema_versions from public, anon, authenticated;
grant select on table public.portal_schema_versions to service_role;

insert into public.portal_schema_versions (component, version, applied_at, details)
values (
  'ticketing',
  20260822,
  now(),
  jsonb_build_object(
    'migration', '20260822_create_ticketing_commission_foundation.sql',
    'capabilities', jsonb_build_array(
      'normalized-ledger',
      'passenger-fare-lines',
      'itinerary-sectors',
      'package-pnr-index',
      'idempotent-commission-source-events',
      'service-role-boundary'
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
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'ready', coalesce(version >= 20260822, false),
    'version', version,
    'requiredVersion', 20260822,
    'appliedAt', applied_at,
    'details', details
  )
  from public.portal_schema_versions
  where component = 'ticketing'
$$;

revoke all on function public.normalize_ticket_pnr_v1(text) from public, anon;
grant execute on function public.normalize_ticket_pnr_v1(text) to authenticated, service_role;
revoke all on function public.is_valid_iana_timezone(text) from public, anon;
grant execute on function public.is_valid_iana_timezone(text) to authenticated, service_role;
revoke all on function public.set_ticketing_updated_at() from public, anon, authenticated;
grant execute on function public.set_ticketing_updated_at() to service_role;
revoke all on function public.normalize_airline_directory_row() from public, anon, authenticated;
grant execute on function public.normalize_airline_directory_row() to service_role;
revoke all on function public.advance_ticketing_row_version() from public, anon, authenticated;
grant execute on function public.advance_ticketing_row_version() to service_role;
revoke all on function public.reject_immutable_event_mutation() from public, anon, authenticated;
grant execute on function public.reject_immutable_event_mutation() to service_role;
revoke all on function public.validate_ticket_child_currency() from public, anon, authenticated;
grant execute on function public.validate_ticket_child_currency() to service_role;
revoke all on function public.protect_allocated_ticket_passenger_type()
  from public, anon, authenticated;
grant execute on function public.protect_allocated_ticket_passenger_type() to service_role;
revoke all on function public.validate_ticket_passenger_fare_type()
  from public, anon, authenticated;
grant execute on function public.validate_ticket_passenger_fare_type() to service_role;
revoke all on function public.reconcile_ticket_transaction_before_post()
  from public, anon, authenticated;
grant execute on function public.reconcile_ticket_transaction_before_post() to service_role;
revoke all on function public.protect_ticket_transaction_history()
  from public, anon, authenticated;
grant execute on function public.protect_ticket_transaction_history() to service_role;
revoke all on function public.protect_posted_ticket_fare_lines()
  from public, anon, authenticated;
grant execute on function public.protect_posted_ticket_fare_lines() to service_role;
revoke all on function public.validate_ticket_package_link_evidence()
  from public, anon, authenticated;
grant execute on function public.validate_ticket_package_link_evidence() to service_role;
revoke all on function public.validate_ticket_booking_package_scope()
  from public, anon, authenticated;
grant execute on function public.validate_ticket_booking_package_scope() to service_role;
revoke all on function public.protect_ticket_booking_package_pnr()
  from public, anon, authenticated;
grant execute on function public.protect_ticket_booking_package_pnr() to service_role;
revoke all on function public.protect_linked_ticket_package_reservation()
  from public, anon, authenticated;
grant execute on function public.protect_linked_ticket_package_reservation() to service_role;
revoke all on function public.protect_linked_ticket_package()
  from public, anon, authenticated;
grant execute on function public.protect_linked_ticket_package() to service_role;
revoke all on function public.validate_commission_source_event_lineage()
  from public, anon, authenticated;
grant execute on function public.validate_commission_source_event_lineage() to service_role;
revoke all on function public.create_commission_source_event_state()
  from public, anon, authenticated;
grant execute on function public.create_commission_source_event_state() to service_role;
revoke all on function public.reject_commission_source_event_state_delete()
  from public, anon, authenticated;
grant execute on function public.reject_commission_source_event_state_delete() to service_role;
revoke all on function public.append_commission_source_event(jsonb)
  from public, anon, authenticated;
grant execute on function public.append_commission_source_event(jsonb) to service_role;
revoke all on function public.ticketing_schema_status() from public, anon, authenticated;
grant execute on function public.ticketing_schema_status() to service_role;

commit;
