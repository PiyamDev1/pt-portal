# Document Management Guide

Last verified against the repository: August 12, 2026.

PT-Portal has two related private-document systems:

- the application document vault shared by NADRA families, submitted applications, and pre-tracking Pakistani passport drafts; and
- travel-package documents, which have their own categories, customer release workflow, and optional backup provider.

This guide covers the application vault. Package-specific rules are in [Travel Packages](TRAVEL_PACKAGES_GUIDE.md).

## Where it is used

The shared `DocumentHub` UI is mounted at:

- `/dashboard/applications/nadra/documents/[familyHeadId]`;
- `/dashboard/applications/passports/documents/[applicationId]`; and
- `/dashboard/applications/passports/drafts/[draftId]/documents`.

The scope ID must resolve server-side to an `applicants.id`, `applications.id`, or `pakistani_passport_drafts.draft_id`. Being authenticated is not enough to create an arbitrary storage prefix.

## Operator workflow

1. Open document management from the relevant family/application/draft.
2. Upload one or more supported files into General, Receipt, or Application Review.
3. Preview or download from the database-backed document entry.
4. Delete only after confirming in the app-native dialog. Deletion is logical in the database and removes the resolved object; if storage deletion fails, the route restores the live record.
5. Optionally generate a ZIP. The UI reports `none`, `ready`, or `stale`; upload/delete changes make the previous archive stale.

The document hub lists 20 records at a time and can load more. Storage status polls every five minutes and supports manual refresh.

## Upload contract

`POST /api/documents/upload-direct` owns both object upload and metadata persistence. Presigned browser upload and standalone metadata creation are disabled with `410 Gone` so the server can validate the bytes and clean up partial work.

| Constraint         | Contract                                                                 |
| ------------------ | ------------------------------------------------------------------------ |
| Authentication     | Verified active staff session                                            |
| Abuse limit        | 20 uploads per user/IP per 10 minutes                                    |
| File size          | Maximum 1,500,000 bytes (displayed as 1.5 MB)                            |
| Types              | PDF, JPEG, PNG, WebP                                                     |
| Categories         | `general`, `receipt`, `application-review`                               |
| Scope              | Existing applicant, application, or passport draft                       |
| Content validation | Safe filename plus matching extension, declared MIME, and file signature |

The multipart parser stops reading when the body limit is exceeded. Browser image compression may bring supported images under the limit; oversized PDFs must be reduced before upload.

The object key is server-generated under:

```text
family-{scopeId}/{category}/{documentId}-{sanitizedFileName}
```

MinIO is attempted first. When private R2 fallback is fully configured, an unavailable MinIO write can fall back to R2. Only after the object succeeds does the server insert the `documents` row. A failed metadata insert triggers best-effort object cleanup and an operational event.

## Read and download security

Every preview, download, signed URL, thumbnail, delete, list, and ZIP request requires a verified staff session. The route resolves a live, non-deleted database record before using its bucket/key. Compatibility `key` query parameters cannot read arbitrary object-store paths because the key must first match a live record.

Preferred endpoints use document IDs:

- `GET /api/documents/[documentId]/preview` returns a signed preview URL;
- `GET /api/documents/[documentId]/download` redirects to a signed attachment URL;
- `GET /api/documents/[documentId]/thumbnail` returns a signed thumbnail URL; and
- `DELETE /api/documents/[documentId]` revokes/removes the document.

Signed URLs last at most ten minutes. Compatibility stream routes return private/no-store responses, safe content disposition, `nosniff`, no-referrer, and a sandbox CSP for previews.

## ZIP archives

`POST /api/documents/zip` creates an archive from the current live records, writes it to primary/fallback storage, and records it as an internal `zip-archive` document. The archive is excluded from normal listings.

Limits:

- at most 200 source documents;
- at most 100 MB total declared source size; and
- up to 60 seconds server execution.

`GET /api/documents/zip?familyHeadId=...` compares the stored document count with the current count. `/api/documents/download-all` is retired and returns `410`.

## Storage status and migration

`GET /api/documents/status` checks MinIO and optional R2 in parallel with a 2.5-second timeout per probe. It returns:

- `primary`: MinIO is available;
- `fallback-upload-only`: MinIO is unavailable and R2 can accept uploads; or
- `offline`: neither write path is available.

When both stores are healthy, the status route can trigger a small background fallback-to-primary batch. The scheduled workflow calls `/api/documents/migrate-scheduled` every ten minutes using `DOCUMENT_MIGRATION_CRON_TOKEN`; it is not a browser/staff-session endpoint. Maintenance staff can inspect and manually trigger bounded work through `/api/documents/migration-overview`.

Migration copies R2 to MinIO, then deletes the R2 object, then updates the database bucket/ETag. A failure leaves/reports the fallback record for retry. See [Storage System](../technical/STORAGE_SYSTEM.md) for the detailed provider contract.

## Database record

`documents` stores the document ID, original name/type/size, category, scope (`family_head_id`), uploader/timestamps, storage bucket/key/ETag, and logical deletion state. The object store is not the authorization database.

The foundational schema is in `scripts/migrations/20260310_create_documents_table.sql`; migration-run observability is in `20260311_create_document_migration_runs.sql`. Supporting indexes live in `scripts/bootstrap/create-indexes.sql` and must be verified against the deployed schema before manual application.

## Configuration

Primary storage:

- `MINIO_ENDPOINT`
- `MINIO_ACCESS_KEY`
- `MINIO_SECRET_KEY`
- `MINIO_BUCKET_NAME`
- `NEXT_PUBLIC_MINIO_ENDPOINT` (display/health label only)

Optional private fallback and worker:

- `R2_ENDPOINT`, `R2_ACCESS_KEY`, `R2_SECRET_KEY`, `R2_BUCKET_NAME`
- `DOCUMENT_MIGRATION_CRON_TOKEN`

Do not expose object-store credentials or the migration token through `NEXT_PUBLIC_*`. `R2_ENDPOINT` must be the S3 API endpoint, not a public custom-domain URL.

## PDF previews

PDF thumbnails use the checked-in `public/pdf.worker.min.mjs` from `pdfjs-dist`. After changing that dependency run:

```bash
npm run sync:pdf-worker
```

The worker sync also runs after normal dependency installation.

## Main source and tests

- UI: `app/dashboard/applications/nadra/components/DocumentHub/`
- Routes: `app/api/documents/`
- Access/validation: `lib/documentAccess.ts`, `lib/documentSecurity.ts`, `lib/documentConstraints.ts`
- Server object resolution: `lib/services/documentServer.ts`
- Client orchestration: `lib/services/documentService.ts`
- Provider health/migration: `lib/documentStorageStatus.ts`, `lib/r2Migration.ts`
- Focused tests: `tests/unit/document*.test.ts` and `tests/unit/documents*.test.ts`
- Live check: `tests/smoke/document-storage.spec.ts`
