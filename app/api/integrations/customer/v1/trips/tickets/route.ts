import { timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import { getServiceSupabaseClient } from '@/lib/api/serviceSupabase'
import { getOrCreateResourceAlias } from '@/lib/customerPortal/grants'
import {
  authenticateCustomerIntegration,
  parseIntegrationJson,
} from '@/lib/customerPortal/integrationAuth'
import {
  CustomerIntegrationError,
  customerIntegrationOk,
  withCustomerIntegrationRoute,
} from '@/lib/customerPortal/http'

const inputSchema = z
  .object({
    pnr: z.string().trim().min(3).max(20),
    lastName: z.string().trim().min(1).max(100),
  })
  .strict()

function normalizedName(value: unknown) {
  return typeof value === 'string'
    ? value
        .normalize('NFKC')
        .replace(/[^\p{L}\p{N}'-]+/gu, ' ')
        .trim()
        .toLocaleLowerCase('en-GB')
    : ''
}

function customerLastName(customerName: string) {
  const trimmed = customerName.trim()
  const surnamePart = trimmed.includes('/') ? trimmed.split('/')[0] : trimmed.split(/\s+/).at(-1)
  return normalizedName(surnamePart)
}

function matchesLastName(customerName: string, requestedLastName: string) {
  const actual = Buffer.from(customerLastName(customerName))
  const requested = Buffer.from(normalizedName(requestedLastName))
  return (
    actual.length > 0 && actual.length === requested.length && timingSafeEqual(actual, requested)
  )
}

function dateOnly(value: string | null | undefined) {
  return value ? value.slice(0, 10) : null
}

export const POST = withCustomerIntegrationRoute(async (request) => {
  const context = await authenticateCustomerIntegration(request)
  const input = parseIntegrationJson(context, (value) => inputSchema.parse(value))
  const normalizedPnr = input.pnr.toUpperCase().replace(/[^A-Z0-9]/g, '')
  const service = getServiceSupabaseClient()
  const { data: candidates, error: bookingError } = await service
    .from('ticket_bookings')
    .select('id, pnr, customer_name, airline_id, departure_date, return_date, updated_at')
    .eq('normalized_pnr', normalizedPnr)
    .is('archived_at', null)
    .in('operational_status', ['held', 'issued'])
    .limit(5)
  if (bookingError) {
    throw new CustomerIntegrationError(
      'service_unavailable',
      'Ticket details could not be loaded.',
      503,
      { cause: bookingError },
    )
  }
  const matches = (candidates || []).filter((booking) =>
    matchesLastName(booking.customer_name, input.lastName),
  )
  if (matches.length !== 1) {
    throw new CustomerIntegrationError('lookup_not_matched', 'Ticket details do not match.', 404)
  }
  const booking = matches[0]
  const [{ data: sectors, error: sectorError }, { data: airline, error: airlineError }] =
    await Promise.all([
      service
        .from('ticket_itinerary_sectors')
        .select(
          'sequence_number, origin_airport_code, destination_airport_code, flight_number, departure_at_utc, arrival_at_utc, schedule_status',
        )
        .eq('booking_id', booking.id)
        .eq('is_active', true)
        .order('sequence_number'),
      service.from('airlines').select('iata_code, name').eq('id', booking.airline_id).maybeSingle(),
    ])
  if (sectorError || airlineError) {
    throw new CustomerIntegrationError(
      'service_unavailable',
      'Ticket schedule could not be loaded.',
      503,
      { cause: sectorError || airlineError },
    )
  }

  const alias = await getOrCreateResourceAlias('trip', booking.id, {
    source: 'ticketing_ledger',
  })
  const first = sectors?.[0]
  const last = sectors?.[(sectors?.length || 1) - 1]
  const schedule = (sectors || [])
    .map((sector) => {
      const flight = sector.flight_number ? ` ${sector.flight_number}` : ''
      const departure = new Intl.DateTimeFormat('en-GB', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'UTC',
      }).format(new Date(sector.departure_at_utc))
      return `${sector.origin_airport_code} → ${sector.destination_airport_code}${flight} · ${departure} UTC · ${sector.schedule_status.replace(/_/g, ' ')}`
    })
    .join('\n')
  const trip = {
    journeyKind: 'ticket',
    tripId: alias.publicId,
    packageReference: booking.pnr,
    title: `${airline?.name || airline?.iata_code || 'Flight'} ticket`,
    destination: last?.destination_airport_code || null,
    startsOn: dateOnly(first?.departure_at_utc || booking.departure_date),
    endsOn: dateOnly(last?.arrival_at_utc || booking.return_date || booking.departure_date),
    membership: {
      role: 'traveller',
      canViewFinancials: false,
      grantedAt: new Date().toISOString(),
    },
    documents: [],
    invoice: null,
    transportSummary: schedule || 'Flight schedule has not been added yet.',
    lastUpdatedAt: booking.updated_at,
  }
  return customerIntegrationOk({ trip }, context.requestId)
})
