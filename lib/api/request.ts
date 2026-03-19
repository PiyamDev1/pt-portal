/**
 * API Request Processing Utilities
 * Parse and validate request bodies with Zod schemas
 * Helper functions for common request patterns
 * 
 * @module lib/api/request
 */

import { z } from 'zod'

/**
 * Parse request JSON body and validate it against a Zod schema
 * @param request The fetch Request object
 * @param schema Zod schema to validate against
 * @returns Object with parsed data or error message
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
 * Extract a query parameter from a URL string
 * @param url The full URL string
 * @param name The query parameter name to extract
 * @returns The parameter value or null if not found
 */
export function getSearchParam(url: string, name: string) {
  return new URL(url).searchParams.get(name)
}
