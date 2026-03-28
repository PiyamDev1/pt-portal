-- Track per-user read state for application notes (DB-backed unread indicators)

create table if not exists public.application_note_reads (
  id bigserial primary key,
  context text not null,
  record_id text not null,
  user_id text not null,
  note_signature text not null,
  updated_at timestamptz not null default now(),
  constraint application_note_reads_context_check
    check (context in ('nadra', 'pk-passport')),
  constraint application_note_reads_unique
    unique (context, record_id, user_id)
);

create index if not exists application_note_reads_user_context_idx
  on public.application_note_reads(user_id, context);

create index if not exists application_note_reads_record_idx
  on public.application_note_reads(record_id);

alter table public.application_note_reads enable row level security;

create policy "Service role has full access to application_note_reads"
  on public.application_note_reads
  for all
  to service_role
  using (true)
  with check (true);
