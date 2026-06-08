create table if not exists public.user_security_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  backup_codes_downloaded_at timestamptz,
  backup_reminder_dismissed_until timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (user_id)
);

create index if not exists idx_user_security_preferences_user_id
  on public.user_security_preferences (user_id);

alter table public.user_security_preferences enable row level security;

drop trigger if exists user_security_preferences_updated_at on public.user_security_preferences;
create trigger user_security_preferences_updated_at
before update on public.user_security_preferences
for each row execute function public.update_updated_at();

drop policy if exists "Authenticated can read own security preferences" on public.user_security_preferences;
create policy "Authenticated can read own security preferences"
  on public.user_security_preferences for select to authenticated using (auth.uid() = user_id);

drop policy if exists "Authenticated can manage own security preferences" on public.user_security_preferences;
create policy "Authenticated can manage own security preferences"
  on public.user_security_preferences for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Service role can manage user security preferences" on public.user_security_preferences;
create policy "Service role can manage user security preferences"
  on public.user_security_preferences for all to service_role using (true) with check (true);
