import { getSignedDocumentPreviewUrl } from '@/lib/services/documentServer'
import { apiError, apiOk } from '@/lib/api/http'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const key = searchParams.get('key')

    if (!key) {
      return apiError('Missing key parameter', 400)
    }

    const url = await getSignedDocumentPreviewUrl(key)
    return apiOk({ url })
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Failed to generate signed URL', 500)
  }
}
