# Storage System

Last verified against the repository: August 12, 2026.

## Provider map

| Domain                            | Primary                                    | Secondary                                     | Database authority                                  |
| --------------------------------- | ------------------------------------------ | --------------------------------------------- | --------------------------------------------------- |
| Application document vault        | Private MinIO `MINIO_BUCKET_NAME`          | Optional private R2 `R2_BUCKET_NAME` fallback | `documents`                                         |
| Travel-package documents/vouchers | Private MinIO `MINIO_PACKAGES_BUCKET_NAME` | Optional R3-compatible backup copy            | `travel_package_documents` / voucher/version tables |
| Issue-report artifacts            | Server storage helper                      | Provider/config dependent                     | issue-report artifact records                       |

Object keys and buckets locate data; they do not authorize a caller. A route must resolve an allowed database record or a valid scoped public share before accessing the provider.

## Clients and credentials

`lib/s3Client.ts` provides the server-only MinIO singleton. `lib/r2Client.ts` provides the optional application-vault fallback and reports configured only when all required R2 values exist. Package backup clients are built by `lib/packageIntegrations.ts` from `R3_*`.

Credentials and bucket-write APIs remain server-side. The only browser-visible storage variable is `NEXT_PUBLIC_MINIO_ENDPOINT`, used for display/connection context rather than credentials or authorization.

## Application document writes

The supported flow is:

```text
verified active staff
  -> bounded multipart stream
  -> existing application/applicant/draft scope
  -> safe name + size + MIME + extension + signature checks
  -> MinIO put, or private R2 fallback put
  -> documents metadata insert
  -> delete written object if metadata insert fails
```

`/api/documents/upload` (presigned browser PUT) and `POST /api/documents` (standalone metadata) return `410`. This prevents unverified browser bytes and caller-selected object metadata from becoming trusted records.

## Application document reads

Document-ID routes and compatibility streams call `lib/services/documentServer.ts`:

1. resolve a live, non-deleted `documents` row;
2. validate the stored scope/key prefix;
3. choose the recorded bucket/provider; and
4. create a short-lived signed URL or stream the exact record.

When a row points at primary storage but MinIO read fails, the server may read the matching R2 copy and start a best-effort background migration. Responses containing private metadata, streams, or signed URLs are non-cacheable.

Deletion marks the row deleted before object removal so new reads stop. If provider deletion fails, the route restores the live record. A successful deletion may also best-effort remove a duplicate fallback copy.

## Fallback health and migration

`getDocumentStorageStatus()` probes both buckets with `HeadBucket` and a 2.5-second timeout. Its capability flags distinguish primary read/write availability from fallback upload-only mode.

Fallback migration is ordered to avoid intentional data loss:

1. read the R2 object;
2. write the same key/content type to MinIO;
3. delete the R2 object after the primary write succeeds; and
4. update the live database record's bucket and ETag.

The migration returns failure and records an event when any step throws. Persistent events are preferred for the maintenance overview; in-process metrics are a fallback view only.

Triggers:

- background single-file migration after a fallback read;
- up to five records after an authenticated status check when both stores are healthy;
- scheduled batches (default 30, effective maximum 50) through the cron-token endpoint; and
- maintenance-authorized manual batches (maximum 50).

The GitHub workflow calls the scheduled endpoint every ten minutes and requires `APP_BASE_URL` plus `DOCUMENT_MIGRATION_CRON_TOKEN` repository secrets.

## Package storage

Package uploads use the same 1.5 MB PDF/image content validation but a separate package bucket/prefix. When R3 backup is configured, the upload writes the primary object first and then attempts the backup. Backup state/error is persisted in the package document record. A metadata insert failure removes successful primary/backup writes best-effort and emits an operational alert if cleanup is incomplete.

Customer access never exposes the whole bucket. Released document records receive 15-minute signed preview/download URLs through an enabled, unexpired package access token. Third-party links additionally require the separate access code, accepted terms, an allowed category, and an active expiry/revocation state.

## Security properties

- Provider endpoints are not access-control checks.
- Service-role and storage credentials never use `NEXT_PUBLIC_*`.
- Filenames are sanitized to one safe segment.
- Upload bytes, declared type, extension, and magic signature must agree.
- Signed URLs are short-lived and responses are private/no-store.
- Legacy object-key reads must resolve a live database record first.
- Internal package categories/cost data are never made public by provider configuration.
- Important storage failures use correlated, redacted operational events.

## Configuration

Use `.env.example` as the authoritative variable list. Important groups are `MINIO_*`, optional `R2_*`, `DOCUMENT_MIGRATION_CRON_TOKEN`, `MINIO_PACKAGES_BUCKET_NAME`, and optional `R3_*`.

After changing `pdfjs-dist`, synchronize the local worker:

```bash
npm run sync:pdf-worker
```

See [Document Management](../guides/DOCUMENT_MANAGEMENT_GUIDE.md), [Travel Packages](../guides/TRAVEL_PACKAGES_GUIDE.md), and [Security](SECURITY.md).
