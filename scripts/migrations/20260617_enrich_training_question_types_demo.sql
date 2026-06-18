-- Enrich Training quizzes with question types, weighted marking, optional media,
-- and a complete demo course that shows how staff training should feel in IMS.

do $$
begin
  if to_regclass('public.training_quiz_questions') is null then
    raise exception 'Run 20260617_upgrade_training_content_quizzes.sql before this enrichment migration.';
  end if;
end $$;

alter table public.training_quiz_questions
  add column if not exists question_type text not null default 'single_choice',
  add column if not exists correct_answer jsonb not null default '[]'::jsonb,
  add column if not exists points integer not null default 1 check (points > 0),
  add column if not exists image_url text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'training_quiz_questions_question_type_chk'
      and conrelid = 'public.training_quiz_questions'::regclass
  ) then
    alter table public.training_quiz_questions
      add constraint training_quiz_questions_question_type_chk
      check (question_type in ('single_choice', 'multi_select', 'true_false', 'image_choice'));
  end if;
end $$;

update public.training_quiz_questions
set correct_answer = jsonb_build_array(correct_option_index::text)
where correct_answer = '[]'::jsonb;

insert into public.training_courses
  (title, description, category, estimated_minutes, passing_score, certificate_valid_days, is_required)
values (
  'IMS Security Basics',
  'A practical walkthrough for protecting customer data, using passkeys, spotting suspicious links, and reporting incidents inside IMS.',
  'Security',
  35,
  80,
  365,
  true
)
on conflict (title) do update
set description = excluded.description,
    category = excluded.category,
    estimated_minutes = excluded.estimated_minutes,
    passing_score = excluded.passing_score,
    certificate_valid_days = excluded.certificate_valid_days,
    is_required = excluded.is_required,
    updated_at = now();

update public.training_lessons tl
set body = $lesson$
Good IMS security is not about making work slow. It is about keeping customer data inside the right systems, reducing the number of places a password can be stolen from, and making sure suspicious activity is reported quickly.

For Piyam Travel, the important rule is simple: customer records, passport details, appointment notes, and receipts belong inside IMS-approved storage and workflows. Personal email, WhatsApp file forwarding, local Downloads folders, and screenshots should not become unofficial storage.

Good behaviour looks like this:
- Use passkeys or approved MFA when available.
- Check the domain before entering credentials.
- Keep documents in IMS storage, not personal devices.
- Lock your screen when stepping away.
- Report anything suspicious early, even if you are not sure.
$lesson$
from public.training_courses tc
where tc.id = tl.course_id
  and tc.title = 'IMS Security Basics'
  and tl.title = 'What good IMS security looks like';

insert into public.training_lessons (course_id, title, body, sort_order)
select tc.id, lesson.title, lesson.body, lesson.sort_order
from public.training_courses tc
cross join (
  values
    (
      'Passkeys, 2FA, and verification codes',
      $lesson$
Passkeys and biometric unlocks are designed to prove that the person using the device is the account owner. They are safer than passwords because the secret is not typed into websites and cannot be reused on a fake login page.

Verification codes are different. A code can be copied, guessed, pressured out of someone, or typed into the wrong site. Treat every code as sensitive. IMS, managers, IT support, suppliers, and banks should never need you to read out or forward a login code.

If you get a code you did not request:
- Do not approve the login.
- Do not share the code with anyone.
- Change your password if you suspect someone knows it.
- Report it to a manager or admin immediately.
$lesson$,
      2
    ),
    (
      'Customer documents and approved storage',
      $lesson$
Customer documents can include passport scans, ID cards, receipts, visa documents, appointment evidence, and notes about customer cases. These are not just files; they are personal data.

Use the document storage tools in IMS wherever possible. If a file must be downloaded temporarily, it should be used for the task and then removed from local storage. Do not leave customer documents on shared desktops, browser download folders, USB drives, or personal cloud storage.

Before sharing a file, ask:
- Is there a business reason to share it?
- Is the recipient approved?
- Is this the minimum document or information needed?
- Can the same task be completed inside IMS instead?
$lesson$,
      3
    ),
    (
      'Suspicious links, fake login pages, and handoff screens',
      $lesson$
Attackers often copy the look of real login pages. The easiest defence is to slow down for a few seconds before typing credentials.

Look for the correct domain, HTTPS lock, unusual spelling, unexpected redirects, and messages that create pressure. Be especially careful with links sent by email, SMS, WhatsApp, or social media. If a link claims to be IMS or Frappe but does not start from the expected Piyam Travel domain, treat it as suspicious.

The HRMS handoff should start from IMS. If you are unexpectedly asked to log into Frappe directly, stop and report it. One trusted front door is safer than several side doors.
$lesson$,
      4
    ),
    (
      'Incident reporting checklist',
      $lesson$
Reporting quickly is more important than being perfectly certain. Many security issues are small when caught early and serious when ignored.

Report immediately if:
- You clicked a suspicious link.
- You entered credentials into a page you now doubt.
- A customer document was sent to the wrong person.
- Your device is lost, stolen, or used by someone else.
- You see customer data somewhere it should not be.

When reporting, include what happened, when it happened, what customer or record may be affected, and any screenshots that do not expose more personal data than necessary.
$lesson$,
      5
    )
) as lesson(title, body, sort_order)
where tc.title = 'IMS Security Basics'
  and not exists (
    select 1
    from public.training_lessons existing
    where existing.course_id = tc.id
      and existing.title = lesson.title
  );

