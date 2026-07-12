import type { SupabaseClient } from '@supabase/supabase-js'
import type { TravelPackageInvoice, TravelPackagePayment } from '@/app/types/packages'
import { calculatePackagePaymentSummary, derivePackagePaymentStatus } from '@/lib/packageWorkflow'
import { roundPackageInvoiceMoney } from '@/lib/packageInvoices'

export async function syncPackagePaymentFinancials(
  supabase: SupabaseClient,
  packageId: string,
  preferredInvoiceId?: string | null,
) {
  const { data: paymentData } = await supabase
    .from('travel_package_payments')
    .select('*')
    .eq('package_id', packageId)

  const payments = (paymentData || []) as unknown as TravelPackagePayment[]
  const paymentSummary = calculatePackagePaymentSummary(payments)

  let invoiceQuery = supabase
    .from('travel_package_invoices')
    .select('*')
    .eq('package_id', packageId)
    .neq('status', 'void')

  if (preferredInvoiceId) invoiceQuery = invoiceQuery.eq('id', preferredInvoiceId)

  const { data: invoiceData } = await invoiceQuery
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const invoice = (invoiceData || null) as unknown as TravelPackageInvoice | null
  if (invoice) {
    const totalPaid = paymentSummary.netPaid
    const balanceDue = roundPackageInvoiceMoney(invoice.total_sold - totalPaid)
    const status = invoice.released_to_customer
      ? 'released'
      : balanceDue <= 0 && invoice.total_sold > 0
        ? 'paid'
        : totalPaid > 0
          ? 'part_paid'
          : invoice.status === 'draft'
            ? 'draft'
            : 'pending_payment'

    await supabase
      .from('travel_package_invoices')
      .update({
        total_paid: totalPaid,
        balance_due: balanceDue,
        status,
      })
      .eq('id', invoice.id)
      .eq('package_id', packageId)
  }

  const paymentStatus = derivePackagePaymentStatus(paymentSummary, invoice)
  await supabase
    .from('travel_packages')
    .update({ payment_status: paymentStatus })
    .eq('id', packageId)

  return { paymentSummary, paymentStatus, invoice }
}
