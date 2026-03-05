# DocumentHub - Document Management System

Complete document management interface for MinIO S3-compatible storage integration.

## 📦 Components

### 1. **MinioStatus** (`MinioStatus.tsx`)
Real-time connection status indicator for MinIO server.

**Features:**
- Live connection monitoring with automatic polling (30s interval)
- Ping/latency display
- Manual refresh button
- Compact and full view modes
- Connection state callback

**Usage:**
```tsx
import { MinioStatus } from '@/app/dashboard/applications/nadra/components/DocumentHub'

<MinioStatus 
  pollInterval={30000}
  compact={false}
  onStatusChange={(connected) => console.log('Status:', connected)}
/>
```

**Props:**
- `pollInterval?: number` - Polling interval in ms (default: 30000)
- `onStatusChange?: (connected: boolean) => void` - Status change callback
- `compact?: boolean` - Compact or full view (default: false)
- `className?: string` - Custom CSS

---

### 2. **DocumentUpload** (`DocumentUpload.tsx`)
Drag-and-drop file upload with validation and progress tracking.

**Features:**
- Drag-and-drop zone
- File browser picker
- Real-time upload progress
- File size validation (1.5 MB max)
- MIME type validation
- Error handling
- Multiple file upload support

**Usage:**
```tsx
import { DocumentUpload } from '@/app/dashboard/applications/nadra/components/DocumentHub'

<DocumentUpload 
  applicantId={applicantId}
  onSuccess={(docs) => console.log('Uploaded:', docs)}
  onError={(error) => console.log('Error:', error)}
  disabled={false}
/>
```

**Props:**
- `applicantId: string` - Applicant identifier (required)
- `onSuccess?: (documents: Document[]) => void` - Success callback
- `onError?: (error: string) => void` - Error callback
- `disabled?: boolean` - Disable uploads (default: false)
- `className?: string` - Custom CSS

---

### 3. **DocumentGrid** (`DocumentGrid.tsx`)
Responsive grid display of document thumbnails.

**Features:**
- Responsive grid layout (1-4 columns)
- Image preview thumbnails
- File type icons for non-images
- Metadata display (size, date)
- Hover actions (preview, download, delete)
- Skeleton loading state
- Empty state message

**Usage:**
```tsx
import { DocumentGrid } from '@/app/dashboard/applications/nadra/components/DocumentHub'

<DocumentGrid 
  documents={documents}
  isLoading={loading}
  onSelectDocument={(doc) => setSelected(doc)}
  onDelete={(id) => handleDelete(id)}
  onDownload={(id) => handleDownload(id)}
/>
```

**Props:**
- `documents: Document[]` - List of documents (required)
- `isLoading?: boolean` - Loading state (default: false)
- `onSelectDocument?: (document: Document) => void` - Selection callback
- `onDelete?: (documentId: string) => void` - Delete callback
- `onDownload?: (documentId: string) => void` - Download callback
- `className?: string` - Custom CSS

---

### 4. **DocumentPreview** (`DocumentPreview.tsx`)
Right-side panel for document preview and actions.

**Features:**
- Image preview with zoom control
- PDF preview placeholder (for full-page integration)
- File metadata display
- Download button
- Delete confirmation
- Responsive design
- File type-specific rendering

**Usage:**
```tsx
import { DocumentPreview } from '@/app/dashboard/applications/nadra/components/DocumentHub'

<DocumentPreview 
  document={selectedDocument}
  onClose={() => setSelected(null)}
  onDelete={(id) => handleDelete(id)}
  onDownload={(id) => handleDownload(id)}
/>
```

**Props:**
- `document: Document | null` - Document to preview (required)
- `onClose?: () => void` - Close callback
- `onDelete?: (documentId: string) => void` - Delete callback
- `onDownload?: (documentId: string) => void` - Download callback
- `className?: string` - Custom CSS

---

### 5. **DocumentHub** (`page.tsx`)
Main container component combining all features.

**Features:**
- Full document management interface
- 2-column layout (desktop) / single column (mobile)
- Upload section
- Document grid with filtering
- Preview panel
- Summary statistics
- Error handling
- Loading states

**Usage:**
```tsx
import { DocumentHub } from '@/app/dashboard/applications/nadra/components/DocumentHub'

<DocumentHub 
  applicantId={applicantId}
  applicantName="John Doe"
  showStatus={true}
/>
```

**Props:**
- `applicantId: string` - Applicant identifier (required)
- `applicantName?: string` - Applicant name for display (default: 'Applicant')
- `showStatus?: boolean` - Show MinIO status bar (default: true)
- `className?: string` - Custom CSS

---

## 🪝 Hooks

### `useMinioConnection`

Hook for managing MinIO connection status with auto-polling.

**Usage:**
```tsx
const { 
  status,              // MinioStatus object
  loading,             // boolean
  error,               // string | null
  connected,           // boolean
  ping,                // number | null (latency in ms)
  checkStatus,         // async function
  startPolling,        // function
  stopPolling,         // function
  refresh              // async function
} = useMinioConnection(30000, true)
```

