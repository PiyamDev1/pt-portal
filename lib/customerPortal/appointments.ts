import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import { reserveBookingCapacity, releaseBookingCapacity } from '@/lib/bookingCapacity'
import { defaultTemplate, sendBookingEmail } from '@/lib/bookingEmail'
import { buildDefaultBranchSchedule } from '@/lib/bookingBranchSchedule'
import { getServiceSupabaseClient } from '@/lib/api/serviceSupabase'
import {
  createCustomerAccessGrant,
  getOrCreateResourceAlias,
  resolveResourceAlias,
  verifyCustomerAccessGrant,
} from './grants'
import { CustomerIntegrationError } from './http'
import { createCustomerOtpChallenge, verifyCustomerOtpChallenge } from './otp'

const SLOT_STEP_MINUTES = 5
const PORTAL_ORIGIN = process.env.CUSTOMER_PORTAL_ALLOWED_ORIGIN || 'https://portal.piyamtravel.com'

interface ServiceRow {
  id: string
  location_id: string | null
  name: string
  duration_minutes: number
  buffer_minutes: number
  available_days: number[] | null
  service_start_time: string | null
  service_end_time: string | null
  confirmation_template: string | null
  modification_template: string | null
  cancellation_template: string | null
  duration_per_additional_person_minutes: number
  person_count_excludes_family_head: boolean
  close_overrun_tolerance_minutes: number
  customer_description: string | null
  customer_max_group_size: number
  customer_modification_cutoff_hours: number
}

type BookableServiceRow = ServiceRow & { location_id: string }

function hasBookableLocation(row: ServiceRow): row is BookableServiceRow {
  return typeof row.location_id === 'string' && row.location_id.length > 0
}

interface LocationRow {
  id: string
  name: string
  address_line1: string | null
  address_line2: string | null
  city: string | null
  postcode: string | null
  country: string | null
  phone: string | null
}

function address(location: LocationRow) {
  return [
    location.address_line1,
    location.address_line2,
    location.city,
    location.postcode,
    location.country,
  ]
    .map((value) => value?.trim())
    .filter(Boolean)
    .join(', ')
}

function servicePersonUnits(service: ServiceRow, groupSize: number) {
  return service.person_count_excludes_family_head ? groupSize : Math.max(0, groupSize - 1)
}

function serviceDuration(service: ServiceRow, groupSize: number) {
  return (
    service.duration_minutes +
    servicePersonUnits(service, groupSize) *
      Math.max(0, service.duration_per_additional_person_minutes)
  )
}

function timeToMinutes(time: string) {
  const [hours, minutes] = time.split(':').map(Number)
  return hours! * 60 + minutes!
}

function maxTime(left: string | null, right: string | null) {
  if (!left) return right
  if (!right) return left
  return timeToMinutes(left) >= timeToMinutes(right) ? left : right
}

function minTime(left: string | null, right: string | null) {
  if (!left) return right
  if (!right) return left
  return timeToMinutes(left) <= timeToMinutes(right) ? left : right
}

function minutesToIso(date: string, minutes: number) {
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  return new Date(
    `${date}T${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:00Z`,
  ).toISOString()
}

function overlapsBreak(
  start: number,
  occupiedUntil: number,
  breakStart: string | null,
  breakEnd: string | null,
  tolerance: number,
) {
  if (!breakStart || !breakEnd) return false
  const rangeStart = timeToMinutes(breakStart)
  const rangeEnd = timeToMinutes(breakEnd)
  if (occupiedUntil <= rangeStart || start >= rangeEnd) return false
  if (start >= rangeStart && start < rangeEnd) return true
  return occupiedUntil - rangeStart > tolerance
}

function occupiedUntilMs(booking: Record<string, unknown>) {
  const end = new Date(String(booking.end_time)).getTime()
  const relation = Array.isArray(booking.booking_services)
    ? booking.booking_services[0]
    : booking.booking_services
  const buffer = Number((relation as { buffer_minutes?: number } | null)?.buffer_minutes ?? 0)
  return end + Math.max(0, buffer) * 60_000
}

