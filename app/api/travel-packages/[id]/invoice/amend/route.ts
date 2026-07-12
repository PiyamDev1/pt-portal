import { NextRequest } from 'next/server'
import { apiError, apiOk } from '@/lib/api/http'
import { getRouteSupabaseClient } from '@/lib/api/serverSupabase'
import { recordPackageAuditEvent } from '@/lib/packageAudit'
import type { TravelPackageInvoice } from '@/app/types/packages'
import { selectTravelPackageInvoiceColumns } from '../route'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await getRouteSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return apiError('Unauthorized', 401)
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) return apiError('Invalid JSON body', 400)
  const invoiceId = typeof body.invoiceId === 'string' ? body.invoiceId.trim() : ''
  const reason = typeof body.reason === 'string' ? body.reason.trim() : ''
  if (!invoiceId || !reason) return apiError('Invoice ID and amendment reason are required', 400)

  const { data: before } = await supabase
    .from('travel_package_invoices')
    .select(selectTravelPackageInvoiceColumns())
    .eq('id', invoiceId)
    .eq('package_id', id)
    .single()
  if (!before) return apiError('Package invoice not found', 404)
  const invoice = before as unknown as TravelPackageInvoice
  if (!invoice.released_to_customer && invoice.status !== 'released') {
    return apiError('Only a released invoice needs an amendment revision', 409)
  }

  const { data, error } = await supabase
    .from('travel_package_invoices')
    .update({
      status: 'amended',
      released_to_customer: false,
      version: invoice.version + 1,
      amendment_reason: reason,
      updated_by: user.id,
    })
    .eq('id', invoiceId)
    .eq('package_id', id)
    .select(selectTravelPackageInvoiceColumns())
    .single()
  if (error || !data) return apiError(error?.message || 'Failed to open invoice amendment', 500)
  await supabase.from('travel_packages').update({ invoice_status: 'amended' }).eq('id', id)
  await recordPackageAuditEvent(
    supabase as unknown as Parameters<typeof recordPackageAuditEvent>[0],
    {
      packageId: id,
      quoteId: invoice.quote_id,
      actorId: user.id,
      eventType: 'invoice_amendment_started',
      eventSummary: `Invoice ${invoice.invoice_number} opened as version ${invoice.version + 1}: ${reason}`,
      beforeData: before,
      afterData: data,
    },
  )
  return apiOk({ invoice: data })
}
