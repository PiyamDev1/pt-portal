# MinIO Backend Integration Guide

Quick reference for completing the MinIO integration when the VM is ready.

## 📋 Pre-Implementation Checklist

- [ ] MinIO VM is running
- [ ] Network engineer provides:
  - [ ] MinIO endpoint URL/IP
  - [ ] Access credentials (access key, secret key)
  - [ ] Bucket name(s)
  - [ ] Region
  - [ ] SSL certificate status
  - [ ] Caddy reverse proxy configured
    
## 🔧 Step 1: Update Environment Variables

Create `.env.local` or update your deployment configuration:

```env
# MinIO Configuration
NEXT_PUBLIC_MINIO_ENDPOINT=https://minio.yourdomain.com  # From network engineer
NEXT_PUBLIC_MINIO_BUCKET=nadra-documents
NEXT_PUBLIC_MINIO_ACCESS_KEY=minioadmin
MINIO_ROOT_USER=minioadmin  # From network engineer
MINIO_REGION=us-east-1  # From network engineer
MINIO_SECRET_KEY=your-secret-key  # From network engineer

# API Configuration
NEXT_PUBLIC_API_URL=https://yourdomain.com/api
```

## 📦 Step 2: Install MinIO Client Library

Install the official MinIO SDK for Node.js:

```bash
npm install minio
```

Add types:
```bash
npm install --save-dev @types/minio
```

## 🔌 Step 3: Implement Upload Handler

**File**: `app/api/documents/upload/route.ts`

Replace placeholder with real implementation:

```typescript
import { Client } from 'minio'
import { NextRequest, NextResponse } from 'next/server'

const minioClient = new Client({
  endPoint: process.env.NEXT_PUBLIC_MINIO_ENDPOINT!,
  accessKey: process.env.MINIO_ROOT_USER!,
  secretKey: process.env.MINIO_SECRET_KEY!,
  useSSL: true,
  region: process.env.MINIO_REGION || 'us-east-1',
})

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File
    const applicantId = formData.get('applicantId') as string

    if (!file || !applicantId) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Validate file
    const buffer = Buffer.from(await file.arrayBuffer())
    const fileName = file.name
    const fileSize = buffer.length
    const minioKey = `applicant-${applicantId}/${Date.now()}-${fileName}`

    // Upload to MinIO
    const etag = await minioClient.putObject(
      process.env.NEXT_PUBLIC_MINIO_BUCKET!,
      minioKey,
      buffer,
      fileSize,
      { 'Content-Type': file.type }
    )

    // Save metadata to Supabase
    const supabase = createServerClient(...)
    const { data } = await supabase
      .from('documents')
      .insert({
        applicant_id: applicantId,
        file_name: fileName,
        file_size: fileSize,
        file_type: file.type,
        minio_bucket: process.env.NEXT_PUBLIC_MINIO_BUCKET,
        minio_key: minioKey,
        minio_etag: etag,
        uploaded_by: userId,
        created_at: new Date().toISOString(),
      })
      .select()
      .single()

    return NextResponse.json(
      { success: true, data },
      { status: 200 }
    )
  } catch (error) {
    console.error('Upload error:', error)
    return NextResponse.json(
      { success: false, error: 'Upload failed' },
      { status: 500 }
    )
  }
}
```

## 📥 Step 4: Implement Download Handler

**File**: `app/api/documents/[documentId]/download/route.ts`

```typescript
import { Client } from 'minio'
import { NextRequest, NextResponse } from 'next/server'

const minioClient = new Client({
  endPoint: process.env.NEXT_PUBLIC_MINIO_ENDPOINT!,
  accessKey: process.env.MINIO_ROOT_USER!,
  secretKey: process.env.MINIO_SECRET_KEY!,
  useSSL: true,
  region: process.env.MINIO_REGION || 'us-east-1',
})

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ documentId: string }> }
) {
  try {
    const { documentId } = await params

    // Get document metadata from Supabase
    const supabase = createServerClient(...)
    const { data: doc } = await supabase
      .from('documents')
      .select('*')
      .eq('id', documentId)
      .single()

    if (!doc) {
      return NextResponse.json(
        { success: false, error: 'Document not found' },
        { status: 404 }
      )
    }

    // Get file from MinIO
    const stream = await minioClient.getObject(
      doc.minio_bucket,
      doc.minio_key
    )

    return new NextResponse(stream, {
      headers: {
        'Content-Type': doc.file_type,
        'Content-Disposition': `attachment; filename="${doc.file_name}"`,
      },
    })
  } catch (error) {
    console.error('Download error:', error)
    return NextResponse.json(
      { success: false, error: 'Download failed' },
      { status: 500 }
    )
  }
}
```