function countOverlaps(
  bookings: Record<string, unknown>[],
  startIso: string,
  occupiedUntilIso: string,
) {
  const start = Date.parse(startIso)
  const end = Date.parse(occupiedUntilIso)
  return bookings.filter(
    (booking) => Date.parse(String(booking.start_time)) < end && occupiedUntilMs(booking) > start,
  ).length
}

async function serviceAndLocation(service: SupabaseClient, serviceId: string, locationId: string) {
  const [{ data: serviceRow, error: serviceError }, { data: location, error: locationError }] =
    await Promise.all([
      service
        .from('booking_services')
        .select('*')
        .eq('id', serviceId)
        .eq('location_id', locationId)
        .eq('is_active', true)
        .eq('customer_visible', true)
        .maybeSingle(),
      service
        .from('locations')
        .select('id,name,address_line1,address_line2,city,postcode,country,phone')
        .eq('id', locationId)
        .maybeSingle(),
    ])
  if (serviceError || locationError || !serviceRow || !location) {
    throw new CustomerIntegrationError('not_found', 'Appointment service was not found.', 404)
  }
  return { serviceRow: serviceRow as ServiceRow, location: location as LocationRow }
}

export async function customerBookingCatalog() {
  const service = getServiceSupabaseClient()
  const { data: services, error } = await service
    .from('booking_services')
    .select('*')
    .eq('is_active', true)
    .eq('customer_visible', true)
    .not('location_id', 'is', null)
    .order('name')
  if (error) {
    throw new CustomerIntegrationError(
      'service_unavailable',
      'Appointment services are unavailable.',
      503,
    )
  }
  // The database constraint prevents customer-visible global services, while
  // this defensive filter also protects the public contract during rollouts.
  const serviceRows = ((services ?? []) as ServiceRow[]).filter(hasBookableLocation)
  const locationIds = [...new Set(serviceRows.map((row) => row.location_id).filter(Boolean))]
  const { data: locations, error: locationError } = locationIds.length
    ? await service
        .from('locations')
        .select('id,name,address_line1,address_line2,city,postcode,country,phone')
        .in('id', locationIds)
        .order('name')
    : { data: [], error: null }
  if (locationError) {
    throw new CustomerIntegrationError(
      'service_unavailable',
      'Appointment branches are unavailable.',
      503,
    )
  }
  const locationRows = (locations ?? []) as LocationRow[]
  const branchAliases = new Map<string, string>()
  for (const location of locationRows) {
    branchAliases.set(location.id, (await getOrCreateResourceAlias('branch', location.id)).publicId)
  }
  const serviceAliases = new Map<string, string>()
  for (const row of serviceRows) {
    serviceAliases.set(row.id, (await getOrCreateResourceAlias('service', row.id)).publicId)
  }
  return {
    branches: locationRows.map((location) => ({
      id: branchAliases.get(location.id)!,
      name: location.name,
      address: address(location) || 'Address unavailable',
      contactPhone: location.phone,
      timezone: 'Europe/London',
    })),
    services: serviceRows.map((row) => ({
      id: serviceAliases.get(row.id)!,
      name: row.name,
      description: row.customer_description,
      durationMinutes: row.duration_minutes,
      maxGroupSize: Math.max(1, row.customer_max_group_size),
      modificationCutoffHours: Math.max(0, row.customer_modification_cutoff_hours),
      branchIds: [branchAliases.get(row.location_id)!],
    })),
    fetchedAt: new Date().toISOString(),
  }
}

