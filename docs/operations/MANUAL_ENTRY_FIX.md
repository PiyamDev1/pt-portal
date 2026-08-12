# Manual Entry Timeclock Troubleshooting

Last verified against the repository: August 12, 2026.

This is a supporting runbook, not schema authority. Use current migrations/source and perform checks in a non-production environment before changing access policies.

## Current surface

- Staff page: `/dashboard/timeclock/manual-entry`
- Generate: `POST /api/timeclock/manual-entry/generate`
- Submit: `POST /api/timeclock/manual-entry/submit`
- Super Admin diagnostics: `GET /api/timeclock/manual-entry/diagnostics`

Generation is limited to a manager with direct reports or a maintenance/admin timeclock role. It creates a signed `ptc1` QR payload plus an eight-digit, 30-second code tied to a virtual manual device. Submission requires an authenticated user, atomically claims the unused code, validates expiry, prevents rapid duplicate punches, creates the hash-linked event, and queues attendance synchronization.

## Required schema

For a new environment, review/apply:

1. `scripts/bootstrap/create-timeclock-tables.sql`
2. `scripts/bootstrap/create-timeclock-manual-codes-table.sql`
3. `scripts/migrations/20260720_secure_timeclock_esp32_integration.sql`
4. `scripts/migrations/20260721_add_physical_timeclock_manual_codes.sql`

`timeclock_manual_codes` and `timeclock_device_manual_code_limits` must have RLS enabled, no `anon`/`authenticated` table grants, and service-role access for the server routes. `scripts/manual/fix-timeclock-manual-codes-rls.sql` reapplies that posture. Do not disable RLS as a troubleshooting shortcut.

## Diagnosis

1. Confirm the caller is authenticated and has manager/maintenance access.
2. As Super Admin, call the diagnostics route and check that `timeclock_devices` and `timeclock_manual_codes` are accessible to the server client.
3. Confirm the three Supabase variables exist without printing their values.
4. Verify the migrations/grants against the target database.
5. Check the returned status: `401` session, `403` role/report scope, `404` invalid/claimed code, `409` duplicate punch, `500` schema/database/crypto failure.
6. Correlate logs using the request time/route without copying QR payloads, numeric codes, cookies, or device secrets.

The page refreshes its code every 30 seconds and pauses after two minutes. An expired code is expected behavior, not evidence that the storage table is broken.
