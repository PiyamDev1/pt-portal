-- Track migration attempts/results in a persistent table for observability.
create table if not exists public.document_migration_runs (
  id uuid primary key default gen_random_uuid(),
  event_type text not null check (event_type in ('attempt', 'success', 'failure', 'batch')),
  outcome text not null check (outcome in ('success', 'failure', 'info')),
  object_key text,
  attempted integer,
  migrated integer,
  trigger_source text,
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists idx_document_migration_runs_created_at
  on public.document_migration_runs (created_at desc);

create index if not exists idx_document_migration_runs_outcome
  on public.document_migration_runs (outcome, created_at desc);