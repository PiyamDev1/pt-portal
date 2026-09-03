import { NextRequest } from 'next/server'
import { apiOk } from '@/lib/api/http'
import { getRouteSupabaseClient } from '@/lib/api/serverSupabase'
import { getServiceSupabaseClient } from '@/lib/api/serviceSupabase'
import {
  COMMISSION_PRIVATE_RESPONSE,
  commissionError,
  hasCommissionCapability,
} from '@/lib/commissions/api'
import { COMMISSION_PACKAGE_AUTHORITY_CAPABILITY_VERSION } from '@/lib/commissions/contracts'
import { parsePackageCommissionReadiness } from '@/lib/commissions/packageReadiness'
import { syncPackagePaymentStatus } from '@/lib/packagePaymentsServer'
import { recordPackageAuditEvent } from '@/lib/packageAudit'

export const dynamic = 'force-dynamic'

function validUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

export async function POST(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  if (!validUuid(id)) return commissionError('Invalid package.', 400)

  const supabase = await getRouteSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return commissionError('Unauthorized', 401)

  const { data: packageFolder, error: packageError } = await supabase
    .from('travel_packages')
    .select(
      'id, location_id, payment_status, sales_responsible_employee_id, sales_employee_id, assigned_agent_id',
    )
    .eq('id', id)
    .maybeSingle()
  if (packageError || !packageFolder) return commissionError('Package not found.', 404)

  if (!(await hasCommissionCapability(COMMISSION_PACKAGE_AUTHORITY_CAPABILITY_VERSION))) {
    return commissionError('Package Commission readiness is not installed.', 503)
  }

  const actions: string[] = []
  let locationId = packageFolder.location_id
  const salesEmployeeId =
    packageFolder.sales_responsible_employee_id ||
    packageFolder.sales_employee_id ||
    packageFolder.assigned_agent_id

  if (!locationId && salesEmployeeId) {
    const { data: salesEmployee } = await supabase
      .from('employees')
      .select('location_id, locations(name, branch_code)')
      .eq('id', salesEmployeeId)
      .maybeSingle()
    if (salesEmployee?.location_id) {
      const location = Array.isArray(salesEmployee.locations)
        ? salesEmployee.locations[0]
        : salesEmployee.locations
      const { error: locationUpdateError } = await supabase
        .from('travel_packages')
        .update({ location_id: salesEmployee.location_id })
        .eq('id', id)
      if (locationUpdateError) return commissionError('Unable to assign the package branch.', 500)
      locationId = salesEmployee.location_id
      const locationName = location?.name || location?.branch_code || 'the sales owner branch'
      actions.push(`Assigned package branch: ${locationName}.`)
    }
  }

  let paymentSync: Awaited<ReturnType<typeof syncPackagePaymentStatus>>
  try {
    paymentSync = await syncPackagePaymentStatus(supabase, id)
  } catch {
    return commissionError('Unable to reconcile package payments with reservations.', 500)
  }
  if (paymentSync.paymentStatus !== packageFolder.payment_status) {
    actions.push(
      paymentSync.paymentStatus === 'paid'
        ? 'Marked package payment Paid because the Payments outstanding balance is 0.00.'
        : `Updated package payment status to ${paymentSync.paymentStatus.replace(/_/g, ' ')}.`,
    )
  }
  if (paymentSync.autoCancelledPendingPaymentCount > 0) {
    actions.push(
      `Cancelled ${paymentSync.autoCancelledPendingPaymentCount} superseded pending payment request${paymentSync.autoCancelledPendingPaymentCount === 1 ? '' : 's'}.`,
    )
  }

  if (actions.length > 0) {
    await recordPackageAuditEvent(
      supabase as unknown as Parameters<typeof recordPackageAuditEvent>[0],
      {
        packageId: id,
        actorId: user.id,
        eventType: 'commission_handoff_auto_resolved',
        eventSummary: actions.join(' '),
        beforeData: {
          locationId: packageFolder.location_id,
          paymentStatus: packageFolder.payment_status,
        },
        afterData: {
          locationId,
          paymentStatus: paymentSync.paymentStatus,
          reservationSaleTotal: paymentSync.reservationSaleTotal,
          outstandingBalance: paymentSync.outstandingBalance,
        },
      },
    )
  }

  const { data, error } = await getServiceSupabaseClient().rpc(
    'commission_package_readiness_2026083004',
    { p_package_id: id },
  )
  if (error) return commissionError('Unable to refresh Commission readiness.', 500)
  const readiness = parsePackageCommissionReadiness(data)
  if (!readiness) return commissionError('Commission readiness returned an invalid response.', 500)

  return apiOk(
    {
      actions,
      packagePatch: {
        location_id: locationId,
        payment_status: paymentSync.paymentStatus,
      },
      payment: {
        reservationSaleTotal: paymentSync.reservationSaleTotal,
        netReceived: paymentSync.paymentSummary.netPaid,
        outstandingBalance: paymentSync.outstandingBalance,
      },
      readiness,
    },
    COMMISSION_PRIVATE_RESPONSE,
  )
}
