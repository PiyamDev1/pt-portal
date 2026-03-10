-- Create documents table for MinIO document metadata
-- Documents are stored at family level, shared by all applicants in a family

create table if not exists documents (
  id text primary key,                          -- doc-{timestamp}-{random}
  file_name text not null,
  file_size bigint not null,
  file_type text not null,
  category text not null default 'general',     -- general | receipt | application-review
  uploaded_at timestamptz not null default now(),
  uploaded_by text not null default 'staff',
  family_head_id text not null,                 -- links to applicant/application ID
  minio_bucket text not null,
  minio_key text not null,
  minio_etag text not null default '',
  deleted boolean not null default false
);

create index if not exists documents_family_head_id_idx on documents(family_head_id);
create index if not exists documents_deleted_idx on documents(deleted);

-- RLS: allow service role full access (API routes use service role)
alter table documents enable row level security;

create policy "Service role has full access to documents"
  on documents
  for all
  to service_role
  using (true)
  with check (true);
