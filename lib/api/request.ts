import { z } from 'zod'

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

export function getSearchParam(url: string, name: string) {
  return new URL(url).searchParams.get(name)
}
