import type { BookingSource, BookingStatus, BookingWaitlistEntry } from '@/app/types/bookings'
import type {
  BookingServiceOption,
  BookingWithService,
  SlotLoadResult,
  SlotOption,
} from './bookingClientModel'

export type SavedBookingView = {
  name: string
  source: 'all' | BookingSource
  status: 'all' | BookingStatus
  serviceId: string
  searchQuery: string
  showCancelled: boolean
}

export type BookingReport = {
  totals: Record<string, number>
  by_status: Record<string, number>
  by_source: Record<string, number>
  by_service: Record<string, number>
}

export async function loadBookings({
  from,
  to,
  locationId,
  status,
  source,
  serviceId,
  includeCancelled,
  searchQuery,
}: {
  from: string
  to: string
  locationId: string
  status: 'all' | BookingStatus
  source: 'all' | BookingSource
  serviceId: string
  includeCancelled: boolean
  searchQuery: string
}) {
  const params = new URLSearchParams({ from, to })
  if (locationId) params.set('location_id', locationId)
  params.set('status', status)
  params.set('source', source)
  params.set('service_id', serviceId)
  params.set('include_cancelled', String(includeCancelled))
  if (searchQuery.trim()) params.set('q', searchQuery.trim())

  const response = await fetch(`/api/bookings?${params.toString()}`, { cache: 'no-store' })
  if (response.status === 429) return { bookings: [] as BookingWithService[], rateLimited: true }
  const data = (await response.json()) as { bookings?: BookingWithService[] }
  if (!response.ok) throw new Error('Failed to load bookings')
  return { bookings: data.bookings || [], rateLimited: false }
}

export async function loadBookingServices(locationId: string) {
  const response = await fetch(
    `/api/bookings/settings/services?location_id=${encodeURIComponent(locationId)}`,
  )
  const data = (await response.json()) as { services?: BookingServiceOption[] }
  if (!response.ok) throw new Error('Failed to load booking services')
  return (data.services || []).filter((service) => service.is_active)
}

export async function loadBookingReport({
  from,
  to,
  locationId,
}: {
  from: string
  to: string
  locationId: string
}) {
  const params = new URLSearchParams({ from, to, location_id: locationId })
  const response = await fetch(`/api/bookings/report?${params.toString()}`, { cache: 'no-store' })
  const data = (await response.json()) as BookingReport
  if (!response.ok) throw new Error('Failed to load booking report')
  return data
}

export async function loadBookingWaitlist(locationId: string) {
  const response = await fetch(
    `/api/bookings/waitlist?location_id=${encodeURIComponent(locationId)}`,
    { cache: 'no-store' },
  )
  const data = (await response.json()) as { entries?: BookingWaitlistEntry[] }
  if (!response.ok) throw new Error('Failed to load booking waitlist')
  return data.entries || []
}

export async function loadSavedBookingViews(locationId: string) {
  const response = await fetch(
    `/api/bookings/preferences?location_id=${encodeURIComponent(locationId)}`,
    { cache: 'no-store' },
  )
  const data = (await response.json()) as { saved_views?: SavedBookingView[] }
  if (!response.ok) throw new Error('Failed to load saved views')
  return data.saved_views || []
}

export async function loadAvailableBookingSlots({
  date,
  serviceId,
  locationId,
  personCount,
}: {
  date: string
  serviceId: string
  locationId: string
  personCount: number
}): Promise<SlotLoadResult> {
  try {
    const params = new URLSearchParams({
      date,
      service_id: serviceId,
      location_id: locationId,
      person_count: String(personCount),
    })
    const response = await fetch(`/api/bookings/available-slots?${params.toString()}`)
    const data = (await response.json()) as {
      slots?: SlotOption[]
      error?: string
      message?: string
      warning?: string
    }
    if (!response.ok) {
      return { slots: [], error: data.error || 'Failed to load available slots' }
    }
    return {
      slots: data.slots || [],
      error: data.error || data.message || data.warning || null,
    }
  } catch {
    return { slots: [], error: 'Failed to load available slots' }
  }
}
