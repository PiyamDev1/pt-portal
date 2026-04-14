# Receipt Operations Guide

## Overview

Receipt generation is available for NADRA, Pakistani Passport, and British Passport workflows.
The system supports generation, verification, history lookup, and share tracking.

Rollout status: Completed and in production use.

## Service-Specific Rules

- NADRA receipts:
  - Include PIN and verification flow.
  - Can include family head details.
- PK Passport receipts:
  - Do not include PIN.
  - Do not require family head details.
- British Passport receipts:
  - Do not include PIN.
  - Do not require family head details.
  - Use PEX REF as the tracking reference on receipt output.

## Receipt UI Behavior

- Single receipt action button per application row.
- Receipt history is available from the corner button inside the receipt popup.
- History view is logs-only (generation/share events), no copy actions.
- Copy action uses screenshot-to-clipboard for the receipt preview area.

## API Endpoints

- `POST /api/receipts/generate`
- `POST /api/receipts/verify`
- `GET /api/receipts/list`
- `POST /api/receipts/share`
- `GET /api/admin/receipt-metrics`

## Database Setup

Run both SQL scripts in order:

1. `scripts/create-generated-receipts-table.sql`
2. `scripts/backfill-generated-receipts-share-columns.sql`

The backfill script is idempotent and safe to re-run.

## Backfill Verification

Open Settings -> Receipt Metrics and confirm:

- `Null share_count rows` is `0`
- `Null shared_via rows` is `0`

If non-zero, re-run the backfill script.

## Smoke Testing

A mutating Playwright smoke test is available:

- File: `tests/smoke/receipt-flow.spec.ts`
- Required environment variables:
  - `SMOKE_USER_EMAIL`
  - `SMOKE_USER_PASSWORD`
  - `SMOKE_USER_BRANCH_CODE`
  - `SMOKE_RECEIPT_NADRA_ID`
- Optional:
  - `SMOKE_2FA_BACKUP_CODE`
  - `SMOKE_RUN_RECEIPT_MUTATION=true`

Run with:

```bash
npm run test:smoke -- tests/smoke/receipt-flow.spec.ts
```

## Admin Audit View

The `Receipt Metrics` tab in Settings provides:

- Total receipts
- Shared receipts
- Share rate
- Share channels
- Per-service volume
- Backfill health indicators
- Recent receipt activity
