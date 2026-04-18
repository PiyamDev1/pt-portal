/**
 * Frappe Integration Client
 *
 * Thin typed wrapper around Frappe REST API with retry and idempotent request support.
 */

import { toErrorMessage } from '@/lib/api/error'

const DEFAULT_TIMEOUT_MS = 12_000
const RETRYABLE_STATUS_CODES = new Set([408, 409, 425, 429, 500, 502, 503, 504])

export type FrappeRequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  query?: Record<string, string | number | boolean | null | undefined>
  body?: unknown
  headers?: Record<string, string>
  timeoutMs?: number
  retries?: number
  idempotencyKey?: string
}

export type FrappeClientConfig = {
  baseUrl: string
  apiToken?: string
  apiKey?: string
  apiSecret?: string
}

function getFrappeConfigFromEnv(): FrappeClientConfig {
  const baseUrl = process.env.FRAPPE_BASE_URL || ''
  const apiToken = process.env.FRAPPE_API_TOKEN
  const apiKey = process.env.FRAPPE_API_KEY
  const apiSecret = process.env.FRAPPE_API_SECRET

  if (!baseUrl) {
    throw new Error('FRAPPE_BASE_URL is not configured')
  }

  if (!apiToken && !(apiKey && apiSecret)) {
    throw new Error('Configure FRAPPE_API_TOKEN or FRAPPE_API_KEY + FRAPPE_API_SECRET')
  }

  return { baseUrl, apiToken, apiKey, apiSecret }
}

function buildAuthHeader(config: FrappeClientConfig) {
  if (config.apiToken) {
    return `Bearer ${config.apiToken}`
  }
  return `token ${config.apiKey}:${config.apiSecret}`
}

function buildUrl(baseUrl: string, path: string, query?: FrappeRequestOptions['query']) {
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  const url = new URL(`${normalizedBase}${normalizedPath}`)

  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === null || value === undefined) continue
      url.searchParams.set(key, String(value))
    }
  }

  return url.toString()
}

function shouldRetry(statusCode: number) {
  return RETRYABLE_STATUS_CODES.has(statusCode)
}

const delay = async (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export async function frappeRequest<T = unknown>(
  path: string,
  options: FrappeRequestOptions = {},
): Promise<T> {
  const config = getFrappeConfigFromEnv()
  const method = options.method || 'GET'
  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS
  const retries = Math.max(options.retries ?? 2, 0)

  const headers: Record<string, string> = {
    Authorization: buildAuthHeader(config),
    Accept: 'application/json',
    ...options.headers,
  }

  if (options.idempotencyKey) {
    headers['X-Idempotency-Key'] = options.idempotencyKey
  }

  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json'
  }

  const url = buildUrl(config.baseUrl, path, options.query)

  let lastError: unknown = null

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)

    try {
      const response = await fetch(url, {
        method,
        headers,
        signal: controller.signal,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
      })

      clearTimeout(timeout)

      if (!response.ok) {
        const errorPayload = await response.text().catch(() => '')
        const error = new Error(
          `Frappe request failed (${response.status} ${response.statusText}): ${errorPayload}`,
        )

        if (attempt < retries && shouldRetry(response.status)) {
          await delay(250 * (attempt + 1) * (attempt + 1))
          continue
        }

        throw error
      }

      const text = await response.text()
      return (text ? JSON.parse(text) : {}) as T
    } catch (error) {
      clearTimeout(timeout)
      lastError = error

      if (attempt < retries) {
        await delay(250 * (attempt + 1) * (attempt + 1))
        continue
      }
    }
  }

  throw new Error(toErrorMessage(lastError, 'Unknown Frappe request failure'))
}

export async function frappePing() {
  const response = await frappeRequest<{ message?: unknown }>('/api/method/ping', {
    method: 'GET',
    retries: 1,
  })
  return response
}
