# NADRA Document Hub

This module provides the authenticated, family-scoped document workspace used by
`/dashboard/applications/nadra/documents/[familyHeadId]`. Documents are grouped
under the family head and organized as general documents, receipts, or
application-review files.

## Components

- `DocumentHub.tsx` composes uploads, categorized document grids, preview/download
  actions, deletion, pagination, storage status, and ZIP creation.
- `DocumentUpload` accepts `familyHeadId`, an optional category, callbacks, and
  display options. It supports drag-and-drop, progress, and retrying failed
  uploads.
- `DocumentGrid` renders document cards and delegates preview, download, and
  deletion actions.
- `DocumentPreview` displays the selected document and its available actions.
- `MinioStatus` reports primary/fallback storage capabilities. It checks every
  five minutes by default and also supports manual refresh.

The barrel in `index.ts` exports the components and their shared types.

## Usage

```tsx
import { DocumentHub } from '@/app/dashboard/applications/nadra/components/DocumentHub'
;<DocumentHub
  familyHeadId={familyHeadId}
  familyHeadName={familyHeadName}
  showStatus
  zipFileName={trackingNumber || familyHeadId}
/>
```

`DocumentHub` also accepts `customSubtitle` and `className`. Route-specific
headers, breadcrumbs, and back links belong to the surrounding page.

## Upload and security contract

- Files are limited to 1.5 MB and to PDF, JPEG, PNG, or WebP.
- Browser validation is only an early usability check. The authenticated API
  repeats size, MIME, extension, and file-signature validation.
- The server owns storage credentials, object keys, metadata, and authorization;
  no MinIO access keys or presigned credentials are exposed to this module.
- Reads, downloads, deletes, and ZIP creation use same-origin document IDs and
  family/application scope checks.
- Storage polling defaults to 300,000 ms to avoid unnecessary API traffic.

For API contracts, storage behavior, environment variables, migrations, and
operational guidance, see the
[Document Management Guide](../../../../../../docs/guides/DOCUMENT_MANAGEMENT_GUIDE.md).