## 🖼️ Step 5: Implement Thumbnail Generation

**File**: `app/api/documents/[documentId]/thumbnail/route.ts`

```typescript
import { Client } from 'minio'
import sharp from 'sharp'  // Install: npm install sharp

const minioClient = new Client({...})

export async function GET(request, { params }) {
  try {
    const { documentId } = await params

    // Get document from Supabase
    const { data: doc } = await supabase
      .from('documents')
      .select('*')
      .eq('id', documentId)
      .single()

    if (!doc) throw new Error('Document not found')

    // Get file stream from MinIO
    const stream = await minioClient.getObject(
      doc.minio_bucket,
      doc.minio_key
    )

    // Generate thumbnail based on file type
    if (doc.file_type.startsWith('image/')) {
      const buffer = await sharp(stream)
        .resize(200, 200, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 80 })
        .toBuffer()

      // Save thumbnail back to MinIO
      const thumbKey = `${doc.minio_key}.thumb.webp`
      await minioClient.putObject(
        doc.minio_bucket,
        thumbKey,
        buffer,
        buffer.length,
        { 'Content-Type': 'image/webp' }
      )

      // Return presigned URL
      const url = await minioClient.presignedGetObject(
        doc.minio_bucket,
        thumbKey,
        3600  // 1 hour expiry
      )

      return NextResponse.json({ success: true, thumbnailUrl: url })
    } else if (doc.file_type.includes('pdf')) {
      // For PDFs, extract first page and convert to image
      // Use pdf-lib or similar library
    } else {
      // Return generic file icon URL
      return NextResponse.json({
        success: true,
        thumbnailUrl: `/file-icons/${doc.file_type}.svg`,
      })
    }
  } catch (error) {
    console.error('Thumbnail error:', error)
    return NextResponse.json(
      { success: false, error: 'Thumbnail generation failed' },
      { status: 500 }
    )
  }
}
```

## 🔍 Step 6: Implement Document List

**File**: `app/api/documents/route.ts`

```typescript
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const applicantId = searchParams.get('applicantId')

    if (!applicantId) {
      return NextResponse.json(
        { success: false, error: 'applicantId required' },
        { status: 400 }
      )
    }

    // Get documents from Supabase, sorted by date
    const { data: documents } = await supabase
      .from('documents')
      .select('*')
      .eq('applicant_id', applicantId)
      .eq('is_deleted', false)
      .order('created_at', { ascending: false })

    return NextResponse.json(
      { success: true, data: documents },
      { status: 200 }
    )
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Failed to fetch documents' },
      { status: 500 }
    )
  }
}
```

## 🗑️ Step 7: Implement Deletion

**File**: `app/api/documents/route.ts` (DELETE method)

```typescript
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const documentId = searchParams.get('documentId')

    // Soft delete from database
    await supabase
      .from('documents')
      .update({ is_deleted: true })
      .eq('id', documentId)

    // Optionally delete from MinIO
    // await minioClient.removeObject(bucket, minioKey)

    return NextResponse.json(
      { success: true },
      { status: 200 }
    )
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Failed to delete document' },
      { status: 500 }
    )
  }
}
```

## 🏥 Step 8: Implement Health Check

**File**: `app/api/documents/status/route.ts`

