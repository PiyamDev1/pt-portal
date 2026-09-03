import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  TravelPackageInvoice,
  TravelPackagePayment,
  TravelPackageReservation,
} from '@/app/types/packages'
import { calculatePackagePaymentSummary, derivePackagePaymentStatus } from '@/lib/packageWorkflow'
import { roundPackageInvoiceMoney } from '@/lib/packageInvoices'
import { getPackageReservationSaleTotal } from '@/lib/packageReservationFinancials'

export async function syncPackagePaymentStatus(
  supabase: SupabaseClient,
  packageId: string,
  known?: {
    payments?: TravelPackagePayment[]
    reservations?: TravelPackageReservation[]
  },
) {
  const [paymentResult, reservationResult] = await Promise.all([
    known?.payments
      ? Promise.resolve({ data: known.payments, error: null })
      : supabase.from('travel_package_payments').select('*').eq('package_id', packageId),
    known?.reservations
      ? Promise.resolve({ data: known.reservations, error: null })
      : supabase.from('travel_package_reservations').select('*').eq('package_id', packageId),
  ])
  if (paymentResult.error) throw new Error(paymentResult.error.message)
  if (reservationResult.error) throw new Error(reservationResult.error.message)
  const payments = (paymentResult.data || []) as unknown as TravelPackagePayment[]
  const reservations = (reservationResult.data || []) as unknown as TravelPackageReservation[]
  const paymentSummary = calculatePackagePaymentSummary(payments)
  const reservationSaleTotal = getPackageReservationSaleTotal(reservations)
  const paymentStatus = derivePackagePaymentStatus(paymentSummary, reservationSaleTotal)
  const pendingPaymentIds =
    paymentStatus === 'paid'
      ? payments
          .filter(
            (payment) =>
              payment.payment_status === 'pending' &&
              ['deposit', 'payment', 'account_credit'].includes(payment.payment_type),
          )
          .map((payment) => payment.id)
      : []

  if (pendingPaymentIds.length > 0) {
    const { error: pendingPaymentError } = await supabase
      .from('travel_package_payments')
      .update({ payment_status: 'cancelled' })
      .eq('package_id', packageId)
      .in('id', pendingPaymentIds)
    if (pendingPaymentError) throw new Error(pendingPaymentError.message)
    const { error: installmentError } = await supabase
      .from('travel_package_installments')
      .update({ status: 'cancelled', paid_at: null })
      .eq('package_id', packageId)
      .in('payment_id', pendingPaymentIds)
    if (installmentError) throw new Error(installmentError.message)
  }

  const { error: packageError } = await supabase
    .from('travel_packages')
    .update({ payment_status: paymentStatus })
    .eq('id', packageId)
  if (packageError) throw new Error(packageError.message)

  return {
    paymentSummary:
      pendingPaymentIds.length > 0 ? { ...paymentSummary, pending: 0, overdue: 0 } : paymentSummary,
    paymentStatus,
    reservationSaleTotal,
    outstandingBalance: Math.max(0, reservationSaleTotal - paymentSummary.netPaid),
    autoCancelledPendingPaymentCount: pendingPaymentIds.length,
  }
}

export async function syncPackagePaymentFinancials(
  supabase: SupabaseClient,
  packageId: string,
  preferredInvoiceId?: string | null,
) {
  const [{ data: paymentData }, { data: reservationData }] = await Promise.all([
    supabase.from('travel_package_payments').select('*').eq('package_id', packageId),
    supabase.from('travel_package_reservations').select('*').eq('package_id', packageId),
  ])

  const payments = (paymentData || []) as unknown as TravelPackagePayment[]
  const reservations = (reservationData || []) as unknown as TravelPackageReservation[]
  const paymentSummary = calculatePackagePaymentSummary(payments)
  const reservationSaleTotal = getPackageReservationSaleTotal(reservations)

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
    const invoicePayments = invoice.quote_id
      ? payments.filter((payment) => payment.quote_id === invoice.quote_id)
      : payments
    const invoicePaymentSummary = calculatePackagePaymentSummary(invoicePayments)
    const totalPaid = invoicePaymentSummary.netPaid
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

  const packagePayment = await syncPackagePaymentStatus(supabase, packageId, {
    payments,
    reservations,
  })

  return {
    paymentSummary: packagePayment.paymentSummary,
    paymentStatus: packagePayment.paymentStatus,
    reservationSaleTotal,
    outstandingBalance: packagePayment.outstandingBalance,
    autoCancelledPendingPaymentCount: packagePayment.autoCancelledPendingPaymentCount,
    invoice,
  }
}
