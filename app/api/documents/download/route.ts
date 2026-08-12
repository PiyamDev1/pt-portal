import { NextRequest, NextResponse } from 'next/server'
import { Readable } from 'stream'
import { apiError } from '@/lib/api/http'
import { requireStaffSession } from '@/lib/auth/staffSession'
import {
  findStoredDocumentById,
  findStoredDocumentByKey,
  readStoredDocument,
} from '@/lib/services/documentServer'
import { documentContentDisposition } from '@/lib/documentSecurity'

/**
 * Streams an authenticated document download. The legacy key parameter is
 * resolved through the database so it cannot be used as an arbitrary S3 read.
 */
export async function GET(request: NextRequest) {
  const access = await requireStaffSession()
  if (!access.authorized) return access.response

  try {
    const { searchParams } = new URL(request.url)
    const documentId = searchParams.get('documentId')
    const key = searchParams.get('key')

    if (!documentId && !key) {
      return apiError('documentId is required', 400)
    }

    const document = documentId
      ? await findStoredDocumentById(documentId)
      : await findStoredDocumentByKey(key || '')
    if (!document) return apiError('Document not found', 404)

    const result = await readStoredDocument(document)
    if (!result.Body) return apiError('File body is empty', 404)

    const stream = Readable.from(result.Body as AsyncIterable<Uint8Array>)
    const webStream = Readable.toWeb(stream) as ReadableStream<Uint8Array>

    return new NextResponse(webStream, {
      headers: {
        'Content-Type': document.fileType,
        'Content-Disposition': documentContentDisposition(document.fileName, 'attachment'),
        'Cache-Control': 'private, no-store, max-age=0',
        Pragma: 'no-cache',
        Expires: '0',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer',
      },
    })
  } catch {
    return apiError('Failed to download file', 500)
  }
}
