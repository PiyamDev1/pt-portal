/**
 * Module: app/api/documents/zip/route.ts
 * Two-step ZIP archive management for family documents.
 *
 * GET  /api/documents/zip?familyHeadId=<id>  → check status (none / ready / stale)
 * POST /api/documents/zip                     → create ZIP, upload to MinIO, save to DB
 */

import { NextRequest } from 'next/server'
import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import { Readable } from 'stream'
import { createWriteStream as fsCreateWriteStream } from 'fs'
import { mkdir, readFile, rm } from 'fs/promises'
import { join } from 'path'
import * as archiverLib from 'archiver'
// CJS default interop: Turbopack (dev) exposes the function directly on the namespace,
// while webpack (production) wraps it under .default — handle both.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const archiverFactory = ((archiverLib as any).default ?? archiverLib) as unknown as (
  format: string,
  options?: archiverLib.ArchiverOptions,
) => archiverLib.Archiver
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
 * Download a single S3/MinIO object to a local file path.
 * Returns true on success, false if Body is missing.
 */
async function downloadToFile(
  client: ReturnType<typeof getS3Client>,
  bucket: string,
  key: string,
  dest: string,
): Promise<boolean> {
  const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }))
  if (!result.Body) return false

  return new Promise((resolve, reject) => {
    const src = Readable.from(result.Body as AsyncIterable<Uint8Array>)
    const out = fsCreateWriteStream(dest)
    src.pipe(out)
    out.on('finish', () => resolve(true))
    out.on('error', reject)
    src.on('error', reject)
  })
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
    const { data: zipRow, error: zipErr } = await supabase
      .from('documents')
      .select('id, file_name, minio_key, minio_bucket, minio_etag, uploaded_at')
      .eq('family_head_id', familyHeadId)
      .eq('category', 'zip-archive')
      .eq('deleted', false)
      .order('uploaded_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (zipErr) throw zipErr

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
   Creates ZIP → uploads to MinIO → saves DB record
───────────────────────────────────────── */
export async function POST(request: NextRequest) {
  const cacheDir = join('/tmp', `zip-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)

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

    // Create temp workspace
    await mkdir(cacheDir, { recursive: true })

    const s3Client = getS3Client()
    const cachedFiles: { path: string; name: string }[] = []

    // ── 1. Download all documents to /tmp ──────────────────────────
    for (const doc of documents) {
      const localPath = join(cacheDir, doc.id)
      const bucket = doc.minio_bucket || MINIO_BUCKET
      let ok = false

      try {
        ok = await downloadToFile(s3Client, bucket, doc.minio_key, localPath)
      } catch (minioErr) {
        console.error(`[zip] MinIO failed for ${doc.file_name}:`, minioErr)
        if (isR2Configured()) {
          try {
            ok = await downloadToFile(getR2Client(), R2_BUCKET, doc.minio_key, localPath)
          } catch (r2Err) {
            console.error(`[zip] R2 also failed for ${doc.file_name}:`, r2Err)
          }
        }
      }

      if (ok) {
        const folder = doc.category && doc.category !== 'general' ? `${doc.category}/` : ''
        cachedFiles.push({ path: localPath, name: `${folder}${doc.file_name}` })
        console.log(`[zip] cached: ${doc.file_name}`)
      }
    }

    if (cachedFiles.length === 0) {
      throw new Error('No documents could be downloaded from storage')
    }

    // ── 2. Build ZIP file on disk ───────────────────────────────────
    const safeName = (zipFileName || familyHeadId).replace(/[^a-zA-Z0-9._-]/g, '_')
    const zipBaseName = safeName.endsWith('.zip') ? safeName : `${safeName}.zip`
    const zipPath = join(cacheDir, zipBaseName)

    const archive = archiverFactory('zip', { zlib: { level: 6 } })
    const output = fsCreateWriteStream(zipPath)
    archive.pipe(output)

    for (const cached of cachedFiles) {
      archive.file(cached.path, { name: cached.name })
    }

    // Wait until archive is fully written to disk
    await new Promise<void>((resolve, reject) => {
      output.on('close', resolve)
      output.on('error', reject)
      archive.on('error', reject)
      archive.finalize()
    })

    console.log(`[zip] archive written to ${zipPath}`)

    // ── 3. Upload ZIP buffer to MinIO ───────────────────────────────
    const zipBuffer = await readFile(zipPath)
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

    // ── 6. Cleanup temp files ───────────────────────────────────────
    await rm(cacheDir, { recursive: true, force: true })
    console.log('[zip] temp files cleaned up')

    return apiOk({ documentId, minioKey, fileName: zipBaseName })
  } catch (err) {
    console.error('[zip] POST error:', err)
    // Best-effort cleanup
    try {
      await rm(cacheDir, { recursive: true, force: true })
    } catch {
      // ignore cleanup errors
    }
    return apiError(toErrorMessage(err, 'Failed to create ZIP archive'), 500)
  }
}