export async function customerAvailability(input: {
  servicePublicId: string
  branchPublicId: string
  date: string
  groupSize: number
}) {
  const service = getServiceSupabaseClient()
  const [serviceAlias, branchAlias] = await Promise.all([
    resolveResourceAlias('service', input.servicePublicId),
    resolveResourceAlias('branch', input.branchPublicId),
  ])
  const { serviceRow } = await serviceAndLocation(
    service,
    serviceAlias.internalId,
    branchAlias.internalId,
  )
  if (input.groupSize > serviceRow.customer_max_group_size) {
    throw new CustomerIntegrationError(
      'validation_failed',
      'Group size exceeds the service limit.',
      400,
    )
  }
  const requestedDate = new Date(`${input.date}T00:00:00.000Z`)
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)
  if (
    Number.isNaN(requestedDate.getTime()) ||
    requestedDate < today ||
    requestedDate.getTime() > today.getTime() + 366 * 24 * 60 * 60 * 1000
  ) {
    throw new CustomerIntegrationError(
      'validation_failed',
      'Appointment date is outside the booking window.',
      400,
    )
  }
  const day = requestedDate.getUTCDay()
  if (serviceRow.available_days?.length && !serviceRow.available_days.includes(day)) {
    return []
  }
  const [{ data: settingsRow, error: settingsError }, { data: override, error: overrideError }] =
    await Promise.all([
      service
        .from('branch_settings')
        .select('*')
        .eq('location_id', branchAlias.internalId)
        .eq('day_of_week', day)
        .maybeSingle(),
      service
        .from('branch_schedule_overrides')
        .select('*')
        .eq('location_id', branchAlias.internalId)
        .eq('date', input.date)
        .maybeSingle(),
    ])
  if (settingsError || overrideError) {
    throw new CustomerIntegrationError(
      'service_unavailable',
      'Appointment schedule is unavailable.',
      503,
    )
  }
  const settings = settingsRow ?? buildDefaultBranchSchedule(day)
  if (settings.is_closed || override?.is_closed) return []
  const open = maxTime(override?.open_time ?? settings.open_time, serviceRow.service_start_time)
  const close = minTime(override?.close_time ?? settings.close_time, serviceRow.service_end_time)
  if (!open || !close || open >= close) return []
  const lunchStart = override?.lunch_start_time ?? settings.lunch_start_time
  const lunchEnd = override?.lunch_end_time ?? settings.lunch_end_time
  const prayerStart = override?.prayer_start_time ?? settings.prayer_start_time
  const prayerEnd = override?.prayer_end_time ?? settings.prayer_end_time
  const capacity = Math.max(1, override?.concurrent_staff ?? settings.concurrent_staff)
  const startOfDay = new Date(`${input.date}T00:00:00.000Z`).toISOString()
  const endOfDay = new Date(`${input.date}T23:59:59.999Z`).toISOString()
  const { data: existing, error: bookingsError } = await service
    .from('bookings')
    .select('id,start_time,end_time,booking_services:service_id(buffer_minutes)')
    .eq('location_id', branchAlias.internalId)
    .gte('start_time', startOfDay)
    .lte('start_time', endOfDay)
    .neq('status', 'cancelled')
  if (bookingsError) {
    throw new CustomerIntegrationError(
      'service_unavailable',
      'Appointment capacity is unavailable.',
      503,
    )
  }
  const duration = serviceDuration(serviceRow, input.groupSize)
  const occupancy = duration + Math.max(0, serviceRow.buffer_minutes)
  const tolerance = Math.max(0, serviceRow.close_overrun_tolerance_minutes)
  const candidates: Array<{
    service_id: string
    location_id: string
    starts_at: string
    ends_at: string
    occupied_until: string
    group_size: number
    capacity: number
    expires_at: string
    available: number
  }> = []
  let current = timeToMinutes(open)
  const closeMinutes = timeToMinutes(close)
  while (current + duration <= closeMinutes + tolerance) {
    const occupiedUntilMinutes = current + occupancy
    if (occupiedUntilMinutes > closeMinutes + tolerance) break
    if (
      overlapsBreak(current, occupiedUntilMinutes, lunchStart, lunchEnd, tolerance) ||
      overlapsBreak(current, occupiedUntilMinutes, prayerStart, prayerEnd, tolerance)
    ) {
      current += SLOT_STEP_MINUTES
      continue
    }
    const startsAt = minutesToIso(input.date, current)
    const endsAt = minutesToIso(input.date, current + duration)
    const occupiedUntil = minutesToIso(input.date, occupiedUntilMinutes)
    const available =
      capacity -
      countOverlaps((existing ?? []) as Record<string, unknown>[], startsAt, occupiedUntil)
    if (available > 0 && Date.parse(startsAt) > Date.now()) {
      candidates.push({
        service_id: serviceRow.id,
        location_id: branchAlias.internalId,
        starts_at: startsAt,
        ends_at: endsAt,
        occupied_until: occupiedUntil,
        group_size: input.groupSize,
        capacity,
        expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        available,
      })
    }
    current += SLOT_STEP_MINUTES
  }
  if (!candidates.length) return []
  const { data: stored, error: slotError } = await service
    .from('customer_portal_availability_slots')
    .insert(candidates.map(({ available: _available, ...candidate }) => candidate))
    .select('public_id,starts_at,ends_at,available:capacity')
  if (slotError || !stored) {
    throw new CustomerIntegrationError(
      'service_unavailable',
      'Appointment slots could not be issued.',
      503,
    )
  }
  return stored.map((slot, index) => ({
    slotId: slot.public_id,
    startsAt: slot.starts_at,
    endsAt: slot.ends_at,
    availableCapacity: candidates[index]!.available,
  }))
}

