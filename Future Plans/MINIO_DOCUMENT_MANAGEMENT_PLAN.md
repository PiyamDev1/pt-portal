# MinIO Document Management Integration Plan

**Status**: Planning Phase  
**Created**: March 5, 2026  
**Target Module**: Nadra Applications  

---

## 📋 Executive Summary

Integrate MinIO S3-compatible object storage with Caddy reverse proxy to enable document management for Nadra applications. Users will upload documents (max 1.5 MB), view thumbnails, and preview files on-demand. The architecture uses placeholder methods to decouple frontend from backend, allowing easy integration when the server is ready.

---

## 🎯 User Requirements

### Core Features (MVP)
1. **Document Icon** - Add document/file icon next to family head in Nadra table
2. **Document Hub Page** - Dedicated page for managing documents per applicant
3. **MinIO Connection Status** - Display real-time connectivity to MinIO server
4. **Multiple File Upload** - Drag-and-drop or file picker for batch uploads
5. **File Size Validation** - Enforce 1.5 MB max per file
6. **Thumbnail Preview** - Grid view of uploaded documents with thumbnails
7. **Document Preview** - Right-side panel showing full document preview
8. **File Metadata** - Display file name, size, upload date, type

### Non-MVP Features (Future)
- File categorization/tagging
- Document sharing/permissions
- Audit trail/versioning
- Full-text search across documents
- OCR integration
- API integration with external services

---

## 🏗️ Architecture Overview

### Component Structure

```
dashboard/applications/nadra/
├── page.tsx (add Document icon to table header)
├── client.tsx (update table to include document action)
├── components/
│   ├── NadraTable.tsx (add Document icon column)
│   └── new-folder: DocumentHub/
│       ├── page.tsx (main document management page)
│       ├── layout.tsx (layout with preview panel)
│       ├── DocumentGrid.tsx (thumbnail grid view)
│       ├── DocumentPreview.tsx (right-side preview panel)
│       ├── DocumentUpload.tsx (drag-drop uploader)
│       ├── MinioStatus.tsx (connection status component)
│       └── types.ts (TypeScript definitions)
```

### Technology Stack
- **Frontend Framework**: Next.js 14.2 + React 18.x
- **Styling**: Tailwind CSS
- **State Management**: React hooks + Context API
- **File Preview**: 
  - Images: Native `<img>` preview
  - PDFs: `react-pdf` library
  - Documents: File icon with download option
- **API Communication**: Fetch API with placeholder service layer
- **Storage Backend**: MinIO (S3-compatible)
- **Reverse Proxy**: Caddy (for proxying MinIO API)

---

## 📐 Detailed Implementation Plan

### Phase 1: Foundation Setup (Days 1-2)

#### 1.1 Create Type Definitions
**File**: `app/dashboard/applications/nadra/components/DocumentHub/types.ts`

```typescript
// Document-related types
export interface Document {
  id: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  uploadedAt: string;
  uploadedBy: string;
  applicantId: string;
  minio: {
    bucket: string;
    key: string;
    etag: string;
  };
  preview?: {
    thumbnail?: string;
    previewUrl?: string;
  };
}

export interface MinioConfig {
  endpoint: string;
  accessKey: string;
  secretKey: string;
  bucket: string;
  region: string;
}

export interface UploadProgress {
  fileId: string;
  fileName: string;
  progress: number; // 0-100
  status: 'pending' | 'uploading' | 'success' | 'error';
  error?: string;
}

export interface MinioStatus {
  connected: boolean;
  ping?: number; // latency in ms
  timestamp: string;
  error?: string;
}

export interface DocumentCategory {
  id: string;
  name: string;
  icon: string;
  color: string;
}
```

#### 1.2 Create Placeholder Service Layer
**File**: `lib/services/documentService.ts`

This service will wrap all MinIO interactions with placeholder methods, allowing easy swapping to real implementations.

```typescript
interface DocumentService {
  // Connection
  checkMinioStatus(): Promise<MinioStatus>;
  pingMinioServer(endpoint: string): Promise<number>;

  // Document Operations
  uploadDocument(file: File, applicantId: string): Promise<Document>;
  uploadMultipleDocuments(files: File[], applicantId: string): Promise<Document[]>;
  getDocuments(applicantId: string): Promise<Document[]>;
  deleteDocument(documentId: string): Promise<void>;
  downloadDocument(documentId: string): Promise<Blob>;

  // Preview
  generateThumbnail(document: Document): Promise<string>;
  getPreviewUrl(document: Document): Promise<string>;

  // Configuration
  getMinioConfig(): Promise<MinioConfig>;
  validateFileSize(file: File): { valid: boolean; error?: string };
}

export const documentService: DocumentService = {
  // Placeholder implementations
}
```

#### 1.3 Create MinIO Connection Hook
**File**: `app/hooks/useMinioConnection.ts`

