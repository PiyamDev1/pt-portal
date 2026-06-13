/**
 * API request parsing helpers.
 *
 * These helpers keep route handlers focused on business logic instead of
 * repetitive JSON parsing and validation boilerplate.
 */

import { z } from 'zod'

/**
 * Parse request JSON and validate it against a Zod schema.
 *
 * We return `{ data, error }` instead of throwing so route handlers can decide
 * whether to surface a 400, enrich the message, or branch on validation state.
 */
export async function parseBodyWithSchema<T>(request: Request, schema: z.ZodType<T>) {
  const parsedJson = await request
    .json()
    .then((value) => value)
    .catch(() => null)

  const parsed = schema.safeParse(parsedJson)
  if (!parsed.success) {
    return { data: null, error: parsed.error.issues[0]?.message || 'Invalid request payload' }
  }

  return { data: parsed.data, error: null }
}

/**
 * Small helper for routes that receive raw URL strings instead of a `URL` instance.
 */
export function getSearchParam(url: string, name: string) {
  return new URL(url).searchParams.get(name)
}
