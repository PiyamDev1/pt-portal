import type { SupabaseClient } from '@supabase/supabase-js'
import type { TravelPackageInvoice, TravelPackageInvoiceLine } from '@/app/types/packages'
import { calculatePackageInvoiceTotals, roundPackageInvoiceMoney } from '@/lib/packageInvoices'

export async function recalculatePackageInvoice(
  supabase: SupabaseClient,
  packageId: string,
  invoiceId: string,
) {
  const [
    { data: invoiceData, error: invoiceError },
    { data: lineData, error: lineError },
    { data: paymentData },
  ] = await Promise.all([
    supabase
      .from('travel_package_invoices')
      .select('*')
      .eq('id', invoiceId)
      .eq('package_id', packageId)
      .single(),
    supabase
      .from('travel_package_invoice_lines')
      .select('*')
      .eq('invoice_id', invoiceId)
      .eq('package_id', packageId)
      .order('sort_order'),
    supabase
      .from('travel_package_payments')
      .select('amount, payment_type, payment_status')
      .eq('package_id', packageId),
  ])
  if (invoiceError || !invoiceData)
    throw new Error(invoiceError?.message || 'Package invoice not found')
  if (lineError) throw new Error(lineError.message || 'Failed to load invoice lines')

  const invoice = invoiceData as unknown as TravelPackageInvoice
  const lines = (lineData || []) as unknown as TravelPackageInvoiceLine[]
  const totalPaid = roundPackageInvoiceMoney(
    (paymentData || []).reduce((total, payment) => {
      if (payment.payment_status !== 'completed') return total
      if (['deposit', 'payment'].includes(payment.payment_type))
        return total + Number(payment.amount || 0)
      if (['refund', 'chargeback'].includes(payment.payment_type))
        return total - Number(payment.amount || 0)
      return total
    }, 0),
  )
  const totals = calculatePackageInvoiceTotals(lines, totalPaid)
  const { data, error } = await supabase
    .from('travel_package_invoices')
    .update({
      subtotal_sold: totals.subtotalSold,
      discount_total: totals.discountTotal,
      total_sold: totals.totalSold,
      total_paid: totals.totalPaid,
      balance_due: totals.balanceDue,
      total_booked_cost: totals.totalBookedCost,
      projected_margin: totals.projectedMargin,
      expected_commission_total: totals.expectedCommissionTotal,
      received_commission_total: totals.receivedCommissionTotal,
      status: invoice.released_to_customer
        ? 'released'
        : totals.balanceDue <= 0 && totals.totalSold > 0
          ? 'paid'
          : totals.totalPaid > 0
            ? 'part_paid'
            : invoice.status,
    })
    .eq('id', invoiceId)
    .eq('package_id', packageId)
    .select('*')
    .single()
  if (error || !data) throw new Error(error?.message || 'Failed to recalculate invoice')
  return { invoice: data as unknown as TravelPackageInvoice, lines, totals }
}
