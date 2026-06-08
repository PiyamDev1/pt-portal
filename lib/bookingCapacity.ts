type SupabaseLike = {
  rpc: (fn: string, args?: Record<string, unknown>) => any
}

export async function reserveBookingCapacity(
  supabase: SupabaseLike,
  params: {
    bookingId: string
    locationId: string
    startTime: string
    occupiedUntil: string
    capacity: number
  }
): Promise<{ success: boolean; seatNumber: number | null; error: string | null }> {
  const { data, error } = await supabase.rpc('reserve_booking_capacity', {
    p_booking_id: params.bookingId,
    p_location_id: params.locationId,
    p_start_time: params.startTime,
    p_occupied_until: params.occupiedUntil,
    p_capacity: Math.max(1, params.capacity),
  })

  if (error) {
    return { success: false, seatNumber: null, error: error.message || 'Failed to reserve booking capacity' }
  }

  const row = Array.isArray(data) ? data[0] : null
  return {
    success: Boolean(row?.success),
    seatNumber: typeof row?.seat_number === 'number' ? row.seat_number : null,
    error: typeof row?.error === 'string' ? row.error : null,
  }
}

export async function releaseBookingCapacity(
  supabase: SupabaseLike,
  bookingId: string
): Promise<void> {
  await supabase.rpc('release_booking_capacity_reservation', {
    p_booking_id: bookingId,
  })
}
