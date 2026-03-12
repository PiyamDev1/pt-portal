-- Add one-time maintenance adjustment fields to timeclock events.
-- Preserves original punch timestamps and stores a single audited override.

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public' and table_name = 'timeclock_events'
  ) then
    if not exists (
      select 1
      from information_schema.columns
      where table_schema = 'public' and table_name = 'timeclock_events' and column_name = 'adjusted_device_ts'
    ) then
      alter table public.timeclock_events add column adjusted_device_ts timestamp with time zone;
    end if;

    if not exists (
      select 1
      from information_schema.columns
      where table_schema = 'public' and table_name = 'timeclock_events' and column_name = 'adjusted_scanned_at'
    ) then
      alter table public.timeclock_events add column adjusted_scanned_at timestamp with time zone;
    end if;

    if not exists (
      select 1
      from information_schema.columns
      where table_schema = 'public' and table_name = 'timeclock_events' and column_name = 'adjusted_at'
    ) then
      alter table public.timeclock_events add column adjusted_at timestamp with time zone;
    end if;

    if not exists (
      select 1
      from information_schema.columns
      where table_schema = 'public' and table_name = 'timeclock_events' and column_name = 'adjusted_by'
    ) then
      alter table public.timeclock_events add column adjusted_by uuid;
    end if;

    if not exists (
      select 1
      from information_schema.columns
      where table_schema = 'public' and table_name = 'timeclock_events' and column_name = 'adjustment_reason'
    ) then
      alter table public.timeclock_events add column adjustment_reason text;
    end if;
  end if;
end
$$;