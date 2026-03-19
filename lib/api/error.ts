export function toErrorMessage(error: unknown, fallback = 'Unexpected error') {
  if (error instanceof Error) return error.message
  if (error && typeof (error as any).message === 'string') return (error as any).message
  return fallback
}