update public.training_quiz_questions tq
set options = $json$[
    {"id":"a","label":"Open it quickly to check whether it looks genuine"},
    {"id":"b","label":"Forward it to customers so they can check too"},
    {"id":"c","label":"Report it and do not enter credentials"},
    {"id":"d","label":"Use your personal email to test it safely"}
  ]$json$::jsonb,
    correct_option_index = 2,
    question_type = 'single_choice',
    correct_answer = '["c"]'::jsonb,
    points = 1,
    explanation = 'Suspicious links should be reported and avoided. Never enter credentials into an untrusted page.'
from public.training_courses tc
where tc.id = tq.course_id
  and tc.title = 'IMS Security Basics'
  and tq.prompt = 'What should you do if you receive a suspicious link claiming to be IMS?';

insert into public.training_quiz_questions
  (course_id, prompt, options, correct_option_index, question_type, correct_answer, points, explanation, sort_order, image_url)
select tc.id,
  question.prompt,
  question.options::jsonb,
  question.correct_option_index,
  question.question_type,
  question.correct_answer::jsonb,
  question.points,
  question.explanation,
  question.sort_order,
  question.image_url
from public.training_courses tc
cross join (
  values
    (
      'Which actions reduce the risk of a customer data breach? Select all that apply.',
      $json$[
        {"id":"a","label":"Keep customer files inside IMS-approved storage"},
        {"id":"b","label":"Lock your screen before leaving the desk"},
        {"id":"c","label":"Send passport scans to your personal email for convenience"},
        {"id":"d","label":"Report suspicious links or unexpected login codes quickly"}
      ]$json$,
      0,
      'multi_select',
      '["a","b","d"]',
      2,
      'The correct answers are the actions that keep data in approved systems, protect unattended devices, and report suspicious activity early.',
      2,
      null
    ),
    (
      'True or false: it is acceptable to share a verification code if the person asking says they are a manager or IT support.',
      $json$[
        {"id":"true","label":"True"},
        {"id":"false","label":"False"}
      ]$json$,
      1,
      'true_false',
      '["false"]',
      1,
      'Verification codes should never be shared. Genuine support should not need your live login code.',
      3,
      null
    ),
    (
      'Which screen is the safest place to enter IMS credentials?',
      $json$[
        {"id":"a","label":"Official IMS sign-in page","imageUrl":"https://placehold.co/640x360/8b1d2c/ffffff?text=ims.piyamtravel.com%2Flogin"},
        {"id":"b","label":"Unknown link from a message","imageUrl":"https://placehold.co/640x360/111827/ffffff?text=random-ims-login.example"},
        {"id":"c","label":"Personal cloud storage login","imageUrl":"https://placehold.co/640x360/64748b/ffffff?text=personal-cloud-login"}
      ]$json$,
      0,
      'image_choice',
      '["a"]',
      2,
      'Start from the official IMS domain. Unexpected login pages and personal cloud pages are not trusted IMS entry points.',
      4,
      'https://placehold.co/900x360/f8fafc/8b1d2c?text=Choose+the+trusted+login+screen'
    ),
    (
      'What should you do after temporarily downloading a customer document to complete an approved task?',
      $json$[
        {"id":"a","label":"Leave it in Downloads so it is easy to find later"},
        {"id":"b","label":"Move it to personal cloud storage"},
        {"id":"c","label":"Use it for the task, then remove the local copy and keep the record in IMS"},
        {"id":"d","label":"Send it to another staff member on WhatsApp"}
      ]$json$,
      2,
      'single_choice',
      '["c"]',
      1,
      'Temporary files should not become unofficial records. Keep the approved record in IMS and remove unnecessary local copies.',
      5,
      null
    )
) as question(prompt, options, correct_option_index, question_type, correct_answer, points, explanation, sort_order, image_url)
where tc.title = 'IMS Security Basics'
  and not exists (
    select 1
    from public.training_quiz_questions existing
    where existing.course_id = tc.id
      and existing.prompt = question.prompt
  );
