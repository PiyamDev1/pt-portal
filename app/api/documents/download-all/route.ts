/**
 * Module: app/api/documents/download-all/route.ts
 * Streams all documents for a familyHeadId as a single ZIP archive.
 */

import { NextRequest, NextResponse } from 'next/server'
import { GetObjectCommand } from '@aws-sdk/client-s3'
import { Readable } from 'stream'
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
 * Convert Node.js ReadableStream to Web ReadableStream via chunks
 */
async function* nodeStreamToAsyncIterator(nodeStream: Readable) {
  for await (const chunk of nodeStream) {
    yield chunk
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

    console.log(`[download-all] starting archive for ${documents.length} documents`)

    // Create the archive
    const archive = archiverFactory('zip', { zlib: { level: 6 } })

    // Populate archive asynchronously
    const populateArchive = async () => {
      const s3Client = getS3Client()
      let successCount = 0
      let errorCount = 0

      try {
        for (const doc of documents) {
          try {
            const bucket = doc.minio_bucket || MINIO_BUCKET
            let result

            try {
              console.log(`[download-all] fetching from MinIO: ${doc.minio_key}`)
              result = await s3Client.send(
                new GetObjectCommand({ Bucket: bucket, Key: doc.minio_key }),
              )
            } catch (minioErr) {
              console.error(`[download-all] MinIO failed for ${doc.file_name}:`, minioErr)

              if (!isR2Configured()) {
                console.log('[download-all] R2 not configured, skipping file')
                errorCount++
                continue
              }

              console.log(`[download-all] trying R2 fallback for ${doc.file_name}`)
              const r2Client = getR2Client()
              result = await r2Client.send(
                new GetObjectCommand({ Bucket: R2_BUCKET, Key: doc.minio_key }),
              )
            }

            if (result.Body) {
              const fileStream = Readable.from(result.Body as AsyncIterable<Uint8Array>)
              const folder = doc.category && doc.category !== 'general' ? `${doc.category}/` : ''
              const fileName = `${folder}${doc.file_name}`
              console.log(`[download-all] appending to archive: ${fileName}`)
              archive.append(fileStream, { name: fileName })
              successCount++
            }
          } catch (fileErr) {
            console.error(`[download-all] error processing ${doc.file_name}:`, fileErr)
            errorCount++
          }
        }

        console.log(`[download-all] population complete: ${successCount}/${documents.length} added (${errorCount} errors)`)

        console.log('[download-all] finalizing archive')
        await archive.finalize()
        console.log('[download-all] archive finalized')
      } catch (err) {
        console.error('[download-all] fatal error during population:', err)
        archive.destroy()
        throw err
      }
    }

    // Start population immediately (fire and forget, but with error handling)
    populateArchive().catch((err) => {
      console.error('[download-all] background population failed:', err)
    })

    // The archive is a Readable stream - convert to Web ReadableStream
    const webStream = Readable.toWeb(archive as unknown as Readable) as ReadableStream<Uint8Array>

    return new NextResponse(webStream, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename*=UTF-8''documents-${familyHeadId}.zip`,
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        'Transfer-Encoding': 'chunked',
      },
    })
  } catch (err) {
    console.error('[download-all] route error:', err)
    return apiError('Failed to create ZIP archive', 500)
  }
}
