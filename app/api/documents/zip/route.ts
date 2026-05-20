/**
 * Module: app/api/documents/zip/route.ts
 * Two-step ZIP archive management for family documents.
 *
 * GET  /api/documents/zip?familyHeadId=<id>  → check status (none / ready / stale)
 * POST /api/documents/zip                     → create ZIP, upload to MinIO, save to DB
 */

import { NextRequest } from 'next/server'
import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import JSZip from 'jszip'
import { getS3Client } from '@/lib/s3Client'
import { getR2Client, isR2Configured } from '@/lib/r2Client'
import { getSupabaseClient } from '@/lib/supabaseClient'
import { apiError, apiOk } from '@/lib/api/http'
import { toErrorMessage } from '@/lib/api/error'

// Increase Vercel function timeout for large document sets
export const maxDuration = 60

const MINIO_BUCKET = process.env.MINIO_BUCKET_NAME || 'portal-documents'
const R2_BUCKET = process.env.R2_BUCKET_NAME || 'portal-fallback'

type DocumentRow = {
  id: string
  file_name: string
  minio_key: string
  minio_bucket: string
  category: string | null
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
  try {
    const familyHeadId = new URL(request.url).searchParams.get('familyHeadId')
    if (!familyHeadId) return apiError('familyHeadId is required', 400)

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
      return apiOk({ status: 'none' })
    }

    // Count current non-zip documents
    const { count, error: countErr } = await supabase
      .from('documents')
      .select('id', { count: 'exact', head: true })
      .eq('family_head_id', familyHeadId)
      .eq('deleted', false)
      .neq('category', 'zip-archive')

    if (countErr) throw countErr

    // Stored doc count is encoded in minio_etag as "doccount:N"
    const match = (zipRow.minio_etag || '').match(/^doccount:(\d+)$/)
    const storedCount = match ? parseInt(match[1], 10) : null
    const currentCount = count ?? 0

    const isStale = storedCount !== null && storedCount !== currentCount

    return apiOk({
      status: isStale ? 'stale' : 'ready',
      documentId: zipRow.id,
      minioKey: zipRow.minio_key,
      fileName: zipRow.file_name,
      createdAt: zipRow.uploaded_at,
      currentCount,
      storedCount,
    })
  } catch (err) {
    console.error('[zip] GET error:', err)
    return apiError(toErrorMessage(err, 'Failed to get ZIP status'), 500)
  }
}

/* ─────────────────────────────────────────
   POST /api/documents/zip
   Body: { familyHeadId: string, zipFileName: string }
   Creates ZIP in memory → uploads to MinIO → saves DB record
───────────────────────────────────────── */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { familyHeadId, zipFileName } = body as { familyHeadId?: string; zipFileName?: string }

    if (!familyHeadId) return apiError('familyHeadId is required', 400)

    const supabase = getSupabaseClient()

    // Fetch all non-zip documents for this family
    const { data, error: fetchErr } = await supabase
      .from('documents')
      .select('id, file_name, minio_key, minio_bucket, category')
      .eq('family_head_id', familyHeadId)
      .eq('deleted', false)
      .neq('category', 'zip-archive')
      .order('uploaded_at', { ascending: false })

    if (fetchErr) throw fetchErr
    if (!data || data.length === 0) return apiError('No documents found', 404)

    const documents = data as DocumentRow[]
    console.log(`[zip] creating archive for ${documents.length} documents`)

    const s3Client = getS3Client()
    const zip = new JSZip()
    let fileCount = 0

    // ── 1. Download each document as a buffer and add to ZIP ────────
    for (const doc of documents) {
      const bucket = doc.minio_bucket || MINIO_BUCKET
      let buffer: Buffer | null = null

      try {
        buffer = await downloadToBuffer(s3Client, bucket, doc.minio_key)
      } catch (minioErr) {
        console.error(`[zip] MinIO failed for ${doc.file_name}:`, minioErr)
        if (isR2Configured()) {
          try {
            buffer = await downloadToBuffer(getR2Client(), R2_BUCKET, doc.minio_key)
          } catch (r2Err) {
            console.error(`[zip] R2 also failed for ${doc.file_name}:`, r2Err)
          }
        }
      }

      if (buffer) {
        const folder = doc.category && doc.category !== 'general' ? `${doc.category}/` : ''
        zip.file(`${folder}${doc.file_name}`, buffer)
        fileCount++
        console.log(`[zip] added: ${doc.file_name}`)
      }
    }

    if (fileCount === 0) {
      throw new Error('No documents could be downloaded from storage')
    }

    // ── 2. Generate ZIP buffer in memory ────────────────────────────
    const safeName = (zipFileName || familyHeadId).replace(/[^a-zA-Z0-9._-]/g, '_')
    const zipBaseName = safeName.endsWith('.zip') ? safeName : `${safeName}.zip`

    const zipBuffer = await zip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    })
    console.log(`[zip] generated ${zipBuffer.length} bytes`)

    // ── 3. Upload ZIP buffer to MinIO ───────────────────────────────
    const minioKey = `family-${familyHeadId}/zip-archive/${zipBaseName}`
    const documentId = `doc-zip-${Date.now()}`
    let storageBucket = MINIO_BUCKET

    try {
      await s3Client.send(
        new PutObjectCommand({
          Bucket: MINIO_BUCKET,
          Key: minioKey,
          Body: zipBuffer,
          ContentType: 'application/zip',
        }),
      )
      console.log(`[zip] uploaded to MinIO: ${minioKey}`)
    } catch (minioErr) {
      if (!isR2Configured()) throw minioErr
      await getR2Client().send(
        new PutObjectCommand({
          Bucket: R2_BUCKET,
          Key: minioKey,
          Body: zipBuffer,
          ContentType: 'application/zip',
        }),
      )
      storageBucket = R2_BUCKET
      console.log(`[zip] uploaded to R2: ${minioKey}`)
    }

    // ── 4. Soft-delete previous zip records in DB ───────────────────
    await supabase
      .from('documents')
      .update({ deleted: true })
      .eq('family_head_id', familyHeadId)
      .eq('category', 'zip-archive')
      .eq('deleted', false)

    // ── 5. Insert new zip record (category='zip-archive') ──────────
    // Store the document count in minio_etag for staleness detection
    const { error: insertErr } = await supabase.from('documents').insert({
      id: documentId,
      file_name: zipBaseName,
      file_size: zipBuffer.length,
      file_type: 'application/zip',
      category: 'zip-archive',
      uploaded_at: new Date().toISOString(),
      uploaded_by: 'system',
      family_head_id: familyHeadId,
      minio_bucket: storageBucket,
      minio_key: minioKey,
      minio_etag: `doccount:${documents.length}`,
      deleted: false,
    })

    if (insertErr) throw insertErr

    console.log(`[zip] DB record inserted: ${documentId}`)

    return apiOk({ documentId, minioKey, fileName: zipBaseName })
  } catch (err) {
    console.error('[zip] POST error:', err)
    return apiError(toErrorMessage(err, 'Failed to create ZIP archive'), 500)
  }
}
