# Storage System

> PT-Portal dual-storage deep dive: MinIO primary + Cloudflare R2 fallback  
> Last updated: March 2026

---

## Table of Contents

1. [Overview](#overview)
2. [Server Configuration](#server-configuration)
3. [Client Singletons](#client-singletons)
4. [Upload Routing](#upload-routing)
5. [Read Routing (Preview & Download)](#read-routing-preview--download)
6. [Delete Routing](#delete-routing)
7. [Status Probing](#status-probing)
8. [Automatic Migration (R2 → MinIO)](#automatic-migration-r2--minio)
9. [UI State Mapping](#ui-state-mapping)
10. [Important Notes](#important-notes)

---

## Overview

The storage system uses two S3-compatible object stores in a primary/fallback arrangement:

- **Primary**: MinIO (EU Server 49v2) — all normal operations
- **Fallback**: Cloudflare R2 (EU Server 45v5) — activated automatically when MinIO is unreachable

Both stores are accessed via the AWS SDK v3 (`@aws-sdk/client-s3`). The object key schema is identical on both stores so files can be migrated transparently.

```
Normal operation:
  Upload → MinIO     Preview/Download → MinIO     Delete → MinIO

MinIO offline:
  Upload → R2        Preview/Download → R2 (+ bg migrate when MinIO returns)
```

---

## Server Configuration

| | MinIO (Primary) | R2 (Fallback) |
|---|---|---|
| Label | EU Server 49v2 | EU Server 45v5 |
| S3 Endpoint | `https://eu49v2.piyamtravel.com` | `https://<account-id>.r2.cloudflarestorage.com` |
| Display URL | — | `https://eu45v5.piyamtravel.com` |
| Region | `eu-west-1` | `auto` |
| Bucket | `portal-documents` | `portal-fallback` |
| Path style | `forcePathStyle: true` | `forcePathStyle: true` |
| TLS | Standard | Minimum TLS 1.2 |

> **Important**: `R2_ENDPOINT` must be the S3 API URL (`account-id.r2.cloudflarestorage.com`), not the custom domain. The custom domain (`eu45v5.piyamtravel.com`) only handles public HTTP reads — it cannot service S3 API operations like HeadBucket, PutObject, GetObject.

---

## Client Singletons

Both clients are module-level singletons in `lib/s3Client.ts` and `lib/r2Client.ts`. They are instantiated once per serverless worker lifecycle.

```typescript
// lib/s3Client.ts
let s3Client: S3Client | null = null
export function getS3Client(): S3Client { ... }

// lib/r2Client.ts
let r2Client: S3Client | null = null
export function getR2Client(): S3Client { ... }
export function isR2Configured(): boolean { ... }  // checks all 4 R2 env vars
```

`isR2Configured()` returns `false` if any of `R2_ENDPOINT`, `R2_ACCESS_KEY`, `R2_SECRET_KEY`, `R2_BUCKET_NAME` are missing — fallback is disabled silently in that case.

---

## Upload Routing

`POST /api/documents/upload-direct`

```
Parse multipart form (file + metadata)
│
├── Try: MinIO PutObjectCommand
│     ✓ → return { storageProvider: 'minio', storageBucket: 'portal-documents' }
│     ✗ → isR2Configured()?
│           No → 503 "Storage unavailable"
│           Yes → Try: R2 PutObjectCommand
│                   ✓ → return { storageProvider: 'r2', storageBucket: 'portal-fallback' }
│                   ✗ → 503 "Storage unavailable"
│
Client receives response → POST /api/documents (metadata)
  - minio_key: generated object key
  - minio_bucket: returned storageBucket
```

The object key format is: `family-{familyHeadId}/{Date.now()}-{filename}`

---

## Read Routing (Preview & Download)

`GET /api/documents/preview?key=<object-key>`  
`GET /api/documents/download?key=<object-key>`

Both routes stream bytes directly — no temporary files on the server.

```
Try: MinIO GetObjectCommand(key)
  ✓ → pipe Body stream to response (with cache headers)
  ✗ → Try: R2 GetObjectCommand(key)
        ✓ → pipe Body stream to response
            + void migrateObjectFromR2ToMinio(key)  ← non-blocking background task
        ✗ → 404
```

Cache headers on successful responses:
```
Cache-Control: public, max-age=31536000, immutable
```
This caches the file in the browser for 1 year. Since object keys include a timestamp, new uploads always get new keys and are never stale-served.

---

## Delete Routing

`DELETE /api/documents/[documentId]`

```
Lookup document in Supabase → get minio_key, minio_bucket

if minio_bucket === R2_BUCKET:
  Delete from R2
  Soft-delete in Supabase (deleted = true)
else:
  Delete from MinIO
  Best-effort R2 cleanup (in case file somehow exists in both)
  Soft-delete in Supabase
```

Deletes are soft in Supabase (`deleted = true`) — the record is preserved for audit purposes.

---

## Status Probing

`GET /api/documents/status`

Probes both servers in parallel:

```typescript
const [minio, r2] = await Promise.all([probeMinio(), probeR2()])
```

Each probe uses `HeadBucketCommand` wrapped in a **2,500 ms timeout** via `Promise.race`. This keeps the status endpoint fast even when a server is slow or hanging.

```
probeMinio(): HeadBucketCommand({ Bucket: 'portal-documents' })
probeR2():    HeadBucketCommand({ Bucket: 'portal-fallback' })
```

When **both are online**, a background batch migration is triggered:
```typescript
void migrateFallbackBatch(5)  // migrate up to 5 fallback files non-blocking
```

Response shape:
```json
{
  "status": {
    "connected": true,       // MinIO connected
    "ping": 42,              // MinIO RTT ms
    "mode": "primary",       // "primary" | "fallback-upload-only" | "offline"
    "endpoint": "https://eu49v2.piyamtravel.com",
    "fallback": {
      "configured": true,
      "connected": true,
      "endpoint": "https://eu45v5.piyamtravel.com",  // display URL
      "bucket": "portal-fallback",
      "ping": 110
    },
    "capabilities": {
      "upload": true,
      "previewDownload": true,
      "uploadOnlyFallback": false
    }
  }
}
```

The client polls this every 5 minutes via `useMinioConnection` hook.

---

## Automatic Migration (R2 → MinIO)

`lib/r2Migration.ts`

### Single-file migration

```typescript
migrateObjectFromR2ToMinio(key: string): Promise<boolean>
```

Steps (all-or-nothing):
1. `GetObjectCommand` from R2 — read full object bytes
2. `PutObjectCommand` to MinIO — write bytes with same ContentType
3. **Only if step 2 succeeded**: `DeleteObjectCommand` from R2
4. **Only if step 3 succeeded**: Update Supabase `documents` row:
   - `minio_bucket` → `portal-documents`
   - `minio_etag` → new ETag from MinIO

If any step fails, the function returns `false` and R2 still has the file — no data loss.

### Batch migration

```typescript
migrateFallbackBatch(limit: number = 5): Promise<{ attempted: number; migrated: number }>
```

Queries Supabase for documents where `minio_bucket = 'portal-fallback' AND deleted = false`, then runs `migrateObjectFromR2ToMinio` on each sequentially. Limit is capped between 1 and 50.

### Migration triggers summary

| When | Where | How many |
|---|---|---|
| File previewed/downloaded from R2 | `preview/route.ts`, `download/route.ts` | 1 file (background) |
| Status check with both servers online | `status/route.ts` | Up to 5 (background) |

---

## UI State Mapping

`app/dashboard/applications/nadra/components/DocumentHub/MinioStatus.tsx`

| `mode` | `connected` | `uploadOnlyFallback` | Banner colour | Badge | Message |
|---|---|---|---|---|---|
| `primary` | true | false | Green | "Ready" | "Document Storage Connected" |
| `fallback-upload-only` | false | true | Amber | "Upload-Only Mode" | "Primary Storage Offline • EU Server 45v5 Active" |
| `offline` | false | false | Red | "Unavailable" | "Document Storage Offline" |

---

## Important Notes

1. **Custom domain vs S3 API**: `eu45v5.piyamtravel.com` is a Cloudflare Custom Domain — it handles public HTTP reads only. All SDK operations (HeadBucket, PutObject, GetObject, DeleteObject) must use the R2 account-ID endpoint (`a09d97...r2.cloudflarestorage.com`).

2. **Checksums**: Both clients have `requestChecksumCalculation: 'WHEN_REQUIRED'` and `responseChecksumValidation: 'WHEN_REQUIRED'` to avoid AWS SDK v3 checksum overhead where not needed.

3. **Worker concurrency**: Singletons are module-level. In Vercel's serverless model each invocation may get a fresh cold-start (and a new singleton), but within a warm invocation the same client instance is reused.

4. **CORS**: On status check, if MinIO is online, `PutBucketCorsCommand` is sent to ensure CORS is configured. This is non-blocking.

5. **Upgrading pdfjs-dist**: After `npm install pdfjs-dist@<version>`, run:
   ```bash
   cp node_modules/pdfjs-dist/build/pdf.worker.min.mjs public/pdf.worker.min.mjs
   git add public/pdf.worker.min.mjs
   ```
