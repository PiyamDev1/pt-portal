-- Adds a maintenance-scoped admin role for operational tooling access.
-- Safe to run multiple times.

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public' and table_name = 'roles'
  ) then
    if not exists (
      select 1
      from public.roles
      where lower(name) = 'maintenance admin'
    ) then
      if exists (
        select 1
        from information_schema.columns
        where table_schema = 'public' and table_name = 'roles' and column_name = 'level'
      ) then
        insert into public.roles (name, level)
        values (
          'Maintenance Admin',
          coalesce((select max(level) from public.roles), 1) + 1
        );
      else
        insert into public.roles (name)
        values ('Maintenance Admin');
      end if;
    end if;
  end if;
end
$$;
