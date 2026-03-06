# Document Management System Guide

## Overview

The Document Management System provides a comprehensive solution for managing documents across different application types in the PT Portal. The system supports categorized uploads, document preview, and contextual organization based on application type.

**Current Status**: Frontend implementation complete with placeholder MinIO integration. Backend storage server to be connected in future updates.

---

## Table of Contents

1. [System Architecture](#system-architecture)
2. [Features](#features)
3. [Implementation Contexts](#implementation-contexts)
4. [User Interface Design](#user-interface-design)
5. [File Restrictions](#file-restrictions)
6. [Component Architecture](#component-architecture)
7. [API Endpoints](#api-endpoints)
8. [Database Schema](#database-schema)
9. [Future Enhancements](#future-enhancements)
10. [Development Notes](#development-notes)

---

## System Architecture

### Two-Tier Document Organization

The document management system operates in two distinct contexts:

#### 1. Family-Level Documents (NADRA Applications)
- **Scope**: Documents shared across a family group
- **Route**: `/dashboard/applications/nadra/documents/[familyHeadId]`
- **Use Case**: Family-wide documents like shared receipts, application reviews
- **Access Point**: "Manage Documents" button in family header row of NADRA ledger

#### 2. Per-Application Documents (Pakistani Passports)
- **Scope**: Documents specific to individual applications
- **Route**: `/dashboard/applications/passports/documents/[applicationId]`
- **Use Case**: Application-specific documents, individual receipts
- **Access Point**: Document icon button in actions column of passport applications table

### Storage Architecture (Placeholder)

```
MinIO S3-Compatible Storage
├── family-{familyHeadId}/
│   ├── general/
│   │   └── {timestamp}-{filename}
│   ├── receipt/
│   │   └── {timestamp}-{filename}
│   └── application-review/
│       └── {timestamp}-{filename}
└── application-{applicationId}/
    ├── general/
    ├── receipt/
    └── application-review/
```

**Note**: Current implementation uses placeholder paths. Actual MinIO backend integration pending.

---

## Features

### Document Categorization

Documents are organized into three categories:

1. **Main Documents** (General)
   - Default category for general application documents
   - Full-width upload section at top of pyramid layout
   - Examples: Signed forms, supporting documentation

2. **Receipts**
   - Financial receipts and payment confirmations
   - Left column in two-column layout
   - Examples: Payment receipts, transaction confirmations

3. **Application Review**
   - Review documents and status reports
   - Right column in two-column layout
   - Examples: Review notes, status updates, feedback documents

### File Type Restrictions

**Allowed File Types**:
- PDF documents (`.pdf`)
- Images: JPEG (`.jpg`, `.jpeg`), PNG (`.png`), WebP (`.webp`)

**Validation Levels**:
1. **Client-side**: File picker accept attribute + MIME type validation
2. **Service Layer**: MIME type checking before upload
3. **Server-side**: API route validates MIME types

**Rejected File Types**: All other formats including Word docs, Excel sheets, text files, etc.

### Document Preview System

#### Features
- **Image Preview**: Direct rendering with zoom controls
- **PDF Preview**: Embedded iframe with native browser PDF viewer
- **Protected Resource Handling**: Blob URL fetching with credentials for protected links
- **Zoom Controls**: In/Out/Reset for image previews
- **Quick Actions**: Download and delete from preview panel

#### Preview Panel Layout
```
┌─────────────────────────────┐
│  Document Preview           │
│  ───────────────────────    │
│                             │
│  [Image/PDF Display]        │
│                             │
│  Controls:                  │
│  🔍+ 🔍- 🔄 ⬇️ 🗑️           │
└─────────────────────────────┘
```

### Smart Thumbnail Generation

- Images: Automatic thumbnail generation
- PDFs: First page preview or document icon
- Click to select for full preview

---

## Implementation Contexts

### NADRA Family Documents

**Location**: `/app/dashboard/applications/nadra/`

**Key Files**:
- `components/LedgerTable.tsx` - Family header with sky-blue "Manage Documents" button
- `documents/[familyHeadId]/page.tsx` - Server component fetching family head data
- `components/DocumentHub/page.tsx` - Main document hub interface

**Data Flow**:
```
LedgerTable (Family Header Row)
  → Click "Manage Documents"
  → Navigate to /documents/[familyHeadId]
  → Server: Query applicants table for family head
  → Render DocumentHub with family context
  → Documents scoped to entire family
```

**UI Features**:
- Button Color: Sky blue (`bg-sky-600 hover:bg-sky-700`)
- Button Size: `text-xs px-3 py-1.5` (matches Add Member button)
- Button Icon: 📄 emoji prefix
- Callback: `onManageDocuments(familyHeadId, trackingNumber, applicantName)`

### Pakistani Passports Application Documents

**Location**: `/app/dashboard/applications/passports/`

**Key Files**:
- `components/RowItem.tsx` - Action buttons in vertical stack
- `client.tsx` - Navigation handler for document management
- `documents/[applicationId]/page.tsx` - Per-application document page

**Data Flow**:
```
RowItem (Application Row)
  → Click Document Icon Button
  → handleManageDocuments(applicationId)
  → Navigate to /documents/[applicationId]
  → Server: Query applications table
  → Render DocumentHub with custom subtitle
  → Documents scoped to single application
```

**UI Features**:
- Button Layout: Vertical stack (Edit on top, Document below)
- Button Styling: `bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded`
- Button Icon: 📄 emoji
- Custom Subtitle: Shows tracking number and applicant name

---

## User Interface Design

### Pyramid Layout Structure

The document management interface uses a pyramid structure for upload sections:

```
┌─────────────────────────────────────────────────┐
│          Main Documents (Full Width)            │
│         [Drag & Drop Upload Zone]               │
└─────────────────────────────────────────────────┘

┌─────────────────────────┬─────────────────────────┐
│  Receipts              │  Application Review     │
│  [Upload Zone]          │  [Upload Zone]          │
└─────────────────────────┴─────────────────────────┘
```

### Two-Column Desktop Layout

Desktop view uses a two-column grid:

```
┌──────────────────────────┬──────────────────────────┐
│  LEFT COLUMN             │  RIGHT COLUMN            │
│  ─────────────────────   │  ──────────────────────  │
│                          │                          │
│  • Upload Sections       │  • Document Preview      │
│    - Main Documents      │    - Selected doc        │
│    - Receipts            │    - Zoom controls       │
│    - Application Review  │    - Download/Delete     │
│                          │                          │
│  • Your Documents        │                          │
│    - Categorized grids   │                          │
│                          │                          │
│  • Storage Statistics    │                          │
│    - Total files         │                          │
│    - Storage used        │                          │
│                          │                          │
└──────────────────────────┴──────────────────────────┘
```

**Responsive Behavior**:
- Desktop (`lg:` breakpoint): Two columns
- Mobile/Tablet: Single column stack

### Upload Section Alignment

To ensure symmetric appearance:

**Header Alignment**:
- Fixed `min-h-[44px]` wrapper for title + description
- Fixed `min-h-[30px]` for description text
- Prevents height mismatch between Receipts and Application Review cards

**Visual Consistency**:
- Same border radius and shadow
- Consistent padding and spacing
- Aligned drag-and-drop zones

### Color Scheme

| Element | Color | Class |
|---------|-------|-------|
| NADRA Document Button | Sky Blue | `bg-sky-600 hover:bg-sky-700` |
| Passport Document Button | Blue | `bg-blue-600 hover:bg-blue-700` |
| Upload Zones (Active) | Sky Blue | `border-sky-400 bg-sky-50` |
| Upload Zones (Idle) | Gray | `border-gray-300 bg-gray-50` |

---

## File Restrictions

### Allowed MIME Types

Defined in multiple layers for security:

**Client Service** (`/lib/services/documentService.ts`):
```typescript
const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp'
];
```

**API Route** (`/app/api/documents/upload/route.ts`):
```typescript
const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp'
];
```

### File Picker Configuration

```tsx
<input
  type="file"
  accept=".pdf,.jpg,.jpeg,.png,.webp,image/*,application/pdf"
  multiple
/>
```

**Dual specification**:
- Extension list: `.pdf,.jpg,.jpeg,.png,.webp`
- MIME wildcards: `image/*,application/pdf`

### Validation Flow

1. **User selects file(s)** → File picker filters by accept attribute
2. **Client validation** → `documentService.ts` checks MIME types
3. **Upload request** → FormData sent to API
4. **Server validation** → API route validates MIME before storage
5. **Rejection** → User receives error message for invalid files

---

## Component Architecture

### DocumentHub (`/components/DocumentHub/page.tsx`)

**Main container component**:

```typescript
interface DocumentHubProps {
  familyHeadId: string;
  trackingNumber?: string;
  applicantName?: string;
  customSubtitle?: string;
}
```

**Key Features**:
- Manages document state and selection
- Coordinates upload/delete operations
- Provides context to child components
- Supports both family and application contexts via `customSubtitle`

**Layout Responsibility**:
- Two-column grid setup
- Component composition
- Responsive breakpoints

### DocumentUpload (`/components/DocumentHub/DocumentUpload.tsx`)

**Upload interface component**:

```typescript
interface DocumentUploadProps {
  familyHeadId: string;
  onUploadComplete: () => void;
  category?: 'receipt' | 'application-review' | 'general';
  compact?: boolean;
}
```

**Key Features**:
- Drag-and-drop file upload
- Category-based organization
- Compact mode for pyramid layout
- Multi-file support
- Progress indication
- File type validation

**Visual States**:
- Idle: Gray border with dashed outline
- Drag Over: Sky blue border with filled background
- Uploading: Progress indicator
- Error: Red border with error message

### DocumentGrid (`/components/DocumentHub/DocumentGrid.tsx`)

**Document display component**:

```typescript
interface DocumentGridProps {
  documents: Document[];
  onDocumentSelect: (document: Document) => void;
  selectedDocumentId?: string;
}
```

**Key Features**:
- Responsive grid layout
- Thumbnail display (direct `<img>` tags)
- Document metadata overlay
- Click to preview
- Visual selection state

**Grid Breakpoints**:
- Mobile: 2 columns
- Tablet (`sm:`): 3 columns
- Desktop (`md:`): 4 columns

### DocumentPreview (`/components/DocumentHub/DocumentPreview.tsx`)

**Preview panel component**:

```typescript
interface DocumentPreviewProps {
  document: Document;
  onClose: () => void;
  onDelete: (documentId: string) => void;
}
```

**Key Features**:
- Blob URL fetching for protected resources
- PDF iframe embedding
- Image zoom controls (zoom in/out/reset)
- Download functionality
- Delete confirmation
- Fallback handling for load errors

**Preview Strategy**:
```typescript
// Fetch with credentials to bypass CORS/protection
fetch(sourceUrl, { credentials: 'include' })
  .then(r => r.blob())
  .then(blob => URL.createObjectURL(blob))
  .catch(() => sourceUrl) // Fallback to direct URL
```

### MinioStatus (`/components/DocumentHub/MinioStatus.tsx`)

**Storage statistics component**:

```typescript
interface MinioStatusProps {
  familyHeadId: string;
}
```

**Key Features**:
- Total document count
- Storage size calculation
- Server connection status
- Last sync timestamp

**Note**: Currently shows placeholder data until MinIO backend connected.

---

## API Endpoints

All endpoints currently return placeholder data. Real MinIO integration pending.

### Upload Document

**Endpoint**: `POST /api/documents/upload`

**Request**:
```typescript
FormData {
  file: File,
  familyHeadId: string,
  category: 'general' | 'receipt' | 'application-review'
}
```

**Response**:
```typescript
{
  id: string,
  name: string,
  size: number,
  type: string,
  category: string,
  uploadedAt: string,
  minio: {
    bucket: string,
    key: string,
    url: string
  },
  preview?: {
    thumbnail: string
  }
}
```

**Validation**:
- File type must be PDF or image
- File size limits (to be implemented)
- Category must be valid enum value

### List Documents

**Endpoint**: `GET /api/documents/list?familyHeadId={id}&category={category}`

**Query Parameters**:
- `familyHeadId` (required): Family head or application ID
- `category` (optional): Filter by category

**Response**:
```typescript
{
  documents: Document[],
  total: number,
  storageUsed: number
}
```

### Delete Document

**Endpoint**: `DELETE /api/documents/delete`

**Request**:
```typescript
{
  documentId: string,
  familyHeadId: string
}
```

**Response**:
```typescript
{
  success: boolean,
  message: string
}
```

### Download Document

**Endpoint**: `GET /api/documents/download?documentId={id}`

**Response**: File stream with appropriate headers

---

## Database Schema

### Documents Table (Proposed)

```sql
CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  family_head_id UUID REFERENCES applicants(id),
  application_id UUID REFERENCES applications(id), -- For passport docs
  category VARCHAR(50) NOT NULL CHECK (category IN ('general', 'receipt', 'application-review')),
  
  -- File metadata
  filename VARCHAR(255) NOT NULL,
  original_filename VARCHAR(255) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  file_size BIGINT NOT NULL,
  
  -- MinIO storage
  minio_bucket VARCHAR(100) NOT NULL DEFAULT 'pt-portal-documents',
  minio_key VARCHAR(500) NOT NULL,
  minio_url TEXT,
  
  -- Thumbnails
  thumbnail_key VARCHAR(500),
  thumbnail_url TEXT,
  
  -- Metadata
  uploaded_by UUID REFERENCES auth.users(id),
  uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP WITH TIME ZONE, -- Soft delete
  
  -- Indexes
  CONSTRAINT documents_scope_check CHECK (
    (family_head_id IS NOT NULL AND application_id IS NULL) OR
    (family_head_id IS NULL AND application_id IS NOT NULL)
  )
);

-- Indexes for performance
CREATE INDEX idx_documents_family_head ON documents(family_head_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_documents_application ON documents(application_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_documents_category ON documents(category) WHERE deleted_at IS NULL;
CREATE INDEX idx_documents_uploaded_at ON documents(uploaded_at DESC);

-- RLS Policies
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

-- Users can only access documents for their assigned families/applications
CREATE POLICY documents_select_policy ON documents
  FOR SELECT
  USING (
    auth.uid() = uploaded_by OR
    family_head_id IN (SELECT id FROM applicants WHERE user_has_access(auth.uid())) OR
    application_id IN (SELECT id FROM applications WHERE user_has_access(auth.uid()))
  );

CREATE POLICY documents_insert_policy ON documents
  FOR INSERT
  WITH CHECK (auth.uid() = uploaded_by);

CREATE POLICY documents_delete_policy ON documents
  FOR DELETE
  USING (auth.uid() = uploaded_by OR user_is_admin(auth.uid()));
```

**Note**: Schema pending implementation. Helper functions like `user_has_access()` need to be created based on existing access control patterns.

---

## Future Enhancements

### Phase 1: MinIO Backend Integration

**Priority**: High  
**Status**: Pending

**Tasks**:
1. Set up MinIO server instance
2. Configure S3-compatible client in Next.js
3. Implement actual file upload to MinIO
4. Generate and store thumbnail images
5. Implement signed URL generation for secure downloads
6. Add file size limits and quota management

**Files to Update**:
- `/app/api/documents/upload/route.ts`
- `/app/api/documents/list/route.ts`
- `/app/api/documents/delete/route.ts`
- `/app/api/documents/download/route.ts`
- `/lib/services/documentService.ts`
- Create new `/lib/minio-client.ts`

### Phase 2: Database Integration

**Priority**: High  
**Status**: Pending

**Tasks**:
1. Create documents table in Supabase
2. Implement RLS policies
3. Create database triggers for soft deletes
4. Add audit logging for document operations
5. Implement document search functionality

### Phase 3: Advanced Features

**Priority**: Medium  
**Status**: Future

**Potential Features**:
- Document versioning
- Bulk upload with progress tracking
- Document sharing between applications
- OCR for scanned documents
- Document expiry dates and reminders
- Advanced search and filtering
- Document templates
- Automated document generation from form data
- Integration with email attachments
- Mobile app camera upload

### Phase 4: Security Enhancements

**Priority**: High  
**Status**: Future

**Tasks**:
- Virus scanning for uploaded files
- Encrypted storage at rest
- Audit trail for all document access
- Time-limited download links
- Watermarking for sensitive documents
- Two-factor authentication for document deletion

---

## Development Notes

### Known Limitations (Current Implementation)

1. **No Actual Storage**: Files not persisted, API returns mock data
2. **No Thumbnails**: Thumbnail generation not implemented
3. **No File Size Limits**: Validation needed before production
4. **No Quotas**: Storage quota management not implemented
5. **No Virus Scanning**: Security risk without antivirus checks
6. **Soft Deletes**: Not implemented; deletes would be permanent when backend added

### Browser Compatibility

**Tested Browsers**:
- Chrome/Edge (Chromium): Full support
- Firefox: Full support
- Safari: Full support (PDF preview may vary)

**Known Issues**:
- Safari may handle blob URLs differently for PDF previews
- Mobile browsers may require additional touch event handling

### Performance Considerations

**Optimizations Implemented**:
- Direct `<img>` tags instead of Next.js Image for thumbnails (faster)
- Blob URL caching for preview panel
- Lazy loading for document grids
- Debounced search/filter inputs

**Future Optimizations**:
- Virtual scrolling for large document lists
- Progressive image loading
- Server-side pagination
- CDN caching for static assets

### Accessibility

**Current Features**:
- Keyboard navigation support
- ARIA labels on interactive elements
- Focus management in modals
- Screen reader announcements

**To Improve**:
- Add skip links for document lists
- Improve color contrast ratios
- Add keyboard shortcuts documentation
- Better error message announcements

### Testing Strategy

**Recommended Tests**:

1. **Unit Tests**:
   - File type validation logic
   - MIME type checking
   - Category filtering
   - Preview URL generation

2. **Integration Tests**:
   - Upload workflow end-to-end
   - Delete confirmation flow
   - Preview panel interactions
   - Navigation between contexts

3. **E2E Tests**:
   - Complete document management flow in NADRA context
   - Complete document management flow in Passports context
   - Multi-file upload scenarios
   - Error handling and recovery

---

## Quick Reference

### Adding Document Management to New Module

**Step 1**: Add navigation button to your list component
```tsx
<button
  onClick={() => router.push(`/dashboard/your-module/documents/${itemId}`)}
  className="bg-sky-600 hover:bg-sky-700 text-white px-3 py-1.5 rounded"
>
  📄 Manage Documents
</button>
```

**Step 2**: Create document route page
```tsx
// /app/dashboard/your-module/documents/[itemId]/page.tsx
import DocumentHub from '@/app/dashboard/applications/nadra/components/DocumentHub/page';

export default async function DocumentsPage({ params }: { params: { itemId: string } }) {
  const { itemId } = params;
  
  // Fetch your item data
  const item = await getItemData(itemId);
  
  return (
    <DocumentHub
      familyHeadId={itemId}
      customSubtitle={`Documents for ${item.name}`}
    />
  );
}
```

**Step 3**: Update API routes to handle new context (when backend connected)

### Common File Paths

| Purpose | Path |
|---------|------|
| Document Hub Component | `/app/dashboard/applications/nadra/components/DocumentHub/page.tsx` |
| Upload Component | `/app/dashboard/applications/nadra/components/DocumentHub/DocumentUpload.tsx` |
| Preview Component | `/app/dashboard/applications/nadra/components/DocumentHub/DocumentPreview.tsx` |
| Grid Component | `/app/dashboard/applications/nadra/components/DocumentHub/DocumentGrid.tsx` |
| Stats Component | `/app/dashboard/applications/nadra/components/DocumentHub/MinioStatus.tsx` |
| Document Service | `/lib/services/documentService.ts` |
| Upload API | `/app/api/documents/upload/route.ts` |
| List API | `/app/api/documents/list/route.ts` |
| Delete API | `/app/api/documents/delete/route.ts` |
| NADRA Route | `/app/dashboard/applications/nadra/documents/[familyHeadId]/page.tsx` |
| Passports Route | `/app/dashboard/applications/passports/documents/[applicationId]/page.tsx` |

### Color Reference

```typescript
// NADRA Documents Button
className="bg-sky-600 hover:bg-sky-700 text-white"

// Passport Documents Button  
className="bg-blue-600 hover:bg-blue-700 text-white"

// Upload Zone Active
className="border-sky-400 bg-sky-50"

// Upload Zone Idle
className="border-gray-300 bg-gray-50"

// Delete Button
className="bg-red-600 hover:bg-red-700 text-white"

// Download Button
className="bg-green-600 hover:bg-green-700 text-white"
```

---

## Changelog

### Version 1.0.0 (Current - March 2026)

**Initial Implementation**:
- ✅ Document Hub component with two-column layout
- ✅ Categorized upload sections (Main, Receipts, Application Review)
- ✅ Pyramid layout structure
- ✅ File type restrictions (PDF and images only)
- ✅ Document preview with blob URL handling
- ✅ Family-level documents for NADRA applications
- ✅ Per-application documents for Pakistani Passports
- ✅ Vertical button stacking in passport actions
- ✅ Sky blue color scheme for NADRA buttons
- ✅ Responsive mobile/desktop layouts
- ✅ Placeholder MinIO integration

**Pending**:
- ⏳ MinIO backend server connection
- ⏳ Database schema implementation
- ⏳ Actual file persistence
- ⏳ Thumbnail generation
- ⏳ File size limits and quotas
- ⏳ Virus scanning

---

## Support & Maintenance

**Documentation Updates**: This guide will be updated when MinIO backend integration is completed.

**Related Documentation**:
- See `/Future Plans/MINIO_DOCUMENT_MANAGEMENT_PLAN.md` for backend planning
- See `/docs/guides/ARCHITECTURE_GUIDE.md` for overall system architecture
- See `/docs/guides/USAGE_GUIDE.md` for general usage patterns

**Last Updated**: March 6, 2026  
**Status**: Frontend Complete, Backend Pending  
**Maintainer**: PT Portal Development Team
