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

const inputSchema = z.object({ email: z.string().trim().toLowerCase().email().max(254) }).strict()

function dateOnly(value: string | null | undefined) {
  return value ? value.slice(0, 10) : null
}

export const POST = withCustomerIntegrationRoute(async (request) => {
  const context = await authenticateCustomerIntegration(request)
  const input = parseIntegrationJson(context, (value) => inputSchema.parse(value))
  const service = getServiceSupabaseClient()
  const { data: bookings, error: bookingError } = await service
    .from('ticket_bookings')
    .select(
      'id, pnr, customer_name, airline_id, departure_date, return_date, operational_status, updated_at',
    )
    .eq('contact_email', input.email)
    .is('archived_at', null)
    .in('operational_status', ['held', 'issued'])
    .order('departure_date', { ascending: true, nullsFirst: false })
    .limit(100)
  if (bookingError) {
    throw new CustomerIntegrationError(
      'service_unavailable',
      'Ticket trips could not be loaded.',
      503,
      { cause: bookingError },
    )
  }

  const bookingIds = (bookings || []).map((booking) => booking.id)
  const airlineIds = [...new Set((bookings || []).map((booking) => booking.airline_id))]
  const [{ data: sectors, error: sectorError }, { data: airlines, error: airlineError }] =
    await Promise.all([
      bookingIds.length
        ? service
            .from('ticket_itinerary_sectors')
            .select(
              'booking_id, sequence_number, origin_airport_code, destination_airport_code, flight_number, departure_at_utc, arrival_at_utc, schedule_status',
            )
            .in('booking_id', bookingIds)
            .eq('is_active', true)
            .order('sequence_number')
        : Promise.resolve({ data: [], error: null }),
      airlineIds.length
        ? service.from('airlines').select('id, iata_code, name').in('id', airlineIds)
        : Promise.resolve({ data: [], error: null }),
    ])
  if (sectorError || airlineError) {
    throw new CustomerIntegrationError(
      'service_unavailable',
      'Ticket schedules could not be loaded.',
      503,
      { cause: sectorError || airlineError },
    )
  }

  const grantedAt = new Date().toISOString()
  const trips = await Promise.all(
    (bookings || []).map(async (booking) => {
      const bookingSectors = (sectors || []).filter((sector) => sector.booking_id === booking.id)
      const airline = (airlines || []).find((item) => item.id === booking.airline_id)
      const alias = await getOrCreateResourceAlias('trip', booking.id, {
        source: 'ticketing_ledger',
      })
      const first = bookingSectors[0]
      const last = bookingSectors[bookingSectors.length - 1]
      const schedule = bookingSectors
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
      return {
        journeyKind: 'ticket',
        tripId: alias.publicId,
        packageReference: booking.pnr,
        title: `${airline?.name || airline?.iata_code || 'Flight'} ticket`,
        destination: last?.destination_airport_code || null,
        startsOn: dateOnly(first?.departure_at_utc || booking.departure_date),
        endsOn: dateOnly(last?.arrival_at_utc || booking.return_date || booking.departure_date),
        membership: { role: 'traveller', canViewFinancials: false, grantedAt },
        documents: [],
        invoice: null,
        transportSummary: schedule || 'Flight schedule has not been added yet.',
        lastUpdatedAt: booking.updated_at,
      }
    }),
  )

  return customerIntegrationOk({ trips }, context.requestId)
})
