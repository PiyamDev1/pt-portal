/**
 * API Route: Web Vitals Beacon
 *
 * POST /api/vitals
 *
 * Receives Core Web Vitals metrics from the client-side WebVitalsReporter
 * component and acknowledges receipt. Currently a stub — metrics are logged
 * and discarded. Integrate with an analytics provider (e.g. Vercel Analytics,
 * Datadog) here when ready.
 *
 * Authentication: None (open endpoint, payload is low-sensitivity perf data)
 * Response Success (200): { received: true }
 * Response Errors: 400 Invalid JSON payload
 */
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
