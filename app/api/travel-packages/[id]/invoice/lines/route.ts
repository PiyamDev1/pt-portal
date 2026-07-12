import { NextRequest } from 'next/server'
import { apiError, apiOk } from '@/lib/api/http'
import { getRouteSupabaseClient } from '@/lib/api/serverSupabase'
import { normalizePackageInvoiceLineType, roundPackageInvoiceMoney } from '@/lib/packageInvoices'
import { recalculatePackageInvoice } from '@/lib/packageInvoiceServer'
import { recordPackageAuditEvent } from '@/lib/packageAudit'
import { selectTravelPackageInvoiceLineColumns } from '../route'

function cleanText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await getRouteSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return apiError('Unauthorized', 401)
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) return apiError('Invalid JSON body', 400)

  const invoiceId = cleanText(body.invoiceId || body.invoice_id)
  const description = cleanText(body.description)
  if (!invoiceId || !description) return apiError('Invoice and description are required', 400)
  const quantity = Math.max(0, roundPackageInvoiceMoney(body.quantity || 1))
  const unitSoldPrice = roundPackageInvoiceMoney(body.unitSoldPrice ?? body.unit_sold_price)
  const unitBookedCost = roundPackageInvoiceMoney(body.unitBookedCost ?? body.unit_booked_cost)

  const { data, error } = await supabase
    .from('travel_package_invoice_lines')
    .insert({
      invoice_id: invoiceId,
      package_id: id,
      line_type: normalizePackageInvoiceLineType(body.lineType || body.line_type),
      description,
      quantity,
      unit_sold_price: unitSoldPrice,
      total_sold_price: roundPackageInvoiceMoney(quantity * unitSoldPrice),
      unit_booked_cost: unitBookedCost,
      total_booked_cost: roundPackageInvoiceMoney(quantity * unitBookedCost),
      discount_amount: roundPackageInvoiceMoney(body.discountAmount ?? body.discount_amount),
      expected_commission: roundPackageInvoiceMoney(
        body.expectedCommission ?? body.expected_commission,
      ),
      received_commission: roundPackageInvoiceMoney(
        body.receivedCommission ?? body.received_commission,
      ),
      customer_visible: body.customerVisible ?? body.customer_visible ?? true,
      sort_order: Number.isFinite(Number(body.sortOrder ?? body.sort_order))
        ? Number(body.sortOrder ?? body.sort_order)
        : 0,
      metadata: { source: 'manual' },
    })
    .select(selectTravelPackageInvoiceLineColumns())
    .single()
  if (error || !data) return apiError(error?.message || 'Failed to add invoice line', 500)

  const recalculated = await recalculatePackageInvoice(supabase, id, invoiceId).catch(() => null)
  await recordPackageAuditEvent(
    supabase as unknown as Parameters<typeof recordPackageAuditEvent>[0],
    {
      packageId: id,
      actorId: user.id,
      eventType: 'invoice_line_created',
      eventSummary: `Invoice line "${description}" added.`,
      afterData: data,
    },
  )
  return apiOk({ line: data, invoice: recalculated?.invoice || null }, { status: 201 })
}
