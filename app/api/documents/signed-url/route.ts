import {
  getSignedDocumentPreviewUrl,
  getSignedDocumentUrlByKey,
} from '@/lib/services/documentServer'
import { apiError, apiOk } from '@/lib/api/http'
import { requireStaffSession } from '@/lib/auth/staffSession'

export async function GET(request: Request) {
  const access = await requireStaffSession()
  if (!access.authorized) return access.response

  try {
    const { searchParams } = new URL(request.url)
    const documentId = searchParams.get('documentId')
    const key = searchParams.get('key')

    if (!documentId && !key) {
      return apiError('Missing documentId parameter', 400)
    }

    const url = documentId
      ? await getSignedDocumentPreviewUrl(documentId)
      : await getSignedDocumentUrlByKey(key || '')
    return apiOk({ url }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } })
  } catch (error) {
    if (error instanceof Error && error.message === 'Document not found') {
      return apiError('Document not found', 404)
    }
    return apiError('Failed to generate signed URL', 500)
  }
}
