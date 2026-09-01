import { NextResponse } from 'next/server'

export type CustomerIntegrationErrorCode =
  | 'validation_failed'
  | 'authentication_required'
  | 'forbidden'
  | 'not_found'
  | 'lookup_not_matched'
  | 'rate_limited'
  | 'conflict'
  | 'expired'
  | 'cutoff_reached'
  | 'service_unavailable'
  | 'internal_error'

export class CustomerIntegrationError extends Error {
  constructor(
    readonly code: CustomerIntegrationErrorCode,
    message: string,
    readonly status = 400,
    options?: { cause?: unknown },
  ) {
    super(message)
    this.name = 'CustomerIntegrationError'
    if (options?.cause !== undefined) {
      ;(this as Error & { cause?: unknown }).cause = options.cause
    }
  }
}

const privateHeaders = {
  'Cache-Control': 'private, no-store, max-age=0, must-revalidate',
  Pragma: 'no-cache',
  Vary: 'Authorization',
}

export function customerIntegrationOk<T>(data: T, requestId: string, init?: ResponseInit) {
  return NextResponse.json(
    { data, error: null, requestId },
    {
      ...init,
      headers: {
        ...privateHeaders,
        'x-request-id': requestId,
        ...Object.fromEntries(new Headers(init?.headers).entries()),
      },
    },
  )
}

export function customerIntegrationError(error: CustomerIntegrationError, requestId: string) {
  return NextResponse.json(
    {
      data: null,
      error: { code: error.code, message: error.message },
      requestId,
    },
    {
      status: error.status,
      headers: { ...privateHeaders, 'x-request-id': requestId },
    },
  )
}

export function customerIntegrationCached(body: unknown, status: number, requestId: string) {
  return NextResponse.json(body, {
    status,
    headers: { ...privateHeaders, 'x-request-id': requestId },
  })
}

export function integrationRequestId(request: Request) {
  const value = request.headers.get('x-request-id')
  return value && /^[A-Za-z0-9._:-]{8,128}$/.test(value) ? value : crypto.randomUUID()
}

export function withCustomerIntegrationRoute<C = { params: Promise<Record<string, never>> }>(
  handler: (request: Request, context: C) => Promise<Response>,
) {
  return async (request: Request, context: C) => {
    const requestId = integrationRequestId(request)
    try {
      return await handler(request, context)
    } catch (error) {
      if (error instanceof CustomerIntegrationError) {
        return customerIntegrationError(error, requestId)
      }
      console.error('Customer integration route failed', {
        requestId,
        errorName: error instanceof Error ? error.name : 'UnknownError',
      })
      return customerIntegrationError(
        new CustomerIntegrationError(
          'internal_error',
          'The integration request could not be completed.',
          500,
        ),
        requestId,
      )
    }
  }
}
