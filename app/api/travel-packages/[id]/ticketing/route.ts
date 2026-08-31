import { NextRequest } from 'next/server'
import { apiError, apiOk } from '@/lib/api/http'
import { getRouteSupabaseClient } from '@/lib/api/serverSupabase'
import { getServiceSupabaseClient } from '@/lib/api/serviceSupabase'
import { hasTicketingSchemaCapability } from '@/lib/ticketing/schemaCapability'
import { TICKET_REFUND_CAPABILITY_VERSION } from '@/lib/ticketing/refundContracts'

const PRIVATE_RESPONSE = { headers: { 'Cache-Control': 'private, no-store' } } as const

function privateError(message: string, status: number) {
  return apiError(message, status, {}, PRIVATE_RESPONSE)
}

function validUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  if (!validUuid(id)) return privateError('Invalid package.', 400)

  const routeClient = await getRouteSupabaseClient()
  const {
    data: { user },
  } = await routeClient.auth.getUser()
  if (!user) return privateError('Unauthorized', 401)

  const visiblePackage = await routeClient
    .from('travel_packages')
    .select('id')
    .eq('id', id)
    .maybeSingle()
  if (visiblePackage.error || !visiblePackage.data) return privateError('Package not found.', 404)

  const service = getServiceSupabaseClient()
  const capability = await service.rpc('ticketing_schema_status')
  if (
    capability.error ||
    !hasTicketingSchemaCapability(capability.data, TICKET_REFUND_CAPABILITY_VERSION)
  ) {
    return privateError('Package Ticketing view is not installed.', 503)
  }

  const groupMemberships = await service
    .from('travel_package_group_members')
    .select('group_id, travel_package_groups!inner(status)')
    .eq('package_id', id)
    .eq('travel_package_groups.status', 'active')
  if (groupMemberships.error) return privateError('Unable to load package Ticketing links.', 500)
  const groupIds = (groupMemberships.data || []).map((row) => row.group_id)
  const linkFilter = [`package_id.eq.${id}`]
  if (groupIds.length > 0) linkFilter.push(`group_id.in.(${groupIds.join(',')})`)

  const linksResult = await service
    .from('ticket_package_links')
    .select(
      `
      id, booking_id, package_id, reservation_id, group_id, package_type_snapshot,
      resolution_method, detected_at,
      ticket_bookings!inner(
        id, pnr, customer_name, operational_status, payment_status, departure_date,
        return_date, commission_scope, package_match_status, archived_at,
        airlines!inner(id, iata_code, name),
        owner_employee:employees!ticket_bookings_owner_employee_id_fkey(id, full_name),
        ticket_transactions!inner(
          id, service_type, parent_transaction_id, operational_status, issued_at,
          ticket_transaction_passengers(
            id, ticket_number, ticket_passengers(full_name, passenger_type)
          )
        )
      )
    `,
    )
    .is('retired_at', null)
    .is('ticket_bookings.archived_at', null)
    .eq('match_status', 'matched')
    .or(linkFilter.join(','))
    .order('detected_at', { ascending: false })
    .limit(100)
  if (linksResult.error) return privateError('Unable to load package Ticketing links.', 500)

  const links = linksResult.data || []
  const bookingIds = [...new Set(links.map((link) => link.booking_id))]
  if (bookingIds.length === 0) {
    return apiOk(
      { items: [], summary: { ticketCount: 0, openRefunds: 0, openVouchers: 0 } },
      PRIVATE_RESPONSE,
    )
  }

  const [faresResult, refundsResult, vouchersResult] = await Promise.all([
    service
      .from('ticket_fare_adjustment_current')
      .select('booking_id, difference_gbp, effective_on')
      .in('booking_id', bookingIds),
    service
      .from('ticket_refunds')
      .select(
        'id, booking_id, passenger_name, passenger_type, status, proposed_customer_refund_gbp, customer_settled_gbp, airline_recovery_final, actual_company_result_gbp, created_at',
      )
      .in('booking_id', bookingIds)
      .neq('status', 'voided')
      .order('created_at', { ascending: false }),
    service
      .from('ticket_vouchers')
      .select(
        'id, booking_id, passenger_name, passenger_type, status, claim_by_date, confirmed_value_gbp, remaining_value_gbp, created_at',
      )
      .in('booking_id', bookingIds)
      .order('created_at', { ascending: false }),
  ])
  if (faresResult.error || refundsResult.error || vouchersResult.error) {
    return privateError('Unable to load package Ticketing lifecycle.', 500)
  }

  const fareByBooking = new Map((faresResult.data || []).map((row) => [row.booking_id, row]))
  const refundsByBooking = new Map<string, typeof refundsResult.data>()
  for (const row of refundsResult.data || []) {
    refundsByBooking.set(row.booking_id, [...(refundsByBooking.get(row.booking_id) || []), row])
  }
  const vouchersByBooking = new Map<string, typeof vouchersResult.data>()
  for (const row of vouchersResult.data || []) {
    vouchersByBooking.set(row.booking_id, [...(vouchersByBooking.get(row.booking_id) || []), row])
  }

  const seen = new Set<string>()
  const items = links.flatMap((link) => {
    if (seen.has(link.booking_id)) return []
    seen.add(link.booking_id)
    const relation = link.ticket_bookings as unknown
    const booking = (Array.isArray(relation) ? relation[0] : relation) as Record<string, any> | null
    if (!booking) return []
    const airlineRelation = booking.airlines
    const airline = Array.isArray(airlineRelation) ? airlineRelation[0] : airlineRelation
    const ownerRelation = booking.owner_employee
    const owner = Array.isArray(ownerRelation) ? ownerRelation[0] : ownerRelation
    const transactions = (
      Array.isArray(booking.ticket_transactions)
        ? booking.ticket_transactions
        : [booking.ticket_transactions]
    ).filter(
      (transaction: Record<string, unknown> | null) =>
        transaction &&
        transaction.service_type === 'TK' &&
        transaction.parent_transaction_id === null,
    )
    const root = transactions[0] || null
    const allocations = root?.ticket_transaction_passengers || []
    return [
      {
        bookingId: booking.id,
        pnr: booking.pnr,
        customerName: booking.customer_name,
        airline: airline
          ? { id: airline.id, iataCode: airline.iata_code, name: airline.name }
          : null,
        owner: owner ? { id: owner.id, fullName: owner.full_name } : null,
        operationalStatus: booking.operational_status,
        paymentStatus: booking.payment_status,
        departureDate: booking.departure_date,
        returnDate: booking.return_date,
        issuedAt: root?.issued_at || null,
        packageMatchStatus: booking.package_match_status,
        commissionScope: booking.commission_scope,
        match: {
          packageId: link.package_id,
          reservationId: link.reservation_id,
          groupId: link.group_id,
          packageType: link.package_type_snapshot,
          resolutionMethod: link.resolution_method,
        },
        passengers: allocations.map((allocation: Record<string, any>) => {
          const passengerRelation = allocation.ticket_passengers
          const passenger = Array.isArray(passengerRelation)
            ? passengerRelation[0]
            : passengerRelation
          return {
            allocationId: allocation.id,
            ticketNumber: allocation.ticket_number,
            fullName: passenger?.full_name || null,
            passengerType: passenger?.passenger_type || null,
          }
        }),
        latestFareVariance: fareByBooking.get(link.booking_id) || null,
        refunds: refundsByBooking.get(link.booking_id) || [],
        vouchers: vouchersByBooking.get(link.booking_id) || [],
      },
    ]
  })

  return apiOk(
    {
      items,
      summary: {
        ticketCount: items.length,
        openRefunds: (refundsResult.data || []).filter(
          (refund) => !['settled', 'closed', 'voided'].includes(refund.status),
        ).length,
        openVouchers: (vouchersResult.data || []).filter(
          (voucher) =>
            !['used_on_new_ticket', 'refund_received', 'expired', 'closed'].includes(
              voucher.status,
            ),
        ).length,
      },
    },
    PRIVATE_RESPONSE,
  )
}