async function bookingSummary(bookingId: string) {
  const service = getServiceSupabaseClient()
  const { data, error } = await service
    .from('bookings')
    .select(
      'id,customer_public_reference,customer_name,customer_email,customer_phone,person_count,start_time,end_time,status,customer_version,service_id,location_id,booking_services:service_id(name,customer_modification_cutoff_hours),locations:location_id(id,name,address_line1,address_line2,city,postcode,country,phone)',
    )
    .eq('id', bookingId)
    .maybeSingle()
  if (error || !data) throw new CustomerIntegrationError('not_found', 'Appointment not found.', 404)
  const bookingService = Array.isArray(data.booking_services)
    ? data.booking_services[0]
    : data.booking_services
  const location = (
    Array.isArray(data.locations) ? data.locations[0] : data.locations
  ) as LocationRow
  const [serviceAlias, branchAlias] = await Promise.all([
    getOrCreateResourceAlias('service', data.service_id),
    getOrCreateResourceAlias('branch', data.location_id),
  ])
  const cutoffHours = Math.max(0, bookingService?.customer_modification_cutoff_hours ?? 24)
  const cutoffAt = new Date(Date.parse(data.start_time) - cutoffHours * 60 * 60 * 1000)
  const email = String(data.customer_email ?? '')
  const [local = '', domain = ''] = email.split('@')
  return {
    publicReference: data.customer_public_reference,
    status:
      data.status === 'cancelled'
        ? ('cancelled' as const)
        : data.status === 'completed'
          ? ('completed' as const)
          : ('confirmed' as const),
    serviceId: serviceAlias.publicId,
    serviceName: bookingService?.name ?? 'Appointment',
    branch: {
      id: branchAlias.publicId,
      name: location?.name ?? 'Piyam Travel',
      address: location ? address(location) : 'Address unavailable',
      contactPhone: location?.phone ?? null,
      timezone: 'Europe/London',
    },
    startsAt: new Date(data.start_time).toISOString(),
    endsAt: new Date(data.end_time).toISOString(),
    groupSize: data.person_count,
    contactName: data.customer_name,
    contactEmailMasked: domain
      ? `${local.slice(0, 2)}${'•'.repeat(Math.max(2, Math.min(6, local.length - 2)))}@${domain}`
      : 'Recorded email',
    canModify: data.status !== 'cancelled' && Date.now() < cutoffAt.getTime(),
    modificationCutoffAt: cutoffAt.toISOString(),
    version: data.customer_version,
  }
}

