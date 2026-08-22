import { z } from 'zod'
import {
  TICKET_DETAILS_STATUSES,
  TICKET_PASSENGER_TYPES,
  type TicketingAirlineOption,
} from '@/lib/ticketing/contracts'

function isIsoCalendarDate(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  if (![year, month, day].every(Number.isInteger)) return false
  const date = new Date(Date.UTC(year, month - 1, day))
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a valid date')
  .refine(isIsoCalendarDate, 'Use a valid date')

const nullableText = (maximum: number) => z.string().trim().min(1).max(maximum).nullable()

export const ticketingBookingIdSchema = z.string().uuid()

export const ticketingCompletionFareSaleSchema = z
  .object({
    passengerType: z.enum(TICKET_PASSENGER_TYPES),
    unitSalePrice: z.number().finite().min(0).max(99_999_999.99).nullable(),
  })
  .strict()

export const ticketingCompletionPassengerSchema = z
  .object({
    passengerType: z.enum(TICKET_PASSENGER_TYPES),
    position: z.number().int().min(1).max(99),
    fullName: nullableText(200),
    contactPhone: nullableText(50),
    dateOfBirth: isoDateSchema.nullable(),
    ticketNumber: nullableText(50),
  })
  .strict()

export const ticketingCompleteTkDetailsSchema = z
  .object({
    expectedBookingVersion: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    expectedTransactionVersion: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    contactPhone: nullableText(50),
    departureDate: isoDateSchema.nullable(),
    returnDate: isoDateSchema.nullable(),
    paymentStatus: z.enum(['unpaid', 'paid']),
    paidAt: isoDateSchema.nullable(),
    fareSales: z.array(ticketingCompletionFareSaleSchema).min(1).max(3),
    passengers: z.array(ticketingCompletionPassengerSchema).max(99),
  })
  .strict()
  .superRefine((details, context) => {
    if (details.returnDate && details.departureDate && details.returnDate < details.departureDate) {
      context.addIssue({
        code: 'custom',
        path: ['returnDate'],
        message: 'Return date cannot be before the departure date',
      })
    }

    if (details.paymentStatus === 'paid' && !details.paidAt) {
      context.addIssue({
        code: 'custom',
        path: ['paidAt'],
        message: 'A paid ticket requires a paid date',
      })
    }

    if (details.paymentStatus === 'unpaid' && details.paidAt) {
      context.addIssue({
        code: 'custom',
        path: ['paidAt'],
        message: 'An unpaid ticket cannot have a paid date',
      })
    }

    const fareTypes = details.fareSales.map((fare) => fare.passengerType)
    if (new Set(fareTypes).size !== fareTypes.length) {
      context.addIssue({
        code: 'custom',
        path: ['fareSales'],
        message: 'Each passenger fare type can only be entered once',
      })
    }

    const passengerSlots = details.passengers.map(
      (passenger) => `${passenger.passengerType}:${passenger.position}`,
    )
    if (new Set(passengerSlots).size !== passengerSlots.length) {
      context.addIssue({
        code: 'custom',
        path: ['passengers'],
        message: 'Each passenger slot can only be entered once',
      })
    }
  })

export type TicketingCompleteTkDetailsInput = z.output<typeof ticketingCompleteTkDetailsSchema>

export type TicketingCompletionFare = {
  id: string
  passengerType: (typeof TICKET_PASSENGER_TYPES)[number]
  quantity: number
  unitSupplierCost: number | null
  unitSalePrice: number | null
  salePriceLocked: boolean
}

export type TicketingCompletionPassenger = z.output<typeof ticketingCompletionPassengerSchema>

export type TicketingCompletionDetail = {
  bookingId: string
  transactionId: string
  bookingVersion: number
  transactionVersion: number
  pnr: string
  customerName: string
  contactPhone: string | null
  departureDate: string | null
  returnDate: string | null
  operationalStatus: string
  paymentStatus: 'unpaid' | 'part_paid' | 'paid'
  paidAt: string | null
  airline: TicketingAirlineOption
  detailsStatus: (typeof TICKET_DETAILS_STATUSES)[number]
  fares: TicketingCompletionFare[]
  passengers: TicketingCompletionPassenger[]
}

export type TicketingCompletionResponse = {
  detail: TicketingCompletionDetail
  changed?: boolean
  idempotentReplay?: boolean
}

type DetailsStatusInput = Pick<TicketingCompletionDetail, 'contactPhone' | 'departureDate'> & {
  fares: Array<Pick<TicketingCompletionFare, 'passengerType' | 'quantity' | 'unitSalePrice'>>
  passengers: Array<Pick<TicketingCompletionPassenger, 'passengerType' | 'position' | 'fullName'>>
}

export function ticketingDetailsStatus({
  contactPhone,
  departureDate,
  fares,
  passengers,
}: DetailsStatusInput): TicketingCompletionDetail['detailsStatus'] {
  if (!contactPhone?.trim() || !departureDate || fares.length === 0) return 'needs_details'
  if (fares.some((fare) => fare.unitSalePrice === null)) return 'needs_details'

  for (const fare of fares) {
    const passengersForType = passengers.filter(
      (passenger) => passenger.passengerType === fare.passengerType,
    )
    if (passengersForType.length !== fare.quantity) return 'needs_details'
    for (let position = 1; position <= fare.quantity; position += 1) {
      const passenger = passengersForType.find((candidate) => candidate.position === position)
      if (!passenger?.fullName?.trim()) return 'needs_details'
    }
  }

  const expectedPassengerCount = fares.reduce((total, fare) => total + fare.quantity, 0)
  return passengers.length === expectedPassengerCount ? 'complete' : 'needs_details'
}
