-- 20260612_add_frappe_handoff_events.sql
-- Append-only audit trail for IMS-controlled Frappe HRMS browser handoffs.

create table if not exists public.frappe_handoff_events (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid references public.employees(id) on delete set null,
  user_email text,
  frappe_employee_id text,
  frappe_user_id text,
  target_path text not null default '/hrms',
  response_mode text not null default 'redirect',
  client_kind text not null default 'unknown',
  status text not null,
  reason text,
  user_agent text,
  created_at timestamptz not null default now(),
  constraint frappe_handoff_events_response_mode_chk
    check (response_mode in ('redirect', 'json')),
  constraint frappe_handoff_events_client_kind_chk
    check (client_kind in ('desktop', 'mobile', 'standalone', 'unknown')),
  constraint frappe_handoff_events_status_chk
    check (status in ('issued', 'not_linked', 'unauthorized', 'failed'))
);

create index if not exists frappe_handoff_events_employee_created_idx
  on public.frappe_handoff_events(employee_id, created_at desc);

create index if not exists frappe_handoff_events_status_created_idx
  on public.frappe_handoff_events(status, created_at desc);

create index if not exists frappe_handoff_events_frappe_employee_idx
  on public.frappe_handoff_events(frappe_employee_id)
  where frappe_employee_id is not null;

alter table public.frappe_handoff_events enable row level security;

drop policy if exists "Users can read own Frappe handoff events" on public.frappe_handoff_events;
create policy "Users can read own Frappe handoff events"
  on public.frappe_handoff_events for select to authenticated
  using (auth.uid() = employee_id);

drop policy if exists "Service role can manage Frappe handoff events" on public.frappe_handoff_events;
create policy "Service role can manage Frappe handoff events"
  on public.frappe_handoff_events for all to service_role
  using (true)
  with check (true);
