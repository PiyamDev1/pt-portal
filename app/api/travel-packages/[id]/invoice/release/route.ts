import { NextRequest } from 'next/server'
import { apiError, apiOk } from '@/lib/api/http'
import { getRouteSupabaseClient } from '@/lib/api/serverSupabase'
import { createCustomerInvoiceSnapshot } from '@/lib/packageInvoices'
import { recordPackageAuditEvent } from '@/lib/packageAudit'
import type { TravelPackageInvoice, TravelPackageInvoiceLine } from '@/app/types/packages'
import { selectTravelPackageInvoiceColumns, selectTravelPackageInvoiceLineColumns } from '../route'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await getRouteSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return apiError('Unauthorized', 401)
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const invoiceId = typeof body.invoiceId === 'string' ? body.invoiceId.trim() : ''
  if (!invoiceId) return apiError('Invoice ID is required', 400)

  const [{ data: invoiceData, error: invoiceError }, { data: lineData, error: lineError }] =
    await Promise.all([
      supabase
        .from('travel_package_invoices')
        .select(selectTravelPackageInvoiceColumns())
        .eq('id', invoiceId)
        .eq('package_id', id)
        .single(),
      supabase
        .from('travel_package_invoice_lines')
        .select(selectTravelPackageInvoiceLineColumns())
        .eq('invoice_id', invoiceId)
        .eq('package_id', id)
        .order('sort_order'),
    ])
  if (invoiceError || !invoiceData) return apiError('Package invoice not found', 404)
  if (lineError) return apiError(lineError.message || 'Failed to load invoice lines', 500)
  const invoice = invoiceData as unknown as TravelPackageInvoice
  if (invoice.status === 'void') return apiError('A void invoice cannot be released', 409)
  if (invoice.total_sold <= 0)
    return apiError('Invoice total must be greater than zero before release', 409)

  const lines = (lineData || []) as unknown as TravelPackageInvoiceLine[]
  const snapshot = createCustomerInvoiceSnapshot(invoice, lines)
  const now = new Date().toISOString()

  await supabase
    .from('travel_package_versions')
    .update({ visibility: 'revoked' })
    .eq('package_id', id)
    .eq('object_type', 'invoice')
    .eq('visibility', 'released_to_customer')
  const { error: versionError } = await supabase.from('travel_package_versions').insert({
    package_id: id,
    quote_id: invoice.quote_id,
    object_type: 'invoice',
    object_id: invoice.id,
    version_number: invoice.version,
    visibility: 'released_to_customer',
    snapshot,
    customer_change_summary:
      typeof body.changeSummary === 'string' ? body.changeSummary.trim() || null : null,
    internal_change_summary: `Invoice version ${invoice.version} released.`,
    created_by: user.id,
    released_at: now,
    released_by: user.id,
  })
  if (versionError)
    return apiError(versionError.message || 'Failed to snapshot released invoice', 500)

  const { data, error } = await supabase
    .from('travel_package_invoices')
    .update({
      status: 'released',
      released_to_customer: true,
      released_at: now,
      released_by: user.id,
      released_version: invoice.version,
      finalised_at: invoice.finalised_at || now,
      updated_by: user.id,
    })
    .eq('id', invoiceId)
    .eq('package_id', id)
    .select(selectTravelPackageInvoiceColumns())
    .single()
  if (error || !data) return apiError(error?.message || 'Failed to release invoice', 500)
  await supabase
    .from('travel_packages')
    .update({ invoice_status: 'released_to_customer' })
    .eq('id', id)
  await recordPackageAuditEvent(
    supabase as unknown as Parameters<typeof recordPackageAuditEvent>[0],
    {
      packageId: id,
      quoteId: invoice.quote_id,
      actorId: user.id,
      eventType: 'invoice_released',
      eventSummary: `Invoice ${invoice.invoice_number} version ${invoice.version} released to customer.`,
      beforeData: invoice,
      afterData: data,
    },
  )
  return apiOk({ invoice: { ...(data as object), lines }, releasedSnapshot: snapshot })
}
