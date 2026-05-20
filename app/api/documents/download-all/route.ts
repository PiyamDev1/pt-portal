/**
 * Module: app/api/documents/download-all/route.ts
 * Streams all documents for a familyHeadId as a single ZIP archive.
 */

import { NextRequest, NextResponse } from 'next/server'
import { GetObjectCommand } from '@aws-sdk/client-s3'
import { Readable } from 'stream'
import { createWriteStream } from 'fs'
import { mkdir, unlink, readdir } from 'fs/promises'
import { join } from 'path'
import * as archiverLib from 'archiver'
// archiver is a CJS module — module.exports is the factory function itself
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const archiverFactory = archiverLib as any as (format: string, options?: archiverLib.ArchiverOptions) => archiverLib.Archiver
import { getS3Client } from '@/lib/s3Client'
import { getR2Client, isR2Configured } from '@/lib/r2Client'
import { getSupabaseClient } from '@/lib/supabaseClient'
import { apiError } from '@/lib/api/http'

// Increase max duration for Vercel (ZIP streaming can take time)
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
 * Download file from S3 and save to local path
 */
async function downloadFileToCache(
  s3Client: ReturnType<typeof getS3Client>,
  bucket: string,
  key: string,
  localPath: string,
): Promise<boolean> {
  try {
    const result = await s3Client.send(
      new GetObjectCommand({ Bucket: bucket, Key: key }),
    )

    if (!result.Body) return false

    return new Promise((resolve, reject) => {
      const stream = Readable.from(result.Body as AsyncIterable<Uint8Array>)
      const writeStream = createWriteStream(localPath)

      stream.pipe(writeStream)
      writeStream.on('finish', () => resolve(true))
      writeStream.on('error', (err) => {
        console.error(`[download-all] write error for ${localPath}:`, err)
        reject(err)
      })
      stream.on('error', (err) => {
        console.error(`[download-all] stream error for ${key}:`, err)
        reject(err)
      })
    })
  } catch (err) {
    console.error(`[download-all] download error for ${key}:`, err)
    return false
  }
}

/**
 * GET /api/documents/download-all?familyHeadId=<id>
 * Fetches all non-deleted documents for the family, streams them from
 * MinIO (with R2 fallback) and returns a ZIP archive as a download.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const familyHeadId = searchParams.get('familyHeadId')

    if (!familyHeadId) {
      return apiError('familyHeadId is required', 400)
    }

    const supabase = getSupabaseClient()
    const { data, error } = await supabase
      .from('documents')
      .select('id, file_name, minio_key, minio_bucket, category')
      .eq('family_head_id', familyHeadId)
      .eq('deleted', false)
      .order('uploaded_at', { ascending: false })

    if (error) throw error

    const documents = (data || []) as DocumentRow[]

    if (documents.length === 0) {
      return apiError('No documents found', 404)
    }

    console.log(`[download-all] starting download cache for ${documents.length} documents`)

    // Create cache directory in /tmp
    const cacheDir = join('/tmp', `docs-${familyHeadId}-${Date.now()}`)
    await mkdir(cacheDir, { recursive: true })
    console.log(`[download-all] cache directory created: ${cacheDir}`)

    const s3Client = getS3Client()
    const cachedFiles: { path: string; folder: string; name: string }[] = []
    let successCount = 0
    let errorCount = 0

    try {
      // Download all files to cache
      console.log('[download-all] downloading files to cache')
      for (const doc of documents) {
        try {
          const bucket = doc.minio_bucket || MINIO_BUCKET
          const localPath = join(cacheDir, doc.id)
          let downloadSuccess = false

          try {
            console.log(`[download-all] downloading from MinIO: ${doc.minio_key}`)
            downloadSuccess = await downloadFileToCache(s3Client, bucket, doc.minio_key, localPath)
          } catch (minioErr) {
            console.error(`[download-all] MinIO failed for ${doc.file_name}:`, minioErr)

            if (!isR2Configured()) {
              console.log('[download-all] R2 not configured, skipping file')
              errorCount++
              continue
            }

            console.log(`[download-all] trying R2 fallback for ${doc.file_name}`)
            const r2Client = getR2Client()
            downloadSuccess = await downloadFileToCache(r2Client, R2_BUCKET, doc.minio_key, localPath)
          }

          if (downloadSuccess) {
            const folder = doc.category && doc.category !== 'general' ? `${doc.category}/` : ''
            cachedFiles.push({
              path: localPath,
              folder,
              name: doc.file_name,
            })
            successCount++
            console.log(`[download-all] cached: ${doc.file_name}`)
          } else {
            errorCount++
          }
        } catch (fileErr) {
          console.error(`[download-all] error processing ${doc.file_name}:`, fileErr)
          errorCount++
        }
      }

      console.log(`[download-all] download complete: ${successCount}/${documents.length} cached (${errorCount} errors)`)

      if (cachedFiles.length === 0) {
        throw new Error('No documents were successfully downloaded')
      }

      // Create ZIP from cached files
      console.log('[download-all] creating zip from cached files')
    const archive = archiverFactory('zip', { zlib: { level: 6 } })

    archive.on('error', (err) => {
      console.error('[download-all] archiver error:', err)
    })

      // Add all cached files to archive
      for (const cached of cachedFiles) {
        const fileName = `${cached.folder}${cached.name}`
        console.log(`[download-all] adding to archive: ${fileName}`)
        archive.file(cached.path, { name: fileName })
      }

      console.log('[download-all] finalizing archive')
      await archive.finalize()
      console.log('[download-all] archive finalized')

      // Convert to web stream and return
      const nodeStream = archive as unknown as Readable
      const webStream = Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>

      const response = new NextResponse(webStream, {
        status: 200,
        headers: {
          'Content-Type': 'application/zip',
          'Content-Disposition': `attachment; filename*=UTF-8''documents-${familyHeadId}.zip`,
          'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        },
      })

      // Clean up cache directory after response (fire and forget)
      ;(async () => {
        try {
          const files = await readdir(cacheDir)
          for (const file of files) {
            await unlink(join(cacheDir, file))
          }
          await mkdir(cacheDir, { recursive: true })
          console.log('[download-all] cache cleaned up')
        } catch (err) {
          console.error('[download-all] cleanup error:', err)
        }
      })()

      return response
    } catch (err) {
      console.error('[download-all] archive creation error:', err)
      // Clean up on error
      try {
        const files = await readdir(cacheDir)
        for (const file of files) {
          await unlink(join(cacheDir, file))
        }
      } catch (cleanupErr) {
        console.error('[download-all] cleanup error:', cleanupErr)
      }
      throw err
    }
  } catch (err) {
    console.error('[download-all] route error:', err)
    return apiError('Failed to create ZIP archive', 500)
  }
}
