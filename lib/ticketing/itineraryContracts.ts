import { z } from 'zod'

export const TICKET_ITINERARY_CAPABILITY_VERSION = 2026082602
export const TICKET_SCHEDULE_CHANGE_CAPABILITY_VERSION = 2026082701
export const TICKET_ITINERARY_MAX_SECTORS = 12
export const TICKET_ITINERARY_MAX_ON_BEHALF_REASON_LENGTH = 500
export const TICKET_SCHEDULE_CHANGE_MAX_REASON_LENGTH = 500
export const TICKET_SCHEDULE_STATUSES = [
  'on_schedule',
  'change_marked',
  'awaiting_finalisation',
] as const

const LOCAL_DATE_TIME_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/

function isValidLocalDateTime(value: string) {
  const match = LOCAL_DATE_TIME_PATTERN.exec(value)
  if (!match) return false

  const [, yearText, monthText, dayText, hourText, minuteText, secondText = '00'] = match
  const year = Number(yearText)
  const month = Number(monthText)
  const day = Number(dayText)
  const hour = Number(hourText)
  const minute = Number(minuteText)
  const second = Number(secondText)
  if (year < 2000 || year > 2200 || hour > 23 || minute > 59 || second > 59) return false

  const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second))
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day &&
    date.getUTCHours() === hour &&
    date.getUTCMinutes() === minute &&
    date.getUTCSeconds() === second
  )
}

export const ticketingLocalDateTimeSchema = z
  .string()
  .trim()
  .max(19)
  .refine(isValidLocalDateTime, 'Use a valid local date and time without a timezone')

export const ticketingIataAirportCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, 'Use a valid three-letter airport code')

export const ticketingItinerarySectorInputSchema = z
  .object({
    airlineId: z.string().uuid().nullable().optional().default(null),
    flightNumber: z
      .string()
      .trim()
      .toUpperCase()
      .min(1)
      .max(20)
      .regex(/^[A-Z0-9][A-Z0-9 -]*$/, 'Use a valid flight number'),
    originIata: ticketingIataAirportCodeSchema,
    destinationIata: ticketingIataAirportCodeSchema,
    departureLocal: ticketingLocalDateTimeSchema,
    arrivalLocal: ticketingLocalDateTimeSchema.nullable().optional().default(null),
  })
  .strict()
  .superRefine((sector, context) => {
    if (sector.originIata === sector.destinationIata) {
      context.addIssue({
        code: 'custom',
        path: ['destinationIata'],
        message: 'Origin and destination airports must be different',
      })
    }
  })

export const ticketingReplaceItinerarySchema = z
  .object({
    requestId: z.string().uuid(),
    expectedVersion: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    sectors: z.array(ticketingItinerarySectorInputSchema).min(1).max(TICKET_ITINERARY_MAX_SECTORS),
    adminReason: z
      .string()
      .trim()
      .min(1)
      .max(TICKET_ITINERARY_MAX_ON_BEHALF_REASON_LENGTH)
      .nullable()
      .optional()
      .default(null),
  })
  .strict()

export const TICKET_SCHEDULE_CHANGE_ACTIONS = ['mark', 'review', 'finalise', 'dismiss'] as const

export const ticketingScheduleChangeProposalSchema = z
  .object({
    flightNumber: z
      .string()
      .trim()
      .toUpperCase()
      .min(1)
      .max(20)
      .regex(/^[A-Z0-9][A-Z0-9 -]*$/, 'Use a valid flight number'),
    departureLocal: ticketingLocalDateTimeSchema,
    arrivalLocal: ticketingLocalDateTimeSchema.nullable().optional().default(null),
  })
  .strict()

export const ticketingScheduleChangeMutationSchema = z
  .object({
    requestId: z.string().uuid(),
    action: z.enum(TICKET_SCHEDULE_CHANGE_ACTIONS),
    expectedItineraryVersion: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    changeId: z.string().uuid().nullable().optional().default(null),
    proposal: ticketingScheduleChangeProposalSchema.nullable().optional().default(null),
    reason: z.string().trim().min(1).max(TICKET_SCHEDULE_CHANGE_MAX_REASON_LENGTH),
  })
  .strict()
  .superRefine((entry, context) => {
    if (entry.action === 'mark') {
      if (entry.changeId !== null) {
        context.addIssue({
          code: 'custom',
          path: ['changeId'],
          message: 'A new schedule change cannot include an existing change ID',
        })
      }
      if (entry.proposal === null) {
        context.addIssue({
          code: 'custom',
          path: ['proposal'],
          message: 'Proposed flight details are required when marking a change',
        })
      }
      return
    }

    if (entry.changeId === null) {
      context.addIssue({
        code: 'custom',
        path: ['changeId'],
        message: 'Select the active schedule change',
      })
    }
    if (entry.proposal !== null) {
      context.addIssue({
        code: 'custom',
        path: ['proposal'],
        message: 'Only a new marked change can include proposed flight details',
      })
    }
  })

