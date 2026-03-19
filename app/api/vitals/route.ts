import { apiError, apiOk } from '@/lib/api/http'
import { toErrorMessage } from '@/lib/api/error'

export async function POST(request: Request) {
  try {
    await request.json()
    // TODO: send to analytics provider (consider Vercel Web Analytics or Datadog)
    return apiOk({ received: true })
  } catch (error) {
    return apiError(toErrorMessage(error, 'Invalid payload'), 400)
  }
}