```typescript
export const useMinioConnection = () => {
  const [status, setStatus] = useState<MinioStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkStatus = useCallback(async () => {
    // Will ping MinIO server and update status
  }, []);

  useEffect(() => {
    // Check status on mount and every 30 seconds
  }, []);

  return { status, loading, error, checkStatus };
};
```

---

### Phase 2: UI Components (Days 3-4)

#### 2.1 MinIO Status Component
**File**: `app/dashboard/applications/nadra/components/DocumentHub/MinioStatus.tsx`

```
Display:
- Green/Red indicator + connection status
- IP address of MinIO server
- Latency/ping time
- Last checked timestamp
- Manual refresh button
```

#### 2.2 Document Upload Component
**File**: `app/dashboard/applications/nadra/components/DocumentHub/DocumentUpload.tsx`

```
Features:
- Drag-and-drop zone with visual feedback
- Click to browse file picker
- File type filtering (.pdf, .jpg, .png, .doc, .docx)
- Real-time upload progress bars (per file)
- File size validation (< 1.5 MB) with error messages
- Cancel upload button
- Error handling and retry logic
```

#### 2.3 Document Grid Component
**File**: `app/dashboard/applications/nadra/components/DocumentHub/DocumentGrid.tsx`

```
Display:
- Grid layout (responsive: 1-4 columns)
- Document thumbnail images
- File type icons for non-image files
- File name (truncated with tooltip)
- File size
- Upload date
- Hover actions: Delete, Download, Preview
- Loading placeholders
```

#### 2.4 Document Preview Component
**File**: `app/dashboard/applications/nadra/components/DocumentHub/DocumentPreview.tsx`

```
Right-side Panel:
- Document title and metadata
- File size and type
- Upload date and user
- Preview area:
  - Images: Zoomable preview
  - PDFs: react-pdf with page navigation
  - Other files: Icon with download link
- Action buttons: Download, Delete, Share (if applicable)
```

#### 2.5 Document Hub Page Layout
**File**: `app/dashboard/applications/nadra/components/DocumentHub/page.tsx`

```
Layout:
- Header: Breadcrumb + Applicant info
- MinIO Status bar (top)
- Main container (2-column):
  - Left: Upload zone + Grid (70%)
  - Right: Document preview panel (30%)
- Responsive: Single column on mobile
```

---

### Phase 3: Integration (Days 5-6)

#### 3.1 Update Nadra Applications Page
**File**: `app/dashboard/applications/nadra/page.tsx`

- Add routing to document hub page
- Pass applicant context to document component

#### 3.2 Add Document Icon to Table
**File**: `app/dashboard/applications/nadra/components/NadraTable.tsx`

- New column with document icon
- Click handler to navigate to document hub with applicant ID
- Badge showing document count (optional)

#### 3.3 Create Route Handler for Placeholder API
**File**: `app/api/documents/[action].ts`

Placeholder endpoints that will be connected to real backend:
- `GET /api/documents/status` - MinIO connection status
- `POST /api/documents/upload` - Upload document
- `GET /api/documents/:applicantId` - List documents
- `DELETE /api/documents/:documentId` - Delete document
- `GET /api/documents/:documentId/download` - Download document

---

### Phase 4: Polish & Testing (Days 7-8)

#### 4.1 Error Handling
- Network errors
- File upload failures
- Preview generation failures
- MinIO connection timeouts

#### 4.2 Loading States
- Skeleton loaders for thumbnails
- Progress indicators for uploads
- Shimmer effects for grid

#### 4.3 Accessibility
- ARIA labels on all interactive elements
- Keyboard navigation
- Alt text for images
- Screen reader support

#### 4.4 Testing Strategy
- Unit tests for service layer
- Component tests for UI elements
- Integration tests for upload flow
- E2E tests for complete user journey

---

## 🔌 API Contract (Placeholder)

### Upload Endpoint
```typescript
POST /api/documents/upload
Content-Type: multipart/form-data

Request:
- file: File
- applicantId: string

Response:
{
  success: boolean,
  document: {
    id: string,
    fileName: string,
    fileSize: number,
    uploadedAt: string,
    minio: { bucket, key, etag }
  },
  error?: string
}
```

### Status Endpoint
```typescript
GET /api/documents/status

Response:
{
  connected: boolean,
  ping: number,
  endpoint: string,
  timestamp: string,
  error?: string
}
```

### List Documents Endpoint
```typescript
GET /api/documents?applicantId=ID

Response:
{
  documents: Document[],
  totalSize: number,
  count: number
}
```

---

## 🚀 Implementation Workflow

### Step-by-Step Execution

1. **Create types and interfaces** (Day 1 morning)
2. **Build service layer** with placeholder methods (Day 1)
3. **Create reusable components** (Day 2-3)
4. **Build document management page** (Day 3-4)
5. **Integrate with Nadra table** (Day 5)
6. **Add styling and polish** (Day 6)
7. **Testing and bug fixes** (Day 7-8)

### Key Decisions

