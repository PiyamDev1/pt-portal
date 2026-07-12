import { NextRequest } from 'next/server'
import { apiError, apiOk } from '@/lib/api/http'
import { getRouteSupabaseClient } from '@/lib/api/serverSupabase'
import { normalizePackageInvoiceLineType, roundPackageInvoiceMoney } from '@/lib/packageInvoices'
import { recalculatePackageInvoice } from '@/lib/packageInvoiceServer'
import { recordPackageAuditEvent } from '@/lib/packageAudit'
import type { TravelPackageInvoiceLine } from '@/app/types/packages'
import { selectTravelPackageInvoiceLineColumns } from '../../route'

function cleanText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; lineId: string }> },
) {
  const { id, lineId } = await params
  const supabase = await getRouteSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return apiError('Unauthorized', 401)
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) return apiError('Invalid JSON body', 400)

  const { data: before } = await supabase
    .from('travel_package_invoice_lines')
    .select(selectTravelPackageInvoiceLineColumns())
    .eq('id', lineId)
    .eq('package_id', id)
    .single()
  if (!before) return apiError('Invoice line not found', 404)
  const current = before as unknown as TravelPackageInvoiceLine
  const quantity =
    'quantity' in body ? Math.max(0, roundPackageInvoiceMoney(body.quantity)) : current.quantity
  const unitSoldPrice =
    'unitSoldPrice' in body || 'unit_sold_price' in body
      ? roundPackageInvoiceMoney(body.unitSoldPrice ?? body.unit_sold_price)
      : current.unit_sold_price
  const unitBookedCost =
    'unitBookedCost' in body || 'unit_booked_cost' in body
      ? roundPackageInvoiceMoney(body.unitBookedCost ?? body.unit_booked_cost)
      : current.unit_booked_cost
  const update = {
    line_type:
      'lineType' in body || 'line_type' in body
        ? normalizePackageInvoiceLineType(body.lineType ?? body.line_type)
        : current.line_type,
    description: 'description' in body ? cleanText(body.description) : current.description,
    quantity,
    unit_sold_price: unitSoldPrice,
    total_sold_price: roundPackageInvoiceMoney(quantity * unitSoldPrice),
    unit_booked_cost: unitBookedCost,
    total_booked_cost: roundPackageInvoiceMoney(quantity * unitBookedCost),
    discount_amount:
      'discountAmount' in body || 'discount_amount' in body
        ? roundPackageInvoiceMoney(body.discountAmount ?? body.discount_amount)
        : current.discount_amount,
    expected_commission:
      'expectedCommission' in body || 'expected_commission' in body
        ? roundPackageInvoiceMoney(body.expectedCommission ?? body.expected_commission)
        : current.expected_commission,
    received_commission:
      'receivedCommission' in body || 'received_commission' in body
        ? roundPackageInvoiceMoney(body.receivedCommission ?? body.received_commission)
        : current.received_commission,
    customer_visible:
      'customerVisible' in body || 'customer_visible' in body
        ? Boolean(body.customerVisible ?? body.customer_visible)
        : current.customer_visible,
    sort_order:
      'sortOrder' in body || 'sort_order' in body
        ? Number(body.sortOrder ?? body.sort_order)
        : current.sort_order,
  }
  if (!update.description) return apiError('Description is required', 400)

  const { data, error } = await supabase
    .from('travel_package_invoice_lines')
    .update(update)
    .eq('id', lineId)
    .eq('package_id', id)
    .select(selectTravelPackageInvoiceLineColumns())
    .single()
  if (error || !data) return apiError(error?.message || 'Failed to update invoice line', 500)

  const recalculated = await recalculatePackageInvoice(supabase, id, current.invoice_id).catch(
    () => null,
  )
  await recordPackageAuditEvent(
    supabase as unknown as Parameters<typeof recordPackageAuditEvent>[0],
    {
      packageId: id,
      actorId: user.id,
      eventType: 'invoice_line_updated',
      eventSummary: `Invoice line "${update.description}" updated.`,
      beforeData: before,
      afterData: data,
    },
  )
  return apiOk({ line: data, invoice: recalculated?.invoice || null })
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; lineId: string }> },
) {
  const { id, lineId } = await params
  const supabase = await getRouteSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return apiError('Unauthorized', 401)

  const { data: before } = await supabase
    .from('travel_package_invoice_lines')
    .select(selectTravelPackageInvoiceLineColumns())
    .eq('id', lineId)
    .eq('package_id', id)
    .single()
  if (!before) return apiError('Invoice line not found', 404)
  const line = before as unknown as TravelPackageInvoiceLine
  const { error } = await supabase
    .from('travel_package_invoice_lines')
    .delete()
    .eq('id', lineId)
    .eq('package_id', id)
  if (error) return apiError(error.message || 'Failed to delete invoice line', 500)
  const recalculated = await recalculatePackageInvoice(supabase, id, line.invoice_id).catch(
    () => null,
  )
  await recordPackageAuditEvent(
    supabase as unknown as Parameters<typeof recordPackageAuditEvent>[0],
    {
      packageId: id,
      actorId: user.id,
      eventType: 'invoice_line_deleted',
      eventSummary: `Invoice line "${line.description}" deleted.`,
      beforeData: before,
    },
  )
  return apiOk({ deleted: true, invoice: recalculated?.invoice || null })
}
