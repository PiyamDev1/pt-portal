import {
  releaseBookingCapacity,
  reserveBookingCapacity,
  type BookingCapacityClient,
  type BookingCapacityWindow,
} from '@/lib/bookingCapacity'

type BookingLifecycleClient = BookingCapacityClient & {
  from: (table: string) => any
}

export interface BookingWriteResult<T, TError> {
  data: T
  error: TError | null
}

export type BookingCreateResult<T, TError> =
  | { success: true; data: NonNullable<T> }
  | { success: false; stage: 'create'; error: TError | null }
  | {
      success: false
      stage: 'capacity'
      error: string | null
      rollbackError: TError | null
    }

export type BookingRescheduleResult<T, TError> =
  | { success: true; data: NonNullable<T> }
  | { success: false; stage: 'capacity_lookup'; error: TError | null }
  | {
      success: false
      stage: 'capacity'
      error: string | null
      rollbackError: string | null
    }
  | {
      success: false
      stage: 'update'
      error: TError | null
      rollbackError: string | null
    }

export type BookingCloseResult<T, TError> =
  | { success: true; data: NonNullable<T>; capacityWarning: string | null }
  | { success: false; stage: 'update'; error: TError | null }

interface StoredCapacityReservation {
  location_id: string
  seat_number: number
  start_time: string
  occupied_until: string
}

async function restorePreviousCapacity(
  client: BookingCapacityClient,
  bookingId: string,
  previous: StoredCapacityReservation | null,
): Promise<string | null> {
  if (!previous) {
    const release = await releaseBookingCapacity(client, bookingId)
    return release.error
  }

  const restored = await reserveBookingCapacity(client, {
    bookingId,
    locationId: previous.location_id,
    startTime: previous.start_time,
    occupiedUntil: previous.occupied_until,
    capacity: Math.max(1, previous.seat_number),
  })
  return restored.success ? null : restored.error || 'Failed to restore previous booking capacity'
}

export async function createBookingWithCapacity<T, TError>(
  client: BookingCapacityClient,
  options: {
    createBooking: () => PromiseLike<BookingWriteResult<T, TError>>
    capacityFor: (booking: NonNullable<T>) => BookingCapacityWindow
    rollbackBooking: (booking: NonNullable<T>) => PromiseLike<{ error: TError | null }>
  },
): Promise<BookingCreateResult<T, TError>> {
  const created = await options.createBooking()
  if (created.error || !created.data) {
    return { success: false, stage: 'create', error: created.error }
  }

  const booking = created.data as NonNullable<T>
  const reservation = await reserveBookingCapacity(client, options.capacityFor(booking))
  if (reservation.success) {
    return { success: true, data: booking }
  }

  const rollback = await options.rollbackBooking(booking)
  return {
    success: false,
    stage: 'capacity',
    error: reservation.error,
    rollbackError: rollback.error,
  }
}

export async function rescheduleBookingWithCapacity<T, TError>(
  client: BookingLifecycleClient,
  options: {
    nextCapacity: BookingCapacityWindow
    updateBooking: () => PromiseLike<BookingWriteResult<T, TError>>
  },
): Promise<BookingRescheduleResult<T, TError>> {
  const { data: previous, error: lookupError } = await client
    .from('booking_capacity_reservations')
    .select('location_id,seat_number,start_time,occupied_until')
    .eq('booking_id', options.nextCapacity.bookingId)
    .is('released_at', null)
    .maybeSingle()

  if (lookupError) {
    return { success: false, stage: 'capacity_lookup', error: lookupError as TError }
  }

  const reservation = await reserveBookingCapacity(client, options.nextCapacity)
  if (!reservation.success) {
    return {
      success: false,
      stage: 'capacity',
      error: reservation.error,
      rollbackError: await restorePreviousCapacity(
        client,
        options.nextCapacity.bookingId,
        previous as StoredCapacityReservation | null,
      ),
    }
  }

  const updated = await options.updateBooking()
  if (updated.error || !updated.data) {
    return {
      success: false,
      stage: 'update',
      error: updated.error,
      rollbackError: await restorePreviousCapacity(
        client,
        options.nextCapacity.bookingId,
        previous as StoredCapacityReservation | null,
      ),
    }
  }

  return { success: true, data: updated.data as NonNullable<T> }
}

export async function closeBookingWithCapacity<T, TError>(
  client: BookingCapacityClient,
  options: {
    bookingId: string
    updateBooking: () => PromiseLike<BookingWriteResult<T, TError>>
  },
): Promise<BookingCloseResult<T, TError>> {
  const updated = await options.updateBooking()
  if (updated.error || !updated.data) {
    return { success: false, stage: 'update', error: updated.error }
  }

  const release = await releaseBookingCapacity(client, options.bookingId)
  return {
    success: true,
    data: updated.data as NonNullable<T>,
    capacityWarning: release.error,
  }
}