```typescript
import { Client } from 'minio'

const minioClient = new Client({...})

export async function GET() {
  try {
    const startTime = performance.now()

    // Try to list buckets as health check
    await minioClient.listBuckets()

    const ping = Math.round(performance.now() - startTime)

    return NextResponse.json({
      success: true,
      status: {
        connected: true,
        ping,
        timestamp: new Date().toISOString(),
        endpoint: process.env.NEXT_PUBLIC_MINIO_ENDPOINT,
      },
    })
  } catch (error) {
    return NextResponse.json({
      success: true,
      status: {
        connected: false,
        timestamp: new Date().toISOString(),
        endpoint: process.env.NEXT_PUBLIC_MINIO_ENDPOINT,
        error: error instanceof Error ? error.message : 'Connection failed',
      },
    })
  }
}
```

## 🗄️ Step 9: Create Database Schema

**Supabase SQL**:

```sql
-- Documents table
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
  is_deleted BOOLEAN DEFAULT FALSE,
  CONSTRAINT file_size_check CHECK (file_size <= 1500000)
);

-- Indexes for performance
CREATE INDEX idx_documents_applicant_id ON documents(applicant_id);
CREATE INDEX idx_documents_created_at ON documents(created_at DESC);
CREATE INDEX idx_documents_deleted ON documents(is_deleted);

-- Enable RLS
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

-- Allow employees to view documents for their applicants
CREATE POLICY "employees_can_view_documents" ON documents
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM applicants
      WHERE applicants.id = documents.applicant_id
      AND applicants.employee_id = auth.uid()
    )
  );

-- Allow upload for authenticated users
CREATE POLICY "authenticated_can_insert_documents" ON documents
  FOR INSERT
  WITH CHECK (uploaded_by = auth.uid());

-- Allow delete for document owner
CREATE POLICY "can_delete_own_documents" ON documents
  FOR DELETE
  USING (uploaded_by = auth.uid());
```

## 📝 Step 10: Update Service Layer

**File**: `lib/services/documentService.ts`

Replace all placeholder methods with actual API calls:

```typescript
async uploadDocument(file: File, applicantId: string): Promise<Document> {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('applicantId', applicantId)

  const response = await fetch('/api/documents/upload', {
    method: 'POST',
    body: formData,
  })

  if (!response.ok) throw new Error('Upload failed')
  const data = await response.json()
  return data.data
}

async getDocuments(applicantId: string): Promise<Document[]> {
  const response = await fetch(
    `/api/documents?applicantId=${applicantId}`
  )
  if (!response.ok) throw new Error('Fetch failed')
  const data = await response.json()
  return data.data || []
}

// ... implement other methods similarly
```

## ✅ Testing

Test each endpoint:

```bash
# Test MinIO health
curl https://yourdomain.com/api/documents/status

# Test upload (requires auth)
curl -X POST \
  -F "file=@test.pdf" \
  -F "applicantId=uuid" \
  https://yourdomain.com/api/documents/upload

# Test list
curl https://yourdomain.com/api/documents?applicantId=uuid

# Test download
curl https://yourdomain.com/api/documents/doc-id/download
```

## 🚀 Deployment Checklist

- [ ] All environment variables configured
- [ ] MinIO client library installed
- [ ] All API routes implemented and tested
- [ ] Database schema created with RLS
- [ ] Supabase policies configured
- [ ] Caddy reverse proxy configured
- [ ] SSL certificates valid
- [ ] CORS headers properly set
- [ ] Performance optimized (indexing, caching)
- [ ] Error logging configured
- [ ] Backup strategy in place
- [ ] Load test completed

## 📊 Monitoring

Monitor these metrics:
- Document upload success rate
- Average upload time
- MinIO connection uptime
- Storage space usage
- Error rates by endpoint
- User adoption metrics

## 🆘 Troubleshooting

**Uploads failing?**
- Check MinIO credentials
- Verify bucket exists and is accessible
- Check file size limits
- Review MinIO logs

**Preview not working?**
- Verify presigned URLs are generated correctly
- Check CORS headers
- Ensure file was uploaded correctly

**Performance issues?**
- Consider enabling caching
- Optimize thumbnail generation
- Add database indexes
- Consider CDN for files

---

**Status**: Ready for Backend Implementation  
**Estimated Time**: 2-4 hours  
**Complexity**: Medium  

Questions? Refer back to the frontend code comments for guidance.
