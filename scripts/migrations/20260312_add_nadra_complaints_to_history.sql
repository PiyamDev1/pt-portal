-- Extend NADRA status history to also record complaint events.

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public' and table_name = 'nadra_status_history'
  ) then
    if not exists (
      select 1
      from information_schema.columns
      where table_schema = 'public' and table_name = 'nadra_status_history' and column_name = 'entry_type'
    ) then
      alter table public.nadra_status_history add column entry_type text not null default 'status';
    end if;

    if not exists (
      select 1
      from information_schema.columns
      where table_schema = 'public' and table_name = 'nadra_status_history' and column_name = 'complaint_number'
    ) then
      alter table public.nadra_status_history add column complaint_number text;
    end if;

    if not exists (
      select 1
      from information_schema.columns
      where table_schema = 'public' and table_name = 'nadra_status_history' and column_name = 'details'
    ) then
      alter table public.nadra_status_history add column details text;
    end if;
  end if;
end
$$;