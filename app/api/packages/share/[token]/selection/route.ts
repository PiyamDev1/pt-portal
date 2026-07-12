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
    return apiError('This package quote has expired. Please contact your agent for an updated quote.', 410)
  }

  let resolved
  try {
    resolved = resolvePackageSelection(quote.payload, body)
  } catch (selectionError) {
    return apiError(
      selectionError instanceof Error ? selectionError.message : 'Invalid package selection',
      400,
    )
  }

  const { error: updateError } = await supabase
    .from('travel_package_quotes')
    .update({
      selected_option: resolved,
      selected_at: new Date().toISOString(),
      selection_note: resolved.selection.note || null,
      customer_name: resolved.selection.customerName || null,
      customer_phone: resolved.selection.customerPhone || null,
      customer_email: resolved.selection.customerEmail || null,
      status: 'customer_selected',
      finalised_at: new Date().toISOString(),
      finalised_source: 'customer',
      customer_selection_note: resolved.selection.note || null,
    })
    .eq('id', quote.id)

  if (updateError) {
    return apiError(updateError.message || 'Failed to save package selection', 500)
  }

  await recordPackageAuditEvent(
    supabase as unknown as Parameters<typeof recordPackageAuditEvent>[0],
    {
      quoteId: quote.id,
      eventType: 'customer_quote_finalised',
      eventSummary: 'Customer finalised a package selection.',
      afterData: resolved,
      metadata: { source: 'customer' },
    },
  )

  return apiOk({ selected: resolved })
}
