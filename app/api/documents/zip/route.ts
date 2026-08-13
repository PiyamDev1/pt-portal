/**
 * Module: app/api/documents/zip/route.ts
 * Two-step ZIP archive management for family documents.
 *
 * GET  /api/documents/zip?familyHeadId=<id>  → check status (none / ready / stale)
 * POST /api/documents/zip                     → create ZIP, upload to MinIO, save to DB
 */

import { NextRequest } from 'next/server'
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import JSZip from 'jszip'
import { getS3Client } from '@/lib/s3Client'
import { getR2Client, isR2Configured } from '@/lib/r2Client'
import { getSupabaseClient } from '@/lib/supabaseClient'
import { apiError, apiOk } from '@/lib/api/http'
import { toErrorMessage } from '@/lib/api/error'
import {
  logServerEvent,
  reportOperationalError,
  responseWithRequestId,
} from '@/lib/observability/server'
import { z } from 'zod'
import { parseBodyWithSchema } from '@/lib/api/request'

const createZipSchema = z.object({
  familyHeadId: z.string().trim().min(1, 'familyHeadId is required').max(200),
  zipFileName: z.string().trim().max(240).optional(),
})
import { requireStaffSession } from '@/lib/auth/staffSession'
import { resolveDocumentScope } from '@/lib/documentAccess'
import { isDocumentStorageKeyOwnedByScope } from '@/lib/services/documentServer'
import {
  DOCUMENT_PRIVATE_CACHE_HEADERS,
  isValidDocumentScopeId,
  normalizeDocumentUploadCategory,
  sanitizeDocumentFileName,
} from '@/lib/documentSecurity'

// Increase Vercel function timeout for large document sets
export const maxDuration = 60

const MINIO_BUCKET = process.env.MINIO_BUCKET_NAME || 'portal-documents'
const R2_BUCKET = process.env.R2_BUCKET_NAME || 'portal-fallback'
const MAX_ZIP_DOCUMENTS = 200
const MAX_ZIP_SOURCE_BYTES = 100 * 1024 * 1024

type DocumentRow = {
  id: string
  file_name: string
  family_head_id: string
  minio_key: string
  minio_bucket: string
  category: string | null
  file_size: number
}

function logZipDebug(message: string, details?: Record<string, unknown>) {
  process.stdout.write(
    `${JSON.stringify({
      scope: 'documents.zip',
      message,
      ...(details ? { details } : {}),
      at: new Date().toISOString(),
    })}\n`,
  )
}

/**
 * Download a single S3/MinIO object into a Buffer.
 * Returns null if the object body is missing.
 */
