/**
 * API request parsing helpers.
 *
 * These helpers keep route handlers focused on business logic instead of
 * repetitive JSON parsing and validation boilerplate.
 */

import { z } from 'zod'

export type BodyParseResult<T> =
  | { data: T; error: null; issues: null }
  | { data: null; error: string; issues: z.core.$ZodIssue[] }

export const DEFAULT_JSON_BODY_LIMIT_BYTES = 1024 * 1024

export type MultipartParseResult =
  | { data: FormData; error: null; status: 200 }
  | { data: null; error: string; status: 400 | 413 }

async function readJsonBody(request: Request, maxBytes: number) {
  const contentLength = Number(request.headers.get('content-length'))
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    return { value: null, error: 'Request body is too large' }
  }

  let text: string
  try {
    text = await request.text()
  } catch {
    return { value: null, error: 'Unable to read request body' }
  }

  if (new TextEncoder().encode(text).byteLength > maxBytes) {
    return { value: null, error: 'Request body is too large' }
  }

  if (!text.trim()) return { value: {}, error: null }

  try {
    return { value: JSON.parse(text), error: null }
  } catch {
    return { value: null, error: 'Invalid JSON request body' }
  }
}

/**
 * Parse request JSON and validate it against a Zod schema.
 *
 * We return `{ data, error }` instead of throwing so route handlers can decide
 * whether to surface a 400, enrich the message, or branch on validation state.
 */
export async function parseBodyWithSchema<TSchema extends z.ZodType>(
  request: Request,
  schema: TSchema,
  options: { maxBytes?: number } = {},
): Promise<BodyParseResult<z.output<TSchema>>> {
  const parsedJson = await readJsonBody(request, options.maxBytes ?? DEFAULT_JSON_BODY_LIMIT_BYTES)
  if (parsedJson.error) {
    return { data: null, error: parsedJson.error, issues: [] }
  }

  const parsed = schema.safeParse(parsedJson.value)
  if (!parsed.success) {
    return {
      data: null,
      error: parsed.error.issues[0]?.message || 'Invalid request payload',
      issues: parsed.error.issues,
    }
  }

  return { data: parsed.data, error: null, issues: null }
}

/**
 * Read and parse multipart data without trusting Content-Length. The stream is
 * cancelled as soon as its real byte count exceeds the route-specific limit,
 * preventing chunked uploads from being buffered without a bound.
 */
export async function parseMultipartFormDataWithLimit(
  request: Request,
  maxBytes: number,
): Promise<MultipartParseResult> {
  const contentLength = Number(request.headers.get('content-length'))
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    return { data: null, error: 'Request body is too large', status: 413 }
  }

  try {
    if (!request.body) {
      // Supports synthetic route-test requests while still checking the
      // aggregate field/file size after their FormData is produced.
      const data = await request.formData()
      let approximateBytes = 0
      for (const [, value] of data.entries()) {
        approximateBytes +=
          typeof value === 'string' ? new TextEncoder().encode(value).byteLength : value.size
        if (approximateBytes > maxBytes) {
          return { data: null, error: 'Request body is too large', status: 413 }
        }
      }
      return { data, error: null, status: 200 }
    }

    const reader = request.body.getReader()
    const chunks: Uint8Array[] = []
    let totalBytes = 0

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value) continue
      totalBytes += value.byteLength
      if (totalBytes > maxBytes) {
        await reader.cancel('multipart body limit exceeded').catch(() => undefined)
        return { data: null, error: 'Request body is too large', status: 413 }
      }
      chunks.push(value)
    }

    const contentType = request.headers.get('content-type') || ''
    if (!contentType.toLowerCase().startsWith('multipart/form-data')) {
      return { data: null, error: 'Expected multipart form data', status: 400 }
    }

    const body = new Uint8Array(totalBytes)
    let offset = 0
    for (const chunk of chunks) {
      body.set(chunk, offset)
      offset += chunk.byteLength
    }

    const data = await new Response(body, {
      headers: { 'content-type': contentType },
    }).formData()
    return { data, error: null, status: 200 }
  } catch {
    return { data: null, error: 'Invalid multipart form data', status: 400 }
  }
}

/**
 * Small helper for routes that receive raw URL strings instead of a `URL` instance.
 */
export function getSearchParam(url: string, name: string) {
  return new URL(url).searchParams.get(name)
}