export async function createCustomerAppointment(input: {
  slotPublicId: string
  contactName: string
  contactEmail: string
  contactPhone: string
  groupSize: number
  customerSubject?: string | null
}) {
  const service = getServiceSupabaseClient()
  const { data: slot, error: slotError } = await service
    .from('customer_portal_availability_slots')
    .select('*')
    .eq('public_id', input.slotPublicId)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle()
  if (slotError || !slot || slot.group_size !== input.groupSize) {
    throw new CustomerIntegrationError(
      'conflict',
      'The selected time has expired. Choose a time again.',
      409,
    )
  }
  const { serviceRow, location } = await serviceAndLocation(
    service,
    slot.service_id,
    slot.location_id,
  )
  const { data: booking, error: bookingError } = await service
    .from('bookings')
    .insert({
      location_id: slot.location_id,
      customer_name: input.contactName,
      customer_phone: input.contactPhone,
      customer_email: input.contactEmail,
      service_id: slot.service_id,
      person_count: input.groupSize,
      start_time: slot.starts_at,
      end_time: slot.ends_at,
      status: 'confirmed',
      source: 'website',
      customer_subject: input.customerSubject ?? null,
      tags: ['customer-portal'],
    })
    .select('id,customer_public_reference')
    .single()
  if (bookingError || !booking) {
    throw new CustomerIntegrationError(
      'service_unavailable',
      'Appointment could not be created.',
      503,
    )
  }
  const reservation = await reserveBookingCapacity(service, {
    bookingId: booking.id,
    locationId: slot.location_id,
    startTime: slot.starts_at,
    occupiedUntil: slot.occupied_until,
    capacity: slot.capacity,
  })
  if (!reservation.success) {
    await service.from('bookings').delete().eq('id', booking.id)
    throw new CustomerIntegrationError(
      'conflict',
      'That time was just taken. Choose another time.',
      409,
    )
  }
  const appointmentAlias = await getOrCreateResourceAlias('appointment', booking.id)
  const managementGrant = await createCustomerAccessGrant({
    resourceType: 'appointment',
    internalId: booking.id,
    publicId: appointmentAlias.publicId,
    customerSubject: input.customerSubject ?? null,
    scopes: ['read', 'manage'],
    ttlSeconds: 90 * 24 * 60 * 60,
  })
  const emailExchange = await createCustomerAccessGrant({
    resourceType: 'appointment',
    internalId: booking.id,
    publicId: appointmentAlias.publicId,
    customerSubject: input.customerSubject ?? null,
    scopes: ['exchange'],
    ttlSeconds: 7 * 24 * 60 * 60,
    singleUse: true,
  })
  const manageUrl = `${PORTAL_ORIGIN}/appointments/manage/${encodeURIComponent(emailExchange.token)}`
  await sendBookingEmail({
    to: input.contactEmail,
    subject: 'Your appointment is confirmed',
    kind: 'confirmation',
    template: `${serviceRow.confirmation_template?.trim() || defaultTemplate('confirmation')}\n\nManage your appointment securely: ${manageUrl}`,
    customerName: input.contactName,
    serviceName: serviceRow.name,
    startTimeISO: slot.starts_at,
    branchName: location.name,
    branchAddress: address(location),
    branchContactNumber: location.phone ?? 'Contact unavailable',
  })
  return {
    appointment: await bookingSummary(booking.id),
    managementGrant,
  }
}

export async function customerAppointmentByReference(publicReference: string, grantToken: string) {
  const grant = await verifyCustomerAccessGrant({
    token: grantToken,
    resourceType: 'appointment',
    requiredScope: 'read',
  })
  const { data } = await getServiceSupabaseClient()
    .from('bookings')
    .select('id,customer_public_reference')
    .eq('id', grant.internalId)
    .eq('customer_public_reference', publicReference)
    .maybeSingle()
  if (!data) throw new CustomerIntegrationError('not_found', 'Appointment not found.', 404)
  return bookingSummary(data.id)
}

export async function exchangeAppointmentToken(token: string) {
  const exchange = await verifyCustomerAccessGrant({
    token,
    resourceType: 'appointment',
    requiredScope: 'exchange',
    consume: true,
  })
  const { data } = await getServiceSupabaseClient()
    .from('bookings')
    .select('customer_public_reference')
    .eq('id', exchange.internalId)
    .single()
  if (!data) throw new CustomerIntegrationError('not_found', 'Appointment not found.', 404)
  const managementGrant = await createCustomerAccessGrant({
    resourceType: 'appointment',
    internalId: exchange.internalId,
    publicId: exchange.publicId,
    customerSubject: exchange.customerSubject,
    scopes: ['read', 'manage'],
    ttlSeconds: 90 * 24 * 60 * 60,
  })
  return {
    publicReference: data.customer_public_reference,
    managementGrant: managementGrant.token,
    expiresAt: managementGrant.expiresAt,
  }
}