async function downloadToBuffer(
  client: ReturnType<typeof getS3Client>,
  bucket: string,
  key: string,
): Promise<Buffer | null> {
  const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }))
  if (!result.Body) return null

  const chunks: Uint8Array[] = []
  for await (const chunk of result.Body as AsyncIterable<Uint8Array>) {
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

/* ─────────────────────────────────────────
   GET  /api/documents/zip?familyHeadId=<id>
   Returns zip status: none | ready | stale
───────────────────────────────────────── */
export async function GET(request: NextRequest) {
  const access = await requireStaffSession()
  if (!access.authorized) return access.response

  try {
    const familyHeadId = new URL(request.url).searchParams.get('familyHeadId')
    if (!familyHeadId) return apiError('familyHeadId is required', 400)
    if (!isValidDocumentScopeId(familyHeadId)) return apiError('Invalid document scope', 400)
    const scope = await resolveDocumentScope(familyHeadId)
    if (!scope.exists) {
      return apiError('Document scope not found', 404)
    }

    const supabase = getSupabaseClient()

    // Find the latest non-deleted zip-archive record for this family
    const { data: zipRows, error: zipErr } = await supabase
      .from('documents')
      .select('id, file_name, minio_key, minio_bucket, minio_etag, uploaded_at')
      .eq('family_head_id', familyHeadId)
      .eq('category', 'zip-archive')
      .eq('deleted', false)
      .order('uploaded_at', { ascending: false })
      .limit(1)

    if (zipErr) throw zipErr

    const zipRow = zipRows?.[0] ?? null

    if (!zipRow) {
      return apiOk({ status: 'none' }, { headers: DOCUMENT_PRIVATE_CACHE_HEADERS })
    }

    // Count current non-zip documents
    const { count, error: countErr } = await supabase
      .from('documents')
      .select('id', { count: 'exact', head: true })
      .in('family_head_id', scope.scopeIds)
      .eq('deleted', false)
      .neq('category', 'zip-archive')

    if (countErr) throw countErr

    // Stored doc count is encoded in minio_etag as "doccount:N"
    const match = (zipRow.minio_etag || '').match(/^doccount:(\d+)$/)
    const storedCount = match ? parseInt(match[1], 10) : null
    const currentCount = count ?? 0

    const isStale = storedCount !== null && storedCount !== currentCount

    return apiOk(
      {
        status: isStale ? 'stale' : 'ready',
        documentId: zipRow.id,
        fileName: zipRow.file_name,
        createdAt: zipRow.uploaded_at,
        currentCount,
        storedCount,
      },
      { headers: DOCUMENT_PRIVATE_CACHE_HEADERS },
    )
  } catch (err) {
    const requestId = await reportOperationalError({
      event: 'documents.zip_status_failed',
      request,
      error: err,
      alert: true,
    })
    return responseWithRequestId(
      apiError(toErrorMessage(err, 'Failed to get ZIP status'), 500),
      requestId,
    )
  }
}

/* ─────────────────────────────────────────
   POST /api/documents/zip
   Body: { familyHeadId: string, zipFileName: string }
   Creates ZIP in memory → uploads to MinIO → saves DB record
───────────────────────────────────────── */
export async function POST(request: NextRequest) {
  const access = await requireStaffSession()
  if (!access.authorized) return access.response

  try {
    const { data: body, error: bodyError } = await parseBodyWithSchema(request, createZipSchema, {
      maxBytes: 8 * 1024,
    })
    if (bodyError || !body) return apiError(bodyError || 'Invalid request payload', 400)
    const { familyHeadId, zipFileName } = body
    if (!isValidDocumentScopeId(familyHeadId)) return apiError('Invalid document scope', 400)
    const scope = await resolveDocumentScope(familyHeadId)
    if (!scope.exists) {
      return apiError('Document scope not found', 404)
    }

    const supabase = getSupabaseClient()

    // Fetch all non-zip documents for this family
    const { data, error: fetchErr } = await supabase
      .from('documents')
      .select('id, file_name, file_size, family_head_id, minio_key, minio_bucket, category')
      .in('family_head_id', scope.scopeIds)
      .eq('deleted', false)
      .neq('category', 'zip-archive')
      .order('uploaded_at', { ascending: false })

    if (fetchErr) throw fetchErr
    if (!data || data.length === 0) return apiError('No documents found', 404)

    const documents = data as DocumentRow[]
    const ownershipChecks = await Promise.all(
      documents.map((document) =>
        isDocumentStorageKeyOwnedByScope(document.family_head_id, document.minio_key),
      ),
    )
    if (ownershipChecks.some((owned) => !owned)) {
      return apiError('Document metadata failed storage ownership validation', 409)
    }
    if (documents.some((document) => document.minio_bucket === R2_BUCKET) && !isR2Configured()) {
      return apiError('Fallback document storage is unavailable', 503)
    }
    if (documents.length > MAX_ZIP_DOCUMENTS) {
      return apiError(`ZIP archives are limited to ${MAX_ZIP_DOCUMENTS} documents`, 413)
    }
    const sourceBytes = documents.reduce(
      (total, document) => total + Math.max(0, Number(document.file_size || 0)),
      0,
    )
    if (sourceBytes > MAX_ZIP_SOURCE_BYTES) {
      return apiError('ZIP source documents exceed the 100 MB archive limit', 413)
    }
    logZipDebug('creating archive', { count: documents.length, familyHeadId })

    const s3Client = getS3Client()
    const zip = new JSZip()
    let fileCount = 0

    // ── 1. Download each document as a buffer and add to ZIP ────────
    for (const doc of documents) {
      let buffer: Buffer | null = null

      if (doc.minio_bucket === R2_BUCKET) {
        if (isR2Configured()) {
          buffer = await downloadToBuffer(getR2Client(), R2_BUCKET, doc.minio_key)
        }
      } else {
        try {
          buffer = await downloadToBuffer(s3Client, MINIO_BUCKET, doc.minio_key)
        } catch (minioErr) {
          logServerEvent({
            event: 'documents.zip_primary_read_failed',
            level: 'warn',
            request,
            error: minioErr,
            context: { documentId: doc.id },
          })
          if (isR2Configured()) {
            try {
              buffer = await downloadToBuffer(getR2Client(), R2_BUCKET, doc.minio_key)
            } catch (r2Err) {
              logServerEvent({
                event: 'documents.zip_fallback_read_failed',
                level: 'error',
                request,
                error: r2Err,
                context: { documentId: doc.id },
              })
            }
          }
        }
      }

      if (buffer) {
        const category = normalizeDocumentUploadCategory(doc.category) || 'general'
        const folder = category !== 'general' ? `${category}/` : ''
        const fileName = sanitizeDocumentFileName(doc.file_name) || `${doc.id}.bin`
        zip.file(`${folder}${fileName}`, buffer)
        fileCount++
        logZipDebug('added file to archive', { fileName: doc.file_name })
      }
    }

    if (fileCount === 0) {
      throw new Error('No documents could be downloaded from storage')
    }

    // ── 2. Generate ZIP buffer in memory ────────────────────────────
    const safeName = sanitizeDocumentFileName(zipFileName || familyHeadId) || familyHeadId
    const zipBaseName = safeName.endsWith('.zip') ? safeName : `${safeName}.zip`

    const zipBuffer = await zip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    })
    logZipDebug('generated archive buffer', { bytes: zipBuffer.length })

    // ── 3. Upload ZIP buffer to MinIO ───────────────────────────────
    const documentId = `doc-zip-${crypto.randomUUID()}`
    const minioKey = `family-${familyHeadId}/zip-archive/${documentId}-${zipBaseName}`
    let storageBucket = MINIO_BUCKET
    let storageClient: ReturnType<typeof getS3Client> = s3Client

    try {
      await s3Client.send(
        new PutObjectCommand({
          Bucket: MINIO_BUCKET,
          Key: minioKey,
          Body: zipBuffer,
          ContentType: 'application/zip',
          Metadata: {
            'document-id': documentId,
            'uploaded-by': access.user.id,
          },
        }),
      )
      logZipDebug('uploaded archive to MinIO', { minioKey })
    } catch (minioErr) {
      if (!isR2Configured()) throw minioErr
      storageClient = getR2Client()
      await storageClient.send(
        new PutObjectCommand({
          Bucket: R2_BUCKET,
          Key: minioKey,
          Body: zipBuffer,
          ContentType: 'application/zip',
          Metadata: {
            'document-id': documentId,
            'uploaded-by': access.user.id,
          },
        }),
      )
      storageBucket = R2_BUCKET
      logZipDebug('uploaded archive to R2', { minioKey })
    }

    // ── 4. Insert new zip record (category='zip-archive') ──────────
    // Store the document count in minio_etag for staleness detection
    const { error: insertErr } = await supabase.from('documents').insert({
      id: documentId,
      file_name: zipBaseName,
      file_size: zipBuffer.length,
      file_type: 'application/zip',
      category: 'zip-archive',
      uploaded_at: new Date().toISOString(),
      uploaded_by: access.user.id,
      family_head_id: familyHeadId,
      minio_bucket: storageBucket,
      minio_key: minioKey,
      minio_etag: `doccount:${documents.length}`,
      deleted: false,
    })

    if (insertErr) {
      try {
        await storageClient.send(new DeleteObjectCommand({ Bucket: storageBucket, Key: minioKey }))
      } catch {
        // Preserve the database error; orphan cleanup can be retried operationally.
      }
      throw insertErr
    }

    // ── 5. Retire older archives after the new record is durable ───
    const { error: retireError } = await supabase
      .from('documents')
      .update({ deleted: true })
      .eq('family_head_id', familyHeadId)
      .eq('category', 'zip-archive')
      .eq('deleted', false)
      .neq('id', documentId)

    if (retireError) {
      logServerEvent({
        event: 'documents.zip_retirement_failed',
        level: 'warn',
        request,
        error: retireError,
      })
    }

    logZipDebug('inserted zip document record', { documentId })

    return apiOk({ documentId, fileName: zipBaseName })
  } catch (err) {
    const requestId = await reportOperationalError({
      event: 'documents.zip_creation_failed',
      request,
      error: err,
      alert: true,
    })
    return responseWithRequestId(
      apiError(toErrorMessage(err, 'Failed to create ZIP archive'), 500),
      requestId,
    )
  }
}
