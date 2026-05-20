/**
 * Module: app/api/documents/download-all/route.ts
 * Streams all documents for a familyHeadId as a single ZIP archive.
 */

import { NextRequest, NextResponse } from 'next/server'
import { GetObjectCommand } from '@aws-sdk/client-s3'
import { Readable, PassThrough } from 'stream'
import * as archiverLib from 'archiver'
// archiver is a CJS module — module.exports is the factory function itself
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const archiverFactory = archiverLib as any as (format: string, options?: archiverLib.ArchiverOptions) => archiverLib.Archiver
import { getS3Client } from '@/lib/s3Client'
import { getR2Client, isR2Configured } from '@/lib/r2Client'
import { getSupabaseClient } from '@/lib/supabaseClient'
import { apiError } from '@/lib/api/http'

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

    // Create a PassThrough stream (both readable and writable)
    // The archive will write ZIP data to this stream
    const nodeStream = new PassThrough()
    const archive = archiverFactory('zip', { zlib: { level: 6 } })

    archive.on('error', (err) => {
      console.error('[download-all] archiver error:', err)
      nodeStream.destroy(err)
    })

    nodeStream.on('error', (err) => {
      console.error('[download-all] stream error:', err)
    })

    nodeStream.on('end', () => {
      console.log('[download-all] stream ended')
    })

    // Pipe archive to the PassThrough stream
    archive.pipe(nodeStream)

    // Function to populate the archive
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
                console.log('[download-all] R2 not configured, skipping this file')
                errorCount++
                continue
              }

              console.log(`[download-all] trying R2 fallback: ${doc.minio_key}`)
              const r2Client = getR2Client()
              result = await r2Client.send(
                new GetObjectCommand({ Bucket: R2_BUCKET, Key: doc.minio_key }),
              )
            }

            if (result.Body) {
              const fileStream = Readable.from(result.Body as AsyncIterable<Uint8Array>)
              const folder = doc.category && doc.category !== 'general' ? `${doc.category}/` : ''
              const fileName = `${folder}${doc.file_name}`
              console.log(`[download-all] adding to archive: ${fileName}`)
              archive.append(fileStream, { name: fileName })
              successCount++
            }
          } catch (fileErr) {
            console.error(`[download-all] error processing ${doc.file_name}:`, fileErr)
            errorCount++
          }
        }

        console.log(`[download-all] added ${successCount}/${documents.length} files (${errorCount} errors)`)
        
        console.log('[download-all] finalizing archive')
        await archive.finalize()
        console.log('[download-all] archive finalized successfully')
      } catch (finalizeErr) {
        console.error('[download-all] error finalizing archive:', finalizeErr)
        nodeStream.destroy(finalizeErr as Error)
      }
    }

    // Start archive population immediately
    // Don't await here — let it run as stream responds
    populateArchive().catch((err) => {
      console.error('[download-all] fatal population error:', err)
      nodeStream.destroy(err)
    })

    const webStream = Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>

    return new NextResponse(webStream, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename*=UTF-8''documents-${familyHeadId}.zip`,
        'Cache-Control': 'no-store',
        'Transfer-Encoding': 'chunked',
      },
    })
  } catch (err) {
    console.error('[download-all] error:', err)
    return apiError('Failed to create ZIP archive', 500)
  }
}
