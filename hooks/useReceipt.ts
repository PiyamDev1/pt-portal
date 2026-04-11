/**
 * Receipt API hook for generate/list/verify/share operations.
 */

'use client'

import { useCallback, useState } from 'react'
import { API_ENDPOINTS } from '@/lib/constants/api'

export type ReceiptServiceType = 'nadra' | 'pk_passport' | 'gb_passport'
export type ReceiptType = 'submission' | 'biometrics' | 'refund' | 'collection'

export type GeneratedReceipt = {
  id: string
  applicationId: string
  applicantId: string
  applicantName: string
  phone: string | null
  email: string | null
  serviceType: ReceiptServiceType
  receiptType: ReceiptType
  trackingNumber: string | null
  applicationPin: string | null
  receiptPin: string
  pricing: {
    serviceDescription: string | null
    costPrice: number | null
    salePrice: number | null
    currency: string
  }
  generatedAt: string
  generatedBy: string | null
  companyName: string
  verificationUrl: string | null
  qrCodeDataUrl: string | null
  plainText: string
}

export type ReceiptSummary = {
  id: string
  serviceType: ReceiptServiceType
  receiptType: ReceiptType
  trackingNumber: string | null
  applicantId: string
  applicantName: string
  generatedAt: string
  isShared?: boolean
  sharedAt?: string | null
  sharedVia?: string | null
  shareCount?: number
  plainText?: string | null
}

function parseApiError(payload: unknown, fallback: string) {
  if (payload && typeof payload === 'object' && 'error' in payload) {
    const value = (payload as { error?: unknown }).error
    if (typeof value === 'string' && value.trim()) return value
  }
  return fallback
}

export function useReceipt() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const withRequest = useCallback(async <T,>(run: () => Promise<T>) => {
    setLoading(true)
    setError(null)
    try {
      return await run()
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setError(message)
      throw err
    } finally {
      setLoading(false)
    }
  }, [])

  const generateReceipt = useCallback(
    async (params: {
      serviceType: ReceiptServiceType
      serviceRecordId: string
      receiptType: ReceiptType
      generatedBy?: string | null
    }) =>
      withRequest(async () => {
        const res = await fetch(API_ENDPOINTS.RECEIPTS_GENERATE, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(params),
        })

        const payload = await res.json()
        if (!res.ok) {
          throw new Error(parseApiError(payload, 'Failed to generate receipt'))
        }

        return payload as { receipt: GeneratedReceipt }
      }),
    [withRequest],
  )

  const verifyReceipt = useCallback(
    async (params: { trackingNumber: string; receiptPin: string }) =>
      withRequest(async () => {
        const res = await fetch(API_ENDPOINTS.RECEIPTS_VERIFY, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(params),
        })

        const payload = await res.json()
        if (!res.ok) {
          throw new Error(parseApiError(payload, 'Failed to verify receipt'))
        }

        return payload as {
          valid: boolean
          supported: boolean
          message?: string
          receipt?: ReceiptSummary
        }
      }),
    [withRequest],
  )

  const listReceipts = useCallback(
    async (params: {
      applicantId?: string
      serviceType?: ReceiptServiceType
      includePayload?: boolean
    }) =>
      withRequest(async () => {
        const search = new URLSearchParams()
        if (params.applicantId) search.set('applicantId', params.applicantId)
        if (params.serviceType) search.set('serviceType', params.serviceType)
        if (params.includePayload) search.set('includePayload', 'true')

        const query = search.toString()
        const url = query
          ? `${API_ENDPOINTS.RECEIPTS_LIST}?${query}`
          : API_ENDPOINTS.RECEIPTS_LIST

        const res = await fetch(url)
        const payload = await res.json()

        if (!res.ok) {
          throw new Error(parseApiError(payload, 'Failed to list receipts'))
        }

        return payload as {
          supported: boolean
          message?: string
          receipts: ReceiptSummary[]
        }
      }),
    [withRequest],
  )

  const markReceiptShared = useCallback(
    async (params: { receiptId: string; channel?: string | null }) =>
      withRequest(async () => {
        const res = await fetch(API_ENDPOINTS.RECEIPTS_SHARE, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(params),
        })

        const payload = await res.json()
        if (!res.ok) {
          throw new Error(parseApiError(payload, 'Failed to update share status'))
        }

        return payload as {
          supported: boolean
          updated: boolean
          receiptId?: string
          shareCount?: number
          channel?: string | null
          sharedAt?: string
          message?: string
        }
      }),
    [withRequest],
  )

  return {
    loading,
    error,
    clearError: () => setError(null),
    generateReceipt,
    verifyReceipt,
    listReceipts,
    markReceiptShared,
  }
}