export async function createAppointmentClaimChallenge(input: {
  publicReference: string
  customerSubject: string
}) {
  const service = getServiceSupabaseClient()
  const { data: booking, error } = await service
    .from('bookings')
    .select('id,customer_email,customer_subject')
    .eq('customer_public_reference', input.publicReference)
    .maybeSingle()
  if (
    error ||
    !booking ||
    !booking.customer_email ||
    (booking.customer_subject && booking.customer_subject !== input.customerSubject)
  ) {
    throw new CustomerIntegrationError(
      'not_found',
      'The appointment could not be verified for this account.',
      404,
    )
  }
  const alias = await getOrCreateResourceAlias('appointment', booking.id)
  return createCustomerOtpChallenge({
    purpose: 'claim_appointment',
    resourceType: 'appointment',
    internalId: booking.id,
    publicId: alias.publicId,
    customerSubject: input.customerSubject,
    contactEmail: booking.customer_email,
  })
}

export async function verifyAppointmentClaim(input: {
  challengeId: string
  otp: string
  customerSubject: string
}) {
  const verified = await verifyCustomerOtpChallenge({
    challengeId: input.challengeId,
    code: input.otp,
    customerSubject: input.customerSubject,
    purpose: 'claim_appointment',
  })
  const service = getServiceSupabaseClient()
  const { data: booking, error } = await service
    .from('bookings')
    .select('id,customer_subject')
    .eq('id', verified.internalId)
    .maybeSingle()
  if (
    error ||
    !booking ||
    (booking.customer_subject && booking.customer_subject !== input.customerSubject)
  ) {
    throw new CustomerIntegrationError(
      'conflict',
      'The appointment is already linked to another account.',
      409,
    )
  }

  let linkQuery = service
    .from('bookings')
    .update({ customer_subject: input.customerSubject })
    .eq('id', verified.internalId)
  linkQuery = booking.customer_subject
    ? linkQuery.eq('customer_subject', input.customerSubject)
    : linkQuery.is('customer_subject', null)
  const { data: linked, error: linkError } = await linkQuery.select('id').maybeSingle()
  if (linkError || !linked) {
    throw new CustomerIntegrationError(
      'conflict',
      'The appointment link changed. Start verification again.',
      409,
    )
  }

  const grant = await createCustomerAccessGrant({
    resourceType: 'appointment',
    internalId: verified.internalId,
    publicId: verified.publicId,
    customerSubject: input.customerSubject,
    scopes: ['read', 'manage'],
    ttlSeconds: 365 * 24 * 60 * 60,
    metadata: { source: 'appointment_claim_otp' },
  })
  return {
    appointment: await bookingSummary(verified.internalId),
    accountGrant: grant.token,
    grantExpiresAt: grant.expiresAt,
  }
}

