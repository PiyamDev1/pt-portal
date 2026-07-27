import { NextRequest } from 'next/server'
import { apiError, apiOk } from '@/lib/api/http'
import { getServiceSupabaseClient } from '@/lib/api/serviceSupabase'
import { isPackageQuoteExpired, resolvePackageSelection } from '@/lib/packageQuote'
import type { PackageSelectionInput } from '@/app/types/packages'
import { recordPackageAuditEvent } from '@/lib/packageAudit'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params
  const cleanToken = token.trim()
  if (!cleanToken) return apiError('Missing share token', 400)

  const body = (await request.json().catch(() => null)) as PackageSelectionInput | null
  if (!body || !body.stayOptionIds) return apiError('Missing package selection', 400)
  const saveOnly = body.saveOnly === true
  const selectionInput = { ...body }
  delete selectionInput.saveOnly
  if (!saveOnly && !body.termsAccepted) {
    return apiError('Please confirm that you have read the terms and conditions.', 400)
  }

  const supabase = getServiceSupabaseClient()
  const { data: quote, error } = await supabase
    .from('travel_package_quotes')
    .select('id, payload, expires_at')
    .eq('share_token', cleanToken)
    .eq('share_enabled', true)
    .neq('status', 'archived')
    .single()

  if (error || !quote) {
    return apiError('Package quote not found or no longer available', 404)
  }

  if (isPackageQuoteExpired((quote as { expires_at?: string }).expires_at)) {
    return apiError(
      'This package quote has expired. Please contact your agent for an updated quote.',
      410,
    )
  }

  let resolved
  try {
    resolved = resolvePackageSelection(quote.payload, selectionInput)
  } catch (selectionError) {
    return apiError(
      selectionError instanceof Error ? selectionError.message : 'Invalid package selection',
      400,
    )
  }

  const now = new Date().toISOString()
  const updatePayload: Record<string, unknown> = saveOnly
    ? {
        selected_option: resolved,
        selected_at: now,
        selection_note: resolved.selection.note || null,
        customer_name: resolved.selection.customerName || null,
        customer_phone: resolved.selection.customerPhone || null,
        customer_email: resolved.selection.customerEmail || null,
        customer_selection_note: resolved.selection.note || null,
      }
    : {
        selected_option: resolved,
        selected_at: now,
        selection_note: resolved.selection.note || null,
        customer_name: resolved.selection.customerName || null,
        customer_phone: resolved.selection.customerPhone || null,
        customer_email: resolved.selection.customerEmail || null,
        status: 'customer_selected',
        finalised_at: now,
        finalised_source: 'customer',
        customer_selection_note: resolved.selection.note || null,
      }

  const { error: updateError } = await supabase
    .from('travel_package_quotes')
    .update(updatePayload)
    .eq('id', quote.id)

  if (updateError) {
    return apiError(updateError.message || 'Failed to save package selection', 500)
  }

  await recordPackageAuditEvent(
    supabase as unknown as Parameters<typeof recordPackageAuditEvent>[0],
    {
      quoteId: quote.id,
      eventType: saveOnly ? 'customer_quote_selection_saved' : 'customer_quote_finalised',
      eventSummary: saveOnly
        ? 'Customer saved a linked package selection.'
        : 'Customer finalised a package selection.',
      afterData: resolved,
      metadata: { source: 'customer', saveOnly },
    },
  )

  return apiOk({ selected: resolved, saveOnly })
}
