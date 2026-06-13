# Appointment Bookings Guide

> PT-Portal appointment bookings system status: active development, not finished yet  
> Last updated: June 2026

## Overview

The bookings module is the newest major feature in PT-Portal. It is a branch-aware appointment scheduling system with service rules, slot generation, reminder emails, attendance confirmation links, and no-show tracking.

Current route surface:

- Dashboard: `/dashboard/bookings`
- Core API namespace: `/api/bookings/*`

This module is usable for development and internal rollout work, but it should still be treated as **unfinished**.

## What Exists Today

### Core booking flow

- Create bookings with customer name, phone, email, service, date/time, source, notes, and person count
- Calculate slot availability from branch hours, service duration, buffers, and concurrent staff capacity
- Prevent overlapping bookings beyond branch/service tolerance rules
- Reschedule and amend existing bookings
- Update status between `pending`, `confirmed`, `completed`, and `cancelled`
- Enforce stricter status transition rules and explicit reschedule tracking
- Use optimistic conflict protection with `updated_at` checks on booking edits
- Support internal tags, booking history, and manual re-send actions

### Branch-aware scheduling

- Branch appointment access is controlled with `locations.appointments_enabled`
- Weekly branch schedules are stored in `branch_settings`
- One-off closure/time overrides are stored in `branch_schedule_overrides`
- A default fallback schedule is generated in code if branch settings are missing

### Service-aware slot logic

- Services are stored in `booking_services`
- Services support:
  - Base duration
  - Buffer minutes
  - Allowed weekdays
  - Optional daily service start/end window
  - Extra minutes per additional person
  - Whether family head counts toward person total
  - Close overrun tolerance near end of day

### Email, reminder, and penalty work

- Booking confirmation, modification, and cancellation emails are supported
- Service-level email templates can be customized with approved placeholders
- Reminder settings are stored per branch
- Reminder settings now support both advance reminders and same-day reminders
- Reminder cron exists at `/api/cron/bookings/reminders`
- Attendance confirmation links are handled through `/api/bookings/attendance/respond`
- Repeat no-shows can be flagged through `booking_contact_flags`

### Operations and audit

- Booking telemetry events are logged via `/api/bookings/telemetry`
- Booking audit trail is stored in `booking_audit_logs`
- Booking email delivery attempts are stored in `booking_email_logs`
- Booking idempotency keys are stored in `booking_idempotency_keys`

## Current UI Surface

The bookings dashboard currently includes:

- Day/week/list operational views
- Appointment creation form
- Slot lookup by branch, service, date, and group size
- Status update actions
- Reschedule/amend flows
- Manual email re-send from the dashboard
- Booking activity/email history modal
- Search, status/service/source filters, saved views, CSV export, and summary reporting
- Admin access to booking settings through the shared booking settings tab

Admins can switch between appointment-enabled branches. Non-admin users are scoped to their effective branch location.

## Current API Surface

Main routes currently implemented:

- `GET /api/bookings`
- `POST /api/bookings`
- `PATCH /api/bookings/[id]`
- `GET /api/bookings/[id]/history`
- `POST /api/bookings/[id]/resend`
- `GET /api/bookings/available-slots`
- `GET /api/bookings/export`
- `GET /api/bookings/report`
- `GET|PATCH /api/bookings/settings/branch`
- `GET|POST /api/bookings/settings/overrides`
- `GET|POST /api/bookings/settings/services`
- `GET|PATCH /api/bookings/settings/reminders`
- `GET /api/bookings/attendance/respond`
- `POST /api/bookings/telemetry`
- `GET /api/cron/bookings/reminders`

See [API_REFERENCE.md](../technical/API_REFERENCE.md) for endpoint details.

## Database Footprint

Main tables involved:

- `bookings`
- `booking_services`
- `branch_settings`
- `branch_schedule_overrides`
- `booking_email_logs`
- `booking_idempotency_keys`
- `booking_reminder_settings`
- `booking_reminder_events`
- `booking_contact_flags`
- `booking_audit_logs`

Bootstrap schema:

- `scripts/bootstrap/create-bookings-schema.sql`

Recent incremental booking migrations:

- `scripts/migrations/20260602_add_booking_audit_logs.sql`
- `scripts/migrations/20260602_add_booking_reminders_and_penalties.sql`
- `scripts/migrations/20260606_upgrade_booking_operations.sql`

## Known Current State

The most important caveats right now are:

- The module is still being actively built out
- Schema compatibility guards are present in the API and may return warnings/setup hints when booking tables or newer columns are missing
- Reminder and no-show flows exist, but operational policy around manual review is still being refined
- SMS delivery is still not implemented; reminder and resend flows are email-only right now
- The UI is substantial, but it should still be treated as an active work area rather than a fully settled module

## Related Files

- `app/dashboard/bookings/`
- `app/api/bookings/`
- `app/api/cron/bookings/reminders/route.ts`
- `app/types/bookings.ts`
- `lib/bookingBranchSchedule.ts`
- `lib/bookingEmail.ts`
- `lib/bookingReminders.ts`
