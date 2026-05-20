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

    // Create a Readable stream that will emit the ZIP data
    // The archive will write to this stream as it processes files
    const archive = archiverFactory('zip', { zlib: { level: 6 } })
    
    const nodeStream = new Readable({
      read() {}, // noop — data is pushed by archiver
    })

    archive.on('error', (err) => {
      console.error('[download-all] archiver error:', err)
      nodeStream.destroy(err)
    })

    archive.pipe(nodeStream)

    // Start populating files immediately (stream-driven)
    const s3Client = getS3Client()
    
    ;(async () => {
      try {
        for (const doc of documents) {
          try {
            const bucket = doc.minio_bucket || MINIO_BUCKET
            let result

            try {
              result = await s3Client.send(
                new GetObjectCommand({ Bucket: bucket, Key: doc.minio_key }),
              )
            } catch (minioErr) {
              if (!isR2Configured()) throw minioErr

              const r2Client = getR2Client()
              result = await r2Client.send(
                new GetObjectCommand({ Bucket: R2_BUCKET, Key: doc.minio_key }),
              )
            }

            if (result.Body) {
              const fileStream = Readable.from(result.Body as AsyncIterable<Uint8Array>)
              const folder = doc.category && doc.category !== 'general' ? `${doc.category}/` : ''
              archive.append(fileStream, { name: `${folder}${doc.file_name}` })
            }
          } catch (fileErr) {
            console.error(`[download-all] skipping ${doc.file_name}:`, fileErr)
          }
        }

        await archive.finalize()
      } catch (err) {
        console.error('[download-all] error:', err)
        archive.destroy()
      }
    })()

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
