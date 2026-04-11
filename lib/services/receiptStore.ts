/**
 * Module: lib/services/receiptStore.ts
 * Persistence and lookup for generated receipts.
 */

import { createClient } from '@supabase/supabase-js'
import type { GeneratedReceipt, ReceiptServiceType } from './receiptGenerator'

type PersistResult = {
  persisted: boolean
  reason?: string
}

type PersistParams = {
  receipt: GeneratedReceipt
  serviceRecordId: string
}

export type StoredReceiptSummary = {
  id: string
  serviceType: ReceiptServiceType
  receiptType: string
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

function getSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceRoleKey) {
    throw new Error('Missing Supabase environment variables for receipt storage')
  }

  return createClient(url, serviceRoleKey)
}

function toReason(error: unknown) {
  const message = String((error as { message?: string } | null)?.message || '').toLowerCase()
  const code = String((error as { code?: string } | null)?.code || '')

  if (code === '42P01' || message.includes('does not exist') || message.includes('relation')) {
    return 'generated_receipts table is not available yet'
  }

  if (code === '42703' || message.includes('column')) {
    return 'generated_receipts schema mismatch'
  }

  return 'failed to persist generated receipt'
}

export async function persistGeneratedReceipt({ receipt, serviceRecordId }: PersistParams): Promise<PersistResult> {
  try {
    const supabase = getSupabaseAdminClient()
    const { error } = await supabase.from('generated_receipts').insert({
      id: receipt.id,
      service_type: receipt.serviceType,
      receipt_type: receipt.receiptType,
      service_record_id: serviceRecordId,
      application_id: receipt.applicationId,
      applicant_id: receipt.applicantId,
      tracking_number: receipt.trackingNumber,
      receipt_pin: receipt.receiptPin,
      generated_by: receipt.generatedBy,
      generated_at: receipt.generatedAt,
      is_shared: false,
      shared_at: null,
      shared_via: null,
      share_count: 0,
      payload: receipt,
    })

    if (error) {
      return { persisted: false, reason: toReason(error) }
    }

    return { persisted: true }
  } catch (error) {
    return { persisted: false, reason: toReason(error) }
  }
}

export async function verifyPersistedReceiptByPin(trackingNumber: string, receiptPin: string) {
  try {
    const supabase = getSupabaseAdminClient()
    const { data, error } = await supabase
      .from('generated_receipts')
      .select(
        'id, service_type, receipt_type, applicant_id, tracking_number, generated_at, is_shared, shared_at, shared_via, share_count, payload',
      )
      .eq('tracking_number', trackingNumber)
      .eq('receipt_pin', receiptPin)
      .order('generated_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) {
      return {
        supported: false,
        valid: false,
        reason: toReason(error),
      }
    }

    if (!data) {
      return {
        supported: true,
        valid: false,
      }
    }

    return {
      supported: true,
      valid: true,
      receipt: {
        id: data.id,
        serviceType: data.service_type,
        receiptType: data.receipt_type,
        trackingNumber: data.tracking_number,
        applicantId: data.applicant_id,
        applicantName: data.payload?.applicantName || 'Unknown Applicant',
        generatedAt: data.generated_at,
        isShared: !!data.is_shared,
        sharedAt: data.shared_at || null,
        sharedVia: data.shared_via || null,
        shareCount: Number(data.share_count || 0),
      } as StoredReceiptSummary,
    }
  } catch (error) {
    return {
      supported: false,
      valid: false,
      reason: toReason(error),
    }
  }
}

export async function listPersistedReceipts(params: {
  applicantId?: string
  serviceType?: ReceiptServiceType
  includePayload?: boolean
}) {
  try {
    const supabase = getSupabaseAdminClient()
    let query = supabase
      .from('generated_receipts')
      .select(
        'id, service_type, receipt_type, applicant_id, tracking_number, generated_at, is_shared, shared_at, shared_via, share_count, payload',
      )
      .order('generated_at', { ascending: false })
      .limit(100)

    if (params.applicantId) {
      query = query.eq('applicant_id', params.applicantId)
    }

    if (params.serviceType) {
      query = query.eq('service_type', params.serviceType)
    }

    const { data, error } = await query

    if (error) {
      return {
        supported: false,
        receipts: [] as StoredReceiptSummary[],
        reason: toReason(error),
      }
    }

    const receipts = (data || []).map((row) => ({
      id: row.id,
      serviceType: row.service_type,
      receiptType: row.receipt_type,
      trackingNumber: row.tracking_number,
      applicantId: row.applicant_id,
      applicantName: row.payload?.applicantName || 'Unknown Applicant',
      generatedAt: row.generated_at,
      isShared: !!row.is_shared,
      sharedAt: row.shared_at || null,
      sharedVia: row.shared_via || null,
      shareCount: Number(row.share_count || 0),
      plainText: params.includePayload ? (row.payload?.plainText ?? null) : undefined,
    }))

    return {
      supported: true,
      receipts,
    }
  } catch (error) {
    return {
      supported: false,
      receipts: [] as StoredReceiptSummary[],
      reason: toReason(error),
    }
  }
}

export async function markPersistedReceiptShared(params: {
  receiptId: string
  channel?: string | null
}) {
  try {
    const supabase = getSupabaseAdminClient()
    const { data: existing, error: fetchError } = await supabase
      .from('generated_receipts')
      .select('id, is_shared, share_count')
      .eq('id', params.receiptId)
      .maybeSingle()

    if (fetchError) {
      return { supported: false, updated: false, reason: toReason(fetchError) }
    }

    if (!existing) {
      return { supported: true, updated: false, reason: 'receipt not found' }
    }

    const nextCount = Number(existing.share_count || 0) + 1
    const updates = {
      is_shared: true,
      shared_at: new Date().toISOString(),
      shared_via: params.channel || null,
      share_count: nextCount,
    }

    const { error: updateError } = await supabase
      .from('generated_receipts')
      .update(updates)
      .eq('id', params.receiptId)

    if (updateError) {
      return { supported: false, updated: false, reason: toReason(updateError) }
    }

    return {
      supported: true,
      updated: true,
      receiptId: params.receiptId,
      shareCount: nextCount,
      channel: updates.shared_via,
      sharedAt: updates.shared_at,
    }
  } catch (error) {
    return { supported: false, updated: false, reason: toReason(error) }
  }
}
