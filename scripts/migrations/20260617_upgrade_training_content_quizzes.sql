-- Upgrade Training module with lesson content, quiz questions, answer capture,
-- and reminder-ready certificate/due-date tracking.

do $$
begin
  if to_regclass('public.training_courses') is null then
    raise exception 'Run 20260613_add_training_certification_module.sql before this upgrade migration.';
  end if;
end $$;

create table if not exists public.training_lessons (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.training_courses(id) on delete cascade,
  title text not null,
  body text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.training_quiz_questions (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.training_courses(id) on delete cascade,
  prompt text not null,
  options jsonb not null default '[]'::jsonb,
  correct_option_index integer not null default 0 check (correct_option_index >= 0),
  explanation text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.training_attempts
  add column if not exists answers jsonb not null default '{}'::jsonb;

alter table public.training_enrollments
  add column if not exists due_reminder_sent_at timestamptz,
  add column if not exists expiry_reminder_sent_at timestamptz;

create index if not exists training_lessons_course_order_idx
  on public.training_lessons(course_id, sort_order, created_at);

create index if not exists training_quiz_questions_course_order_idx
  on public.training_quiz_questions(course_id, sort_order, created_at);

create index if not exists training_enrollments_due_reminder_idx
  on public.training_enrollments(status, due_date, due_reminder_sent_at);

create index if not exists training_enrollments_expiry_reminder_idx
  on public.training_enrollments(status, certificate_expires_at, expiry_reminder_sent_at);

alter table public.training_lessons enable row level security;
alter table public.training_quiz_questions enable row level security;

drop policy if exists "Authenticated users can read training lessons" on public.training_lessons;
create policy "Authenticated users can read training lessons"
  on public.training_lessons for select to authenticated
  using (exists (
    select 1
    from public.training_courses tc
    where tc.id = training_lessons.course_id
      and tc.is_active = true
  ));

drop policy if exists "Admins can manage training lessons" on public.training_lessons;
create policy "Admins can manage training lessons"
  on public.training_lessons for all to authenticated
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

drop policy if exists "Authenticated users can read training quiz questions" on public.training_quiz_questions;
create policy "Authenticated users can read training quiz questions"
  on public.training_quiz_questions for select to authenticated
  using (exists (
    select 1
    from public.training_courses tc
    where tc.id = training_quiz_questions.course_id
      and tc.is_active = true
  ));

drop policy if exists "Admins can manage training quiz questions" on public.training_quiz_questions;
create policy "Admins can manage training quiz questions"
  on public.training_quiz_questions for all to authenticated
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

insert into public.training_lessons (course_id, title, body, sort_order)
select id, 'What good IMS security looks like',
  'Use passkeys where possible, report suspicious links, keep customer documents inside approved IMS storage, and never share verification codes.',
  1
from public.training_courses
where title = 'IMS Security Basics'
  and not exists (
    select 1
    from public.training_lessons tl
    where tl.course_id = training_courses.id
      and tl.title = 'What good IMS security looks like'
  );

insert into public.training_quiz_questions
  (course_id, prompt, options, correct_option_index, explanation, sort_order)
select id,
  'What should you do if you receive a suspicious link claiming to be IMS?',
  '["Open it to check quickly", "Forward it to customers", "Report it and do not enter credentials", "Use your personal email to test it"]'::jsonb,
  2,
  'Suspicious links should be reported and avoided. Never enter credentials into an untrusted page.',
  1
from public.training_courses
where title = 'IMS Security Basics'
  and not exists (
    select 1
    from public.training_quiz_questions tq
    where tq.course_id = training_courses.id
      and tq.prompt = 'What should you do if you receive a suspicious link claiming to be IMS?'
  );
