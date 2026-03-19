import type { SaveVisaApplicationPayload, VisaMetadata } from '@/app/types/visa'

// API calls for visa applications
export async function loadVisaMetadata(): Promise<VisaMetadata> {
  try {
    const res = await fetch('/api/visas/metadata')
    const data: VisaMetadata = await res.json()
    return data
  } catch (err) {
    console.error('Metadata Load Error', err)
    throw err
  }
}

export async function saveVisaApplication(payload: SaveVisaApplicationPayload) {
  try {
    const res = await fetch('/api/visas/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const result = await res.json()

    if (!res.ok) {
      throw new Error(result.error || 'Failed to save')
    }

    return result
  } catch (err: unknown) {
    console.error('Save Error', err)
    throw new Error(err instanceof Error ? err.message : 'Failed to save application')
  }
}
