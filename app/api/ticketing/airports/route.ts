import { NextRequest } from 'next/server'
import { z } from 'zod'
import { apiError, apiOk } from '@/lib/api/http'
import { getServiceSupabaseClient } from '@/lib/api/serviceSupabase'
import { enforceRateLimit, getClientIp } from '@/lib/security/rateLimit'
import { requireTicketingAccess } from '@/lib/ticketing/apiAuth'
import {
  TICKET_ITINERARY_CAPABILITY_VERSION,
  type TicketingAirportOption,
} from '@/lib/ticketing/itineraryContracts'
import { hasTicketingSchemaCapability } from '@/lib/ticketing/schemaCapability'

const PRIVATE_RESPONSE = { headers: { 'Cache-Control': 'private, no-store' } } as const
const DEFAULT_LIMIT = 50
const MAX_LIMIT = 100

const airportQuerySchema = z
  .object({
    q: z
      .string()
      .trim()
      .min(1)
      .max(80)
      .regex(/^[\p{L}\p{N} -]+$/u, 'Use letters or numbers to search airports')
      .optional(),
    limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
  })
  .strict()

type AirportRow = {
  iata_code: string
  name: string
  city: string
  country_code: string
  timezone: string
  is_active: boolean
}

function privateError(message: string, status: number) {
  return apiError(message, status, {}, PRIVATE_RESPONSE)
}

function parseQuery(request: NextRequest) {
  const keys = [...request.nextUrl.searchParams.keys()]
  if (
    keys.some((key) => key !== 'q' && key !== 'limit') ||
    request.nextUrl.searchParams.getAll('q').length > 1 ||
    request.nextUrl.searchParams.getAll('limit').length > 1
  ) {
    return null
  }

  return airportQuerySchema.safeParse({
    q: request.nextUrl.searchParams.get('q') || undefined,
    limit: request.nextUrl.searchParams.get('limit') || undefined,
  })
}

function airportFromRow(row: AirportRow): TicketingAirportOption | null {
  if (
    !row.is_active ||
    !/^[A-Z]{3}$/.test(row.iata_code) ||
    !row.name?.trim() ||
    !row.city?.trim() ||
    !/^[A-Z]{2}$/.test(row.country_code) ||
    !row.timezone?.trim()
  ) {
    return null
  }

  return {
    iataCode: row.iata_code,
    name: row.name.trim(),
    city: row.city.trim(),
    countryCode: row.country_code,
    timezone: row.timezone,
  }
}

export async function GET(request: NextRequest) {
  const access = await requireTicketingAccess()
  if (!access.authorized) return access.response

  const parsedQuery = parseQuery(request)
  if (!parsedQuery?.success) return privateError('Invalid airport search.', 400)

  const rateLimit = await enforceRateLimit(request, {
    scope: 'ticketing.airport-directory',
    limit: 180,
    windowSeconds: 15 * 60,
    identities: [`user:${access.user.id}`, `ip:${getClientIp(request)}`],
  })
  if (!rateLimit.allowed) return rateLimit.response

  const supabase = getServiceSupabaseClient()
  const { data: capability, error: capabilityError } = await supabase.rpc(
    'ticketing_schema_status',
  )
  if (
    capabilityError ||
    !hasTicketingSchemaCapability(capability, TICKET_ITINERARY_CAPABILITY_VERSION)
  ) {
    return privateError('Ticketing airport entry is not installed on this database.', 503)
  }

  let query = supabase
    .from('ticket_airports')
    .select('iata_code, name, city, country_code, timezone, is_active')
    .eq('is_active', true)

  if (parsedQuery.data.q) {
    const search = parsedQuery.data.q
    query = query.or(
      `iata_code.ilike.${search.toUpperCase()}%,name.ilike.%${search}%,city.ilike.%${search}%`,
    )
  }

  const { data, error } = await query
    .order('iata_code', { ascending: true })
    .limit(parsedQuery.data.limit)
  if (error) return privateError('Unable to load airports right now.', 500)

  const items = ((data || []) as unknown as AirportRow[]).map(airportFromRow)
  if (items.some((item) => item === null)) {
    return privateError('Unable to load airports safely.', 500)
  }

  return apiOk({ items: items as TicketingAirportOption[] }, PRIVATE_RESPONSE)
}