export async function updateCustomerAppointment(input: {
  publicReference: string
  grantToken: string
  expectedVersion: number
  action: 'update' | 'cancel'
  contactName?: string
  contactPhone?: string
  groupSize?: number
  slotPublicId?: string
}) {
  const grant = await verifyCustomerAccessGrant({
    token: input.grantToken,
    resourceType: 'appointment',
    requiredScope: 'manage',
  })
  const service = getServiceSupabaseClient()
  const { data: booking, error } = await service
    .from('bookings')
    .select('*,booking_services:service_id(*)')
    .eq('id', grant.internalId)
    .eq('customer_public_reference', input.publicReference)
    .maybeSingle()
  if (error || !booking)
    throw new CustomerIntegrationError('not_found', 'Appointment not found.', 404)
  if (booking.customer_version !== input.expectedVersion) {
    throw new CustomerIntegrationError(
      'conflict',
      'The appointment changed. Refresh and try again.',
      409,
    )
  }
  const bookingService = (
    Array.isArray(booking.booking_services) ? booking.booking_services[0] : booking.booking_services
  ) as ServiceRow
  const cutoffHours = Math.max(0, bookingService.customer_modification_cutoff_hours ?? 24)
  if (Date.now() >= Date.parse(booking.start_time) - cutoffHours * 60 * 60 * 1000) {
    throw new CustomerIntegrationError(
      'cutoff_reached',
      'The online change window has closed.',
      409,
    )
  }
  if (input.action === 'cancel') {
    const { data: updated, error: updateError } = await service
      .from('bookings')
      .update({ status: 'cancelled', customer_cancelled_at: new Date().toISOString() })
      .eq('id', booking.id)
      .eq('customer_version', input.expectedVersion)
      .select('id')
      .maybeSingle()
    if (updateError || !updated)
      throw new CustomerIntegrationError(
        'conflict',
        'The appointment changed. Refresh and try again.',
        409,
      )
    await releaseBookingCapacity(service, booking.id)
    await sendBookingEmail({
      to: booking.customer_email,
      subject: 'Your appointment has been cancelled',
      kind: 'cancellation',
      template: bookingService.cancellation_template,
      customerName: booking.customer_name,
      serviceName: bookingService.name,
      startTimeISO: booking.start_time,
    })
    return bookingSummary(booking.id)
  }

  let startsAt = booking.start_time as string
  let endsAt = booking.end_time as string
  let occupiedUntil = new Date(
    Date.parse(endsAt) + Math.max(0, bookingService.buffer_minutes) * 60_000,
  ).toISOString()
  let capacity = 1
  const nextGroupSize = input.groupSize ?? booking.person_count
  if (input.slotPublicId) {
    const { data: slot } = await service
      .from('customer_portal_availability_slots')
      .select('*')
      .eq('public_id', input.slotPublicId)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle()
    if (
      !slot ||
      slot.service_id !== booking.service_id ||
      slot.location_id !== booking.location_id ||
      slot.group_size !== nextGroupSize
    ) {
      throw new CustomerIntegrationError(
        'conflict',
        'The selected time has expired. Choose a time again.',
        409,
      )
    }
    startsAt = slot.starts_at
    endsAt = slot.ends_at
    occupiedUntil = slot.occupied_until
    capacity = slot.capacity
  } else if (nextGroupSize !== booking.person_count) {
    const duration = serviceDuration(bookingService, nextGroupSize)
    endsAt = new Date(Date.parse(startsAt) + duration * 60_000).toISOString()
    occupiedUntil = new Date(
      Date.parse(endsAt) + Math.max(0, bookingService.buffer_minutes) * 60_000,
    ).toISOString()
    const { data: settings } = await service
      .from('branch_settings')
      .select('concurrent_staff')
      .eq('location_id', booking.location_id)
      .eq('day_of_week', new Date(startsAt).getUTCDay())
      .maybeSingle()
    capacity = Math.max(1, settings?.concurrent_staff ?? 1)
  }

  if (input.slotPublicId || nextGroupSize !== booking.person_count) {
    const reservation = await reserveBookingCapacity(service, {
      bookingId: booking.id,
      locationId: booking.location_id,
      startTime: startsAt,
      occupiedUntil,
      capacity,
    })
    if (!reservation.success) {
      await reserveBookingCapacity(service, {
        bookingId: booking.id,
        locationId: booking.location_id,
        startTime: booking.start_time,
        occupiedUntil: new Date(
          Date.parse(booking.end_time) + Math.max(0, bookingService.buffer_minutes) * 60_000,
        ).toISOString(),
        capacity,
      })
      throw new CustomerIntegrationError('conflict', 'That time is no longer available.', 409)
    }
  }
  const changes: Record<string, unknown> = {
    customer_name: input.contactName ?? booking.customer_name,
    customer_phone: input.contactPhone ?? booking.customer_phone,
    person_count: nextGroupSize,
    start_time: startsAt,
    end_time: endsAt,
    last_rescheduled_at: input.slotPublicId
      ? new Date().toISOString()
      : booking.last_rescheduled_at,
    reschedule_count: input.slotPublicId
      ? (booking.reschedule_count ?? 0) + 1
      : booking.reschedule_count,
  }
  const { data: updated, error: updateError } = await service
    .from('bookings')
    .update(changes)
    .eq('id', booking.id)
    .eq('customer_version', input.expectedVersion)
    .select('id')
    .maybeSingle()
  if (updateError || !updated) {
    throw new CustomerIntegrationError(
      'conflict',
      'The appointment changed. Refresh and try again.',
      409,
    )
  }
  await sendBookingEmail({
    to: booking.customer_email,
    subject: 'Your appointment has been updated',
    kind: 'modification',
    template: bookingService.modification_template,
    customerName: input.contactName ?? booking.customer_name,
    serviceName: bookingService.name,
    startTimeISO: startsAt,
  })
  return bookingSummary(booking.id)
}
