# Receipt Operations Guide

Last verified against the repository: August 12, 2026.

Receipts are implemented for NADRA, Pakistani-passport, and GB-passport application workflows. Generation resolves source/pricing data server-side, persists a snapshot, and supports history/share auditing. Do not build customer receipt fields from browser-supplied prices.

## Service rules

| Service            | Triggered receipt types                            | Customer verification/display                                          |
| ------------------ | -------------------------------------------------- | ---------------------------------------------------------------------- |
| NADRA              | Submission and approved-refund events              | Receipt PIN and verification URL; family-head fields can appear        |
| Pakistani passport | Biometrics, collection, and approved-refund events | No receipt PIN/verification requirement; no family-head field          |
| GB passport        | Pending-submission and approved-refund events      | No receipt PIN/verification requirement; PEX REF is the tracking label |

The exact status-to-receipt mapping is enforced in `receiptGenerator.ts`; a status that has no mapping does not generate a receipt.

## Staff workflow

- Open the receipt action on an eligible application row.
- Review the application/customer/service/sale-price snapshot before sharing.
- Copy the rendered receipt image when the browser supports clipboard images; the action records share channel/count.
- Use the receipt-history control to review generation/share events for the applicant and service.
- Use Settings → Receipt Metrics for aggregate volume, channels, service mix, recent activity, and backfill health.

Feedback uses app toasts and dialogs. The receipt canvas shows the customer sale price, not internal cost fields.

## API and access

| Route                            | Access/purpose                                                        |
| -------------------------------- | --------------------------------------------------------------------- |
| `POST /api/receipts/generate`    | Authenticated staff generation from a supported source record/status  |
| `GET /api/receipts/list`         | Authenticated staff history lookup                                    |
| `POST /api/receipts/share`       | Authenticated staff share audit update                                |
| `POST /api/receipts/verify`      | Public NADRA tracking/PIN verification with shared IP/tracking limits |
| `GET /api/admin/receipt-metrics` | Authorized admin metrics/backfill status                              |

Public verification intentionally returns `valid: false` for a mismatch and `supported: false` when the receipt schema/service is unavailable. It does not expose internal pricing, employee, or application data.

## Database setup

For an environment without the feature, run in order after review:

1. `scripts/bootstrap/create-generated-receipts-table.sql`
2. `scripts/manual/backfill-generated-receipts-share-columns.sql`

The backfill is idempotent. In Receipt Metrics verify `Null share_count rows` and `Null shared_via rows` are both zero. If the schema is absent or incompatible, receipt persistence/history/metrics return a supported/setup indication rather than fabricating records.

Optional branding and verification links are configured with `RECEIPT_COMPANY_NAME`, `RECEIPT_VERIFY_BASE_URL`, and the `NEXT_PUBLIC_RECEIPT_ADDRESS_LINE*` values in `.env.example`.

## Verification

The mutating smoke flow is `tests/smoke/receipt-flow.spec.ts`. It requires the normal smoke account/branch values plus `SMOKE_RECEIPT_NADRA_ID`; set `SMOKE_RUN_RECEIPT_MUTATION=true` deliberately for generation/share mutation. TOTP is preferred; a supplied backup code is single-use.

```bash
npm run test:smoke -- tests/smoke/receipt-flow.spec.ts
```

Focused source:

- UI: `app/dashboard/applications/components/ReceiptViewerModal.tsx` and `ReceiptHistoryModal.tsx`
- Routes: `app/api/receipts/` and `app/api/admin/receipt-metrics/`
- Generation/templates/store: `lib/services/receiptGenerator.ts`, `receiptTemplates.ts`, `receiptStore.ts`
- Configuration: `lib/constants/receiptConfig.ts`
