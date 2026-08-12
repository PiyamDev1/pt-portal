# Appointment Bookings Guide

Last verified against the repository: August 12, 2026.

PT-Portal's booking module is an implemented branch-aware appointment system at `/dashboard/bookings`. It combines schedule/service configuration, capacity-safe booking operations, draft/waitlist tools, email reminders, attendance/no-show handling, and audit/reporting.

## Operator workflow

1. Select an appointment-enabled branch (administrators can switch; other staff use their effective location).
2. Choose an active service, date, and group size to load server-calculated availability.
3. Enter customer/contact/source/notes/tags and create the appointment, or add the customer to the waitlist.
4. Edit, reschedule, change status, or resend email from the dashboard; conflict checks protect against overwriting a newer edit.
5. Review the booking's activity/email history and use report/export views for operations.
6. Mark a no-show through the app confirmation flow when policy requires it; the contact flag remains subject to staff review.

The form saves a per-user/per-branch draft. Saved view preferences are also user-scoped.

## Scheduling contract

Availability combines:

- `locations.appointments_enabled` and the selected location;
- weekly `branch_settings`, lunch/break windows, and one-off `branch_schedule_overrides`;
- `booking_services` duration, buffer, allowed weekdays, optional service window, group-size increments, family-head counting, closing tolerance, and concurrent capacity;
- existing active bookings and short-lived `booking_capacity_reservations`; and
- group size/person count.

Create/reschedule reserves capacity through PostgreSQL before the final write so concurrent callers cannot claim the same last slot. Standard operations use generated slots. A manual date/time override is an explicit recorded choice; it still requires valid bounded dates/times and appropriate access.

Status transitions and reschedules are recorded in `booking_audit_logs`. Update requests use the known `updated_at` value for optimistic conflict protection. Idempotency records prevent accidental duplicate creates.

## Email and reminders

Mailgun sends confirmation, modification, cancellation, resend, advance-reminder, and same-day-reminder messages. Service templates use only the supported placeholders defined by the booking email helpers. A persisted booking can succeed while email delivery returns a warning; the UI surfaces that distinction.

Branch reminder settings control enablement, hours, subject/template, same-day behavior, and repeat-no-show policy. `/api/cron/bookings/reminders` runs daily at 06:00 UTC and requires exact `Authorization: Bearer <CRON_SECRET>`. It fails closed when the secret is not configured. The optional `BOOKING_REMINDER_CRON_LOOKBACK_MINUTES` catch-up window is clamped to 15–1,440 minutes.

Customer attendance links are one-shot transitions: the first valid present or missed response claims the reminder event, and repeated/concurrent visits do not reapply attendance or no-show penalties.

Attendance links are built from `APP_BASE_URL`, then `NEXT_PUBLIC_SITE_URL`, then legacy `NEXT_PUBLIC_APP_URL`. A per-event response token records `present` or `missed`; a missed response can update the contact penalty record. SMS delivery is not implemented.

## Current UI and API

The dashboard includes day/week/list views, search and status/service/source filters, saved views, appointment editing, history, waitlist, draft state, CSV export, and summary reporting. Booking settings manage branch hours, one-off overrides, services, capacity rules, and reminder templates. Settings mutations require an active `Admin`, `Master Admin`, or `Super Admin` employee session before any service-role write.

The public booking-telemetry beacon accepts only the booking UI's allowlisted events and metadata in an 8 KiB body. It is limited to 120 events per IP per minute, with fail-open limiter behavior because telemetry must never interrupt appointment work.

The complete current method inventory—including drafts, preferences, waitlist, settings child routes, no-show, resend, telemetry, and attendance—is in [API Reference](../technical/API_REFERENCE.md#bookings).

## Database deployment

Install the booking bootstrap for a new environment, then apply incremental migrations in order:

- `scripts/bootstrap/create-bookings-schema.sql`
- `scripts/migrations/20260602_add_booking_audit_logs.sql`
- `scripts/migrations/20260602_add_booking_reminders_and_penalties.sql`
- `scripts/migrations/20260606_upgrade_booking_operations.sql`
- `scripts/migrations/20260608_add_booking_capacity_waitlist_drafts.sql`
- `scripts/migrations/20260702_add_manual_override_to_bookings.sql`

Main tables include `bookings`, `booking_services`, `branch_settings`, `branch_schedule_overrides`, capacity reservations, waitlist entries, drafts/preferences, email/idempotency/reminder records, contact flags, and audit logs.

Compatibility guards may return setup warnings when the base schema or a newer column/function is absent. Apply the missing SQL before enabling the corresponding workflow; do not rely on runtime setup calls to create schema.

## Operational checks

- Confirm the branch is appointment-enabled and schedules/overrides are correct.
- Confirm service duration, buffer, group rules, window, and capacity before diagnosing “no slots”.
- Treat a `409` as a capacity/edit conflict and reload before deciding whether to retry.
- Check Mailgun configuration and `booking_email_logs` when the booking succeeded with an email warning.
- Check `CRON_SECRET`, base URL, reminder settings/events, and recent Vercel cron execution when reminders or attendance links fail.
- Review no-show/contact flags manually before refusing or changing service to a customer.

## Source and tests

- UI: `app/dashboard/bookings/`
- Routes: `app/api/bookings/` and `app/api/cron/bookings/reminders/route.ts`
- Types: `app/types/bookings.ts`
- Scheduling/capacity: `lib/bookingBranchSchedule.ts`, `lib/bookingCapacity.ts`
- Operations/email/reminders: `lib/bookingOperations.ts`, `lib/bookingEmail.ts`, `lib/bookingReminders.ts`
- Focused tests: `tests/unit/booking*.test.ts` and `tests/unit/bookings*.test.ts`; there is currently no booking-specific Playwright smoke specification
