/**
 * Visa Application API Client
 * Client-side API calls for visa application operations
 * Provides typed wrappers around fetch calls to visa endpoints
 * 
 * @module lib/visaApi
 */

import type { SaveVisaApplicationPayload, VisaMetadata } from '@/app/types/visa'

/**
 * Load visa metadata (countries, visa types, pricing)
 * @returns Promise resolving to visa metadata object
 * @throws Error if metadata fetch fails
 */
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

/**
 * Save or update a visa application
 * @param payload The visa application data to save
 * @returns Promise resolving to the API response
 * @throws Error if save fails or returns error status
 */
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
