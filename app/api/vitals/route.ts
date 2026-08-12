/**
 * API Route: Web Vitals Beacon
 *
 * POST /api/vitals
 *
 * Receives bounded Core Web Vitals and API-latency metrics from the client-side
 * reporters. API-latency metrics are emitted through structured server logs;
 * browser Web Vitals are validated and acknowledged without retaining raw
 * performance entries.
 *
 * Authentication: None (open endpoint, payload is low-sensitivity perf data)
 * Response Success (200): { received: true }
 * Response Errors: 400 Invalid payload, 413 Payload too large
 */
import { z } from 'zod'
import { apiError, apiOk } from '@/lib/api/http'
import { parseBodyWithSchema } from '@/lib/api/request'
import { logServerEvent } from '@/lib/observability/server'
import { enforceRateLimit, getClientIp } from '@/lib/security/rateLimit'

const VITALS_BODY_LIMIT_BYTES = 8 * 1024
const RATING_VALUES = ['good', 'needs-improvement', 'poor'] as const

const browserVitalSchema = z
  .object({
    name: z.enum(['CLS', 'FCP', 'INP', 'LCP', 'TTFB']),
    value: z.number().finite().nonnegative(),
    id: z.string().trim().min(1).max(256).optional(),
    delta: z.number().finite().optional(),
    rating: z.enum(RATING_VALUES).optional(),
    navigationType: z.string().trim().max(64).optional(),
    entries: z.array(z.unknown()).max(100).optional(),
  })
  .strip()

const apiLatencySchema = z
  .object({
    name: z.literal('api-latency'),
    value: z.number().finite().nonnegative(),
    path: z.string().trim().startsWith('/api/').max(2_000),
    status: z.number().int().min(0).max(599),
    rating: z.enum(RATING_VALUES),
    navigationType: z.literal('fetch').optional(),
    timestamp: z.number().finite().optional(),
  })
  .strip()

const performanceMetricSchema = z.union([browserVitalSchema, apiLatencySchema])

export async function POST(request: Request) {
  const limit = await enforceRateLimit(request, {
    scope: 'public.performance-metrics',
    limit: 120,
    windowSeconds: 60,
    identities: [`ip:${getClientIp(request)}`],
    message: 'Too many performance metrics. Please wait before sending more.',
    unavailable: 'allow',
  })
  if (!limit.allowed) return limit.response

  const { data: metric, error } = await parseBodyWithSchema(request, performanceMetricSchema, {
    maxBytes: VITALS_BODY_LIMIT_BYTES,
  })
  if (error || !metric) {
    return apiError(
      error || 'Invalid performance metric payload',
      error === 'Request body is too large' ? 413 : 400,
    )
  }

  if (metric.name === 'api-latency') {
    logServerEvent({
      event: 'performance.api_latency',
      level: 'warn',
      request,
      context: {
        apiPath: metric.path,
        durationMs: metric.value,
        status: metric.status,
        rating: metric.rating,
      },
    })
  }

  return apiOk({ received: true })
}
