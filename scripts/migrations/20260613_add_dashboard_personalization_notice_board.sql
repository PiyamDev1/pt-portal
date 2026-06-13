-- 20260613_add_dashboard_personalization_notice_board.sql
-- Dashboard favourites/frequency tracking and admin-managed notice board slides.

create table if not exists public.dashboard_user_module_preferences (
  user_id uuid not null references auth.users(id) on delete cascade,
  module_id text not null,
  is_favorite boolean not null default false,
  usage_count integer not null default 0 check (usage_count >= 0),
  last_opened_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, module_id)
);

create index if not exists dashboard_user_module_preferences_favorites_idx
  on public.dashboard_user_module_preferences(user_id, is_favorite, updated_at desc);

create index if not exists dashboard_user_module_preferences_usage_idx
  on public.dashboard_user_module_preferences(user_id, usage_count desc, last_opened_at desc);

alter table public.dashboard_user_module_preferences enable row level security;

drop policy if exists "Users can manage own dashboard module preferences" on public.dashboard_user_module_preferences;
create policy "Users can manage own dashboard module preferences"
  on public.dashboard_user_module_preferences for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Service role can manage dashboard module preferences" on public.dashboard_user_module_preferences;
create policy "Service role can manage dashboard module preferences"
  on public.dashboard_user_module_preferences for all to service_role
  using (true)
  with check (true);

create table if not exists public.notice_board_slides (
  id uuid primary key default gen_random_uuid(),
  title text,
  body text,
  image_url text,
  image_storage_provider text,
  image_storage_bucket text,
  image_storage_key text,
  hyperlink_url text,
  display_seconds integer not null default 6 check (display_seconds between 2 and 60),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  target_role text,
  target_department_id uuid references public.departments(id) on delete set null,
  target_location_id uuid references public.locations(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.notice_board_slides
  add column if not exists image_storage_provider text,
  add column if not exists image_storage_bucket text,
  add column if not exists image_storage_key text,
  add column if not exists target_role text,
  add column if not exists target_department_id uuid references public.departments(id) on delete set null,
  add column if not exists target_location_id uuid references public.locations(id) on delete set null;

create index if not exists notice_board_slides_active_order_idx
  on public.notice_board_slides(is_active, sort_order, created_at desc);

create index if not exists notice_board_slides_target_idx
  on public.notice_board_slides(target_role, target_department_id, target_location_id);

alter table public.notice_board_slides enable row level security;

drop policy if exists "Authenticated users can read active notice board slides" on public.notice_board_slides;
create policy "Authenticated users can read active notice board slides"
  on public.notice_board_slides for select to authenticated
  using (is_active = true);

drop policy if exists "Service role can manage notice board slides" on public.notice_board_slides;
create policy "Service role can manage notice board slides"
  on public.notice_board_slides for all to service_role
  using (true)
  with check (true);

create table if not exists public.notice_board_slide_reads (
  slide_id uuid not null references public.notice_board_slides(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  dismissed_at timestamptz,
  primary key (slide_id, user_id)
);

create index if not exists notice_board_slide_reads_user_idx
  on public.notice_board_slide_reads(user_id, last_seen_at desc);

alter table public.notice_board_slide_reads enable row level security;

drop policy if exists "Users can manage own notice board reads" on public.notice_board_slide_reads;
create policy "Users can manage own notice board reads"
  on public.notice_board_slide_reads for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Service role can manage notice board reads" on public.notice_board_slide_reads;
create policy "Service role can manage notice board reads"
  on public.notice_board_slide_reads for all to service_role
  using (true)
  with check (true);