- **Storage**: MinIO buckets will be organized by applicant ID
- **Naming Convention**: `applicant-{id}/{timestamp}-{filename}`
- **Validation**: Frontend size check + backend validation
- **Permissions**: Document access tied to applicant's employee/manager
- **Caching**: Browser cache for thumbnails, ISR for document list

---

## 🔒 Security Considerations

- **File Upload Validation**
  - MIME type checking (frontend + backend)
  - File size limits (1.5 MB)
  - Virus scanning (future integration)
  - Filename sanitization

- **Access Control**
  - Only employees with right role can upload/view documents
  - Row-level security (RLS) in Supabase for document metadata
  - Caddy authentication for MinIO endpoints

- **Data Privacy**
  - Documents encrypted at rest (MinIO option)
  - HTTPS-only communication
  - Audit logging for all document operations
  - GDPR compliance for document deletion

---

## 📦 Dependencies to Install

```json
{
  "react-pdf": "^7.0.0",
  "react-dropzone": "^14.0.0",
  "zustand": "^4.0.0",
  "react-hot-toast": "^2.4.1"
}
```

---

## 🛠️ Configuration Files

### MinIO Configuration (Environment Variables)
```env
NEXT_PUBLIC_MINIO_ENDPOINT=https://minio.yourdomain.com
NEXT_PUBLIC_MINIO_BUCKET=nadra-documents
MINIO_ROOT_USER=minioadmin
MINIO_ROOT_PASSWORD=changeme
MINIO_REGION=us-east-1
MINIO_PING_INTERVAL=30000
```

### Caddy Configuration (Example)
```caddy
https://minio.yourdomain.com {
  reverse_proxy * http://minio-container:9000 {
    header_up Host {upstream_hostport}
  }
  
  # CORS headers
  @cors_preflight method OPTIONS
  header @cors_preflight Access-Control-Allow-Origin "*"
  header @cors_preflight Access-Control-Allow-Methods "*"
  header @cors_preflight Access-Control-Allow-Headers "*"
}
```

---

## 📊 Database Schema (Supabase)

### Documents Table
```sql
CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  applicant_id UUID NOT NULL REFERENCES applicants(id),
  file_name VARCHAR NOT NULL,
  file_size INTEGER NOT NULL,
  file_type VARCHAR,
  minio_bucket VARCHAR NOT NULL,
  minio_key VARCHAR NOT NULL,
  minio_etag VARCHAR,
  uploaded_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  is_deleted BOOLEAN DEFAULT FALSE,
  
  CONSTRAINT file_size_check CHECK (file_size <= 1500000)
);

CREATE INDEX idx_documents_applicant_id ON documents(applicant_id);
CREATE INDEX idx_documents_created_at ON documents(created_at DESC);
```

### Document Previews Table (Cache)
```sql
CREATE TABLE document_previews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES documents(id),
  preview_type VARCHAR, -- 'thumbnail', 'full'
  preview_url VARCHAR,
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP
);
```

---

## ✅ Success Criteria

- [x] Architecture document created and approved
- [ ] All components built and tested
- [ ] Upload functionality works with placeholder API
- [ ] MinIO status checking functional
- [ ] Thumbnail generation for common file types
- [ ] Document preview working for PDFs and images
- [ ] Responsive design works on mobile/tablet
- [ ] Accessibility audit passes
- [ ] Performance: Upload < 2s per file (1.5 MB), Preview load < 1s
- [ ] Error handling for all failure scenarios
- [ ] Ready for server integration without frontend changes

---

## 🔄 Integration Checklist (For When Server is Ready)

When your network engineer completes the MinIO VM setup, follow this checklist:

- [ ] Update `NEXT_PUBLIC_MINIO_ENDPOINT` with actual VM IP/domain
- [ ] Configure Caddy reverse proxy with MinIO backend
- [ ] Implement actual service methods in `documentService.ts`
- [ ] Connect placeholder API routes to real backend
- [ ] Set up authentication/CORS between frontend and MinIO
- [ ] Test file upload/download with real storage
- [ ] Configure SSL/TLS certificates for secure communication
- [ ] Set up automated backup strategy for MinIO
- [ ] Implement audit logging
- [ ] Performance testing with real-world document sizes

---

## 📝 Notes & Considerations

- The placeholder service layer allows frontend development to proceed independently
- Document preview generation can be offloaded to backend for performance
- Consider implementing Web Workers for thumbnail generation
- Caching strategy needed for frequently accessed documents
- Rate limiting for upload endpoint to prevent abuse
- Consider implementing document versioning later
- Document compression could reduce storage needs (future optimization)

---

## 📞 Question for Network Engineer

When VM is ready, confirm:
1. MinIO endpoint URL/IP address
2. Whether Caddy is set up as reverse proxy
3. SSL certificate setup
4. MinIO bucket name(s) structure
5. Access credentials (principal/secret)
6. Network latency expectations
7. Backup/disaster recovery plan

---

**Last Updated**: March 5, 2026  
**Next Steps**: Team review → Phase 1 implementation start