**Parameters:**
- `pollInterval?: number` - Polling interval in ms (default: 30000)
- `autoStart?: boolean` - Auto-start polling on mount (default: true)

---

### `useMinioConnectionWithRetry`

Hook with automatic reconnection and exponential backoff.

**Usage:**
```tsx
const {
  // ... all useMinioConnection returns
  isRetrying,       // boolean
  retryCount,       // number
  maxRetries,       // number
  attemptReconnect, // function
  resetRetries,     // function
  canRetry          // boolean
} = useMinioConnectionWithRetry(3, 1000)
```

**Parameters:**
- `maxRetries?: number` - Maximum retry attempts (default: 3)
- `baseDelay?: number` - Base delay in ms (default: 1000)

---

## 📝 Types

All types are defined in `types.ts`:

```typescript
interface Document {
  id: string
  fileName: string
  fileSize: number
  fileType: string
  uploadedAt: string
  uploadedBy: string
  applicantId: string
  minio: {
    bucket: string
    key: string
    etag: string
  }
  preview?: {
    thumbnail?: string
    previewUrl?: string
  }
}

interface MinioStatus {
  connected: boolean
  ping?: number
  timestamp: string
  endpoint: string
  error?: string
}

interface UploadProgress {
  fileId: string
  fileName: string
  progress: number // 0-100
  status: 'pending' | 'uploading' | 'success' | 'error'
  error?: string
}
```

---

## 🔧 Service Layer

Document service provides all backend integration points:

```typescript
import { documentService } from '@/lib/services/documentService'

// Check MinIO status
const status = await documentService.checkMinioStatus()

// Upload document
const doc = await documentService.uploadDocument(file, applicantId)

// Get documents
const docs = await documentService.getDocuments(applicantId)

// Delete document
await documentService.deleteDocument(documentId)

// Download document
const blob = await documentService.downloadDocument(documentId)

// Validate file
const validation = documentService.validateFile(file)
```

---

## 🎯 Integration with Nadra Applications

To integrate DocumentHub into Nadra applications:

### 1. Import and Use in Nadra Page

```tsx
// app/dashboard/applications/nadra/[id]/documents/page.tsx
import { DocumentHub } from '@/app/dashboard/applications/nadra/components/DocumentHub'

export default function NadraDocumentsPage({ params }: { params: { id: string } }) {
  return (
    <DocumentHub 
      applicantId={params.id}
      applicantName="Applicant Name"
      showStatus={true}
    />
  )
}
```

### 2. Add Document Icon to Nadra Table

Add a column to the Nadra applications table that links to document hub:

```tsx
<button
  onClick={() => router.push(`/dashboard/applications/nadra/${applicantId}/documents`)}
  className="p-2 text-blue-600 hover:bg-blue-50 rounded"
  title="Manage documents"
>
  <FileText className="w-5 h-5" />
</button>
```

### 3. Add Route

Create a new route file at:
```
app/dashboard/applications/nadra/[id]/documents/page.tsx
```

---

## 🔐 Security Considerations

- **File Validation**: Frontend validates size and type; backend should validate again
- **Authentication**: Ensure user has access to requested applicant's documents
- **CORS**: Configure Caddy/MinIO CORS headers appropriately
- **Permissions**: Implement row-level security (RLS) in Supabase
- **Encryption**: Enable MinIO encryption at rest

---

## 🚀 Deployment Notes

### Environment Variables

```env
NEXT_PUBLIC_MINIO_ENDPOINT=https://minio.yourdomain.com
NEXT_PUBLIC_MINIO_BUCKET=nadra-documents
NEXT_PUBLIC_MINIO_ACCESS_KEY=minioadmin
NEXT_PUBLIC_API_URL=/api
MINIO_SECRET_KEY=changeme
MINIO_REGION=us-east-1
```

### Placeholder → Production

When backend is ready, replace placeholder implementations in:

1. **documentService.ts** - Replace placeholder methods with real API calls
2. **API routes** - Implement actual MinIO upload/download logic
3. **Thumbnail generation** - Implement in backend
4. **PDF preview** - Integrate `react-pdf` or backend rendering

---

## 📱 Responsive Design

| Breakpoint | Layout |
|-----------|--------|
| Mobile | Single column (100%) |
| Tablet | Single column with narrower preview |
| Desktop | 2-column (70% upload/grid, 30% preview) |

---

## 🧪 Testing

Test each component in isolation:

```tsx
// Test DocumentUpload
import { DocumentUpload } from '@/app/dashboard/applications/nadra/components/DocumentHub'

// Test MinioStatus
import { MinioStatus } from '@/app/dashboard/applications/nadra/components/DocumentHub'

// Test full integration
import DocumentHub from '@/app/dashboard/applications/nadra/components/DocumentHub'
```

---

## 📞 Support

For questions or issues, refer to the main plan document:
`/workspaces/pt-portal/Future Plans/MINIO_DOCUMENT_MANAGEMENT_PLAN.md`

---

**Last Updated**: March 5, 2026  
**Status**: Phase 2 Complete - Ready for Integration
