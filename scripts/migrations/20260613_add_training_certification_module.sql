-- Training and Certification module.
-- Tracks internal courses, staff enrolments, completion attempts, and certificate validity.

create table if not exists public.training_courses (
  id uuid primary key default gen_random_uuid(),
  title text not null unique,
  description text not null default '',
  category text not null default 'General',
  estimated_minutes integer not null default 15 check (estimated_minutes > 0),
  passing_score integer not null default 80 check (passing_score between 0 and 100),
  certificate_valid_days integer check (certificate_valid_days is null or certificate_valid_days > 0),
  is_required boolean not null default false,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.training_enrollments (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.training_courses(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  assigned_by uuid references auth.users(id) on delete set null,
  status text not null default 'assigned'
    check (status in ('assigned', 'in_progress', 'completed', 'expired')),
  due_date date,
  started_at timestamptz,
  completed_at timestamptz,
  score integer check (score is null or score between 0 and 100),
  certificate_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (course_id, employee_id)
);

create table if not exists public.training_attempts (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.training_courses(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  score integer not null check (score between 0 and 100),
  passed boolean not null default false,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.training_certificates (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null unique references public.training_enrollments(id) on delete cascade,
  certificate_number text not null unique,
  issued_at timestamptz not null default now(),
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists training_courses_active_idx
  on public.training_courses(is_active, category, title);

create index if not exists training_enrollments_employee_status_idx
  on public.training_enrollments(employee_id, status, due_date);

create index if not exists training_attempts_employee_course_idx
  on public.training_attempts(employee_id, course_id, created_at desc);

alter table public.training_courses enable row level security;
alter table public.training_enrollments enable row level security;
alter table public.training_attempts enable row level security;
alter table public.training_certificates enable row level security;

drop policy if exists "Authenticated users can read active training courses" on public.training_courses;
create policy "Authenticated users can read active training courses"
  on public.training_courses for select to authenticated
  using (is_active = true or exists (
    select 1
    from public.employees e
    join public.roles r on r.id = e.role_id
    where e.id = auth.uid()
      and r.name in ('Admin', 'Master Admin', 'Maintenance Admin', 'Manager')
  ));

drop policy if exists "Admins can manage training courses" on public.training_courses;
create policy "Admins can manage training courses"
  on public.training_courses for all to authenticated
  using (exists (
    select 1
    from public.employees e
    join public.roles r on r.id = e.role_id
    where e.id = auth.uid()
      and r.name in ('Admin', 'Master Admin', 'Maintenance Admin', 'Manager')
  ))
  with check (exists (
    select 1
    from public.employees e
    join public.roles r on r.id = e.role_id
    where e.id = auth.uid()
      and r.name in ('Admin', 'Master Admin', 'Maintenance Admin', 'Manager')
  ));

drop policy if exists "Users and managers can read training enrolments" on public.training_enrollments;
create policy "Users and managers can read training enrolments"
  on public.training_enrollments for select to authenticated
  using (
    employee_id = auth.uid()
    or exists (
      select 1
      from public.employees e
      join public.roles r on r.id = e.role_id
      where e.id = auth.uid()
        and r.name in ('Admin', 'Master Admin', 'Maintenance Admin', 'Manager')
    )
  );

drop policy if exists "Users and managers can manage training enrolments" on public.training_enrollments;
create policy "Users and managers can manage training enrolments"
  on public.training_enrollments for all to authenticated
  using (
    employee_id = auth.uid()
    or exists (
      select 1
      from public.employees e
      join public.roles r on r.id = e.role_id
      where e.id = auth.uid()
        and r.name in ('Admin', 'Master Admin', 'Maintenance Admin', 'Manager')
    )
  )
  with check (
    employee_id = auth.uid()
    or exists (
      select 1
      from public.employees e
      join public.roles r on r.id = e.role_id
      where e.id = auth.uid()
        and r.name in ('Admin', 'Master Admin', 'Maintenance Admin', 'Manager')
    )
  );

drop policy if exists "Users and managers can read training attempts" on public.training_attempts;
create policy "Users and managers can read training attempts"
  on public.training_attempts for select to authenticated
  using (
    employee_id = auth.uid()
    or exists (
      select 1
      from public.employees e
      join public.roles r on r.id = e.role_id
      where e.id = auth.uid()
        and r.name in ('Admin', 'Master Admin', 'Maintenance Admin', 'Manager')
    )
  );

drop policy if exists "Users can insert own training attempts" on public.training_attempts;
create policy "Users can insert own training attempts"
  on public.training_attempts for insert to authenticated
  with check (employee_id = auth.uid());

drop policy if exists "Users and managers can read training certificates" on public.training_certificates;
create policy "Users and managers can read training certificates"
  on public.training_certificates for select to authenticated
  using (exists (
    select 1
    from public.training_enrollments te
    where te.id = enrollment_id
      and (
        te.employee_id = auth.uid()
        or exists (
          select 1
          from public.employees e
          join public.roles r on r.id = e.role_id
          where e.id = auth.uid()
            and r.name in ('Admin', 'Master Admin', 'Maintenance Admin', 'Manager')
        )
      )
  ));

drop policy if exists "Users and managers can insert training certificates" on public.training_certificates;
create policy "Users and managers can insert training certificates"
  on public.training_certificates for insert to authenticated
  with check (exists (
    select 1
    from public.training_enrollments te
    where te.id = enrollment_id
      and (
        te.employee_id = auth.uid()
        or exists (
          select 1
          from public.employees e
          join public.roles r on r.id = e.role_id
          where e.id = auth.uid()
            and r.name in ('Admin', 'Master Admin', 'Maintenance Admin', 'Manager')
        )
      )
  ));

drop policy if exists "Users and managers can update training certificates" on public.training_certificates;
create policy "Users and managers can update training certificates"
  on public.training_certificates for update to authenticated
  using (exists (
    select 1
    from public.training_enrollments te
    where te.id = enrollment_id
      and (
        te.employee_id = auth.uid()
        or exists (
          select 1
          from public.employees e
          join public.roles r on r.id = e.role_id
          where e.id = auth.uid()
            and r.name in ('Admin', 'Master Admin', 'Maintenance Admin', 'Manager')
        )
      )
  ))
  with check (exists (
    select 1
    from public.training_enrollments te
    where te.id = enrollment_id
      and (
        te.employee_id = auth.uid()
        or exists (
          select 1
          from public.employees e
          join public.roles r on r.id = e.role_id
          where e.id = auth.uid()
            and r.name in ('Admin', 'Master Admin', 'Maintenance Admin', 'Manager')
        )
      )
  ));

insert into public.training_courses
  (title, description, category, estimated_minutes, passing_score, certificate_valid_days, is_required)
values
  (
    'IMS Security Basics',
    'Covers password hygiene, passkeys, suspicious links, device safety, and reporting incidents.',
    'Security',
    20,
    80,
    365,
    true
  ),
  (
    'Customer Data Handling',
    'Explains how staff should handle passports, documents, phone numbers, receipts, and application notes.',
    'Compliance',
    25,
    85,
    365,
    true
  ),
  (
    'Appointment No-Show Procedure',
    'Standard process for appointment attendance, no-show flags, waitlist follow-up, and customer communication.',
    'Operations',
    15,
    80,
    null,
    false
  )
on conflict (title) do nothing;