export type TicketingItinerarySectorInput = z.output<typeof ticketingItinerarySectorInputSchema>
export type TicketingReplaceItineraryInput = z.output<typeof ticketingReplaceItinerarySchema>
export type TicketingScheduleChangeMutationInput = z.output<
  typeof ticketingScheduleChangeMutationSchema
>

export type TicketingOperationalEmployee = {
  id: string
  fullName: string
}

export type TicketingItineraryAirline = {
  id: string
  iataCode: string
  name: string
}

export type TicketingAirportOption = {
  iataCode: string
  name: string
  city: string
  countryCode: string
  timezone: string
}

export type TicketingItinerarySector = {
  id: string
  sequenceNumber: number
  itineraryVersion: number
  airline: TicketingItineraryAirline
  flightNumber: string
  originIata: string
  originTimezone: string
  destinationIata: string
  destinationTimezone: string
  departureLocal: string
  departureAtUtc: string
  arrivalLocal: string | null
  arrivalAtUtc: string | null
  scheduleStatus: (typeof TICKET_SCHEDULE_STATUSES)[number]
}

export type TicketingItineraryResponse = {
  booking: {
    id: string
    version: number
    pnr: string
    customerName: string
    operationalStatus: string
    ownerEmployee: TicketingOperationalEmployee
    defaultAirline: TicketingItineraryAirline
  }
  context: {
    isOnBehalf: boolean
    onBehalfReasonRequired: boolean
  }
  itineraryVersion: number
  sectors: TicketingItinerarySector[]
  changed?: boolean
  idempotentReplay?: boolean
}

export type TicketingFlightMonitorItem = {
  bookingId: string
  bookingVersion: number
  sectorId: string
  itineraryVersion: number
  sequenceNumber: number
  ownerEmployee: TicketingOperationalEmployee
  leadPassenger: string
  pnr: string
  contactPhone: string | null
  passengerCount: number
  bookingStatus: string
  airline: TicketingItineraryAirline
  flightNumber: string
  originIata: string
  originTimezone: string
  destinationIata: string
  destinationTimezone: string
  departureLocal: string
  departureAtUtc: string
  arrivalLocal: string | null
  arrivalAtUtc: string | null
  scheduleStatus: (typeof TICKET_SCHEDULE_STATUSES)[number]
  providerCheck: {
    checkedAt: string | null
    outcome: 'matched' | 'change_detected' | 'not_found' | 'failed' | null
    providerStatus: string | null
    scheduleChangeDetectedAt: string | null
  } | null
  activeScheduleChange: TicketingActiveScheduleChange | null
  allowedScheduleActions: (typeof TICKET_SCHEDULE_CHANGE_ACTIONS)[number][]
}

export type TicketingScheduleSnapshot = {
  flightNumber: string
  departureLocal: string
  departureAtUtc: string
  arrivalLocal: string | null
  arrivalAtUtc: string | null
}

export type TicketingActiveScheduleChange = {
  changeId: string
  eventVersion: number
  proposedSchedule: TicketingScheduleSnapshot
  markedBy: TicketingOperationalEmployee
  markedAt: string
  markReason: string
  reviewedBy: TicketingOperationalEmployee | null
  reviewedAt: string | null
  reviewReason: string | null
}

export type TicketingScheduleChangeMutationResponse = {
  action: (typeof TICKET_SCHEDULE_CHANGE_ACTIONS)[number]
  changeId: string
  eventId: string
  bookingId: string
  priorSectorId: string
  sectorId: string
  itineraryVersion: number
  scheduleStatus: (typeof TICKET_SCHEDULE_STATUSES)[number]
  ownerEmployeeId: string
  actingEmployeeId: string
  isOnBehalf: boolean
  appliedSector: Record<string, unknown> | null
  idempotentReplay: boolean
}

export type TicketingFlightMonitorResponse = {
  generatedAt: string
  counts: {
    upcoming: number
    changeMarked: number
    awaitingFinalisation: number
  }
  items: TicketingFlightMonitorItem[]
  nextCursor: string | null
}
