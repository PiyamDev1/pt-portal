import { NextRequest, NextResponse } from 'next/server';
import { getRouteSupabaseClient } from '@/lib/api/serverSupabase';
import { BookingStatus } from '@/app/types/bookings';
import { sendBookingEmail } from '@/lib/bookingEmail';
import { buildDefaultBranchSchedule } from '@/lib/bookingBranchSchedule';
import {
  areBookingTagsEqual,
  deriveBookingEmailKind,
  deriveBookingEmailSubject,
  getIdempotencyKey,
  isAllowedBookingTransition,
  normalizeBookingEmail,
  sanitizeBookingTags,
} from '@/lib/bookingOperations';
import {
  findIdempotentBooking,
  recordIdempotentBooking,
  storeBookingEmailAttempt,
} from '@/lib/bookingPersistence';
import { releaseBookingCapacity, reserveBookingCapacity } from '@/lib/bookingCapacity';

function buildBranchAddress(location: {
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  postcode?: string | null;
  country?: string | null;
} | null): string {
  if (!location) return 'Address unavailable';
  const parts = [location.address_line1, location.address_line2, location.city, location.postcode, location.country]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));
  return parts.length > 0 ? parts.join(', ') : 'Address unavailable';
}

export const runtime = 'nodejs';

const VALID_STATUSES = Object.values(BookingStatus) as string[];
const SCHEMA_HINT = 'Booking schema is out of date. Run scripts/create-bookings-schema.sql in Supabase SQL editor.';

function isSchemaError(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  return code === '42P01' || code === '42703' || code === '42P10';
}

function getServicePersonUnits(service: { person_count_excludes_family_head?: boolean }, personCount: number): number {
  if (service.person_count_excludes_family_head === false) {
    return Math.max(0, personCount - 1);
  }
  return Math.max(0, personCount);
}

function hasServiceRuleFields(service: unknown): boolean {
  const candidate = service as {
    person_count_excludes_family_head?: unknown;
    close_overrun_tolerance_minutes?: unknown;
  } | null;
  return (
    typeof candidate?.person_count_excludes_family_head === 'boolean' &&
    typeof candidate?.close_overrun_tolerance_minutes === 'number'
  );
}

function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

function extractUtcTimeHHMMSS(date: Date): string {
  return `${String(date.getUTCHours()).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')}:${String(date.getUTCSeconds()).padStart(2, '0')}`;
}

function overlapsRangeBeyondTolerance(
  startMinutes: number,
  occupiedUntilMinutes: number,
  rangeStart: string | null,
  rangeEnd: string | null,
  toleranceMinutes: number
): boolean {
  if (!rangeStart || !rangeEnd) return false;
  const rs = timeToMinutes(rangeStart);
  const re = timeToMinutes(rangeEnd);

  if (occupiedUntilMinutes <= rs || startMinutes >= re) return false;
  if (startMinutes >= rs && startMinutes < re) return true;

  const overrun = occupiedUntilMinutes - rs;
  return overrun > toleranceMinutes;
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isValidPhone(value: string): boolean {
  return /^\+\d{1,4}\s[\d\s()-]{6,20}$/.test(value.trim());
}

async function logBookingAudit(
  supabase: Awaited<ReturnType<typeof getRouteSupabaseClient>>,
  payload: {
    booking_id: string;
    location_id: string;
    action_type: string;
    actor_identifier?: string | null;
    before_data?: unknown;
    after_data?: unknown;
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  const { error } = await supabase.from('booking_audit_logs').insert({
    booking_id: payload.booking_id,
    location_id: payload.location_id,
    action_type: payload.action_type,
    actor_identifier: payload.actor_identifier ?? null,
    before_data: payload.before_data ?? null,
    after_data: payload.after_data ?? null,
    metadata: payload.metadata ?? null,
  });

  if (error && !isSchemaError(error)) {
    console.error('Failed to write booking audit log', error);
  }
}

/**
 * PATCH /api/bookings/[id]
 * Update a booking's status and/or details.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const {
      status,
      customer_name,
      customer_phone,
      customer_email,
      service_id,
      start_time,
      if_unmodified_since,
      notes,
      tags: rawTags,
      person_count: rawPersonCount,
    } = body as {
      status?: string;
      customer_name?: string;
      customer_phone?: string;
      customer_email?: string;
      service_id?: string;
      start_time?: string;
      if_unmodified_since?: string;
      notes?: string | null;
      tags?: string[];
      person_count?: number;
      idempotency_key?: string;
    };
    const personCount = rawPersonCount !== undefined
      ? Math.max(1, parseInt(String(rawPersonCount), 10) || 1)
      : undefined;
    const tags = rawTags !== undefined ? sanitizeBookingTags(rawTags) : undefined;

    if (status && !VALID_STATUSES.includes(status)) {
      return NextResponse.json(
        { error: `status must be one of: ${VALID_STATUSES.join(', ')}` },
        { status: 400 }
      );
    }

    const hasAnyChange =
      status !== undefined ||
      customer_name !== undefined ||
      customer_phone !== undefined ||
      customer_email !== undefined ||
      service_id !== undefined ||
      start_time !== undefined ||
      notes !== undefined ||
      tags !== undefined ||
      personCount !== undefined;

    if (!hasAnyChange) {
      return NextResponse.json({ error: 'No fields provided to update' }, { status: 400 });
    }

    if (customer_email !== undefined && !isValidEmail(customer_email)) {
      return NextResponse.json({ error: 'Invalid email address' }, { status: 400 });
    }

    if (customer_phone !== undefined && !isValidPhone(customer_phone)) {
      return NextResponse.json(
        { error: 'Invalid phone number format. Use country code and number, e.g. +44 7123456789' },
        { status: 400 }
      );
    }

    const supabase = await getRouteSupabaseClient();
    const idempotencyKey = getIdempotencyKey(request, body);

    if (idempotencyKey) {
      const replay = await findIdempotentBooking(supabase, `booking.update:${id}`, idempotencyKey);
      if (replay?.booking_id) {
        const { data: replayBooking } = await supabase
          .from('bookings')
          .select('*')
          .eq('id', replay.booking_id)
          .maybeSingle();

        if (replayBooking) {
          return NextResponse.json({ success: true, booking: replayBooking, idempotent_replay: true });
        }
      }
    }

    const { data: existing, error: existingError } = await supabase
      .from('bookings')
      .select('*')
      .eq('id', id)
      .single();

    if (existingError || !existing) {
      if (isSchemaError(existingError)) {
        return NextResponse.json({ error: SCHEMA_HINT }, { status: 503 });
      }
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
    }

    if (if_unmodified_since && existing.updated_at && existing.updated_at !== if_unmodified_since) {
      return NextResponse.json(
        {
          error: 'This appointment was updated by another staff member. Reload and try again.',
          latest_updated_at: existing.updated_at,
        },
        { status: 409 }
      );
    }

    if (status && !isAllowedBookingTransition(existing.status as BookingStatus, status as BookingStatus)) {
      return NextResponse.json(
        { error: `Cannot move appointment from ${existing.status} to ${status}` },
        { status: 400 }
      );
    }

    const nextServiceId = service_id ?? existing.service_id;
    const nextStartISO = start_time ?? existing.start_time;
    const nextStatus = status ?? existing.status;
    const nextCustomerName = customer_name ?? existing.customer_name;
    const nextCustomerPhone = customer_phone ?? existing.customer_phone;
    const nextCustomerEmail = customer_email ?? existing.customer_email;
    const nextPersonCount = personCount ?? existing.person_count ?? 1;
    const nextTags = tags ?? sanitizeBookingTags(existing.tags ?? []);
    const emailChanged = normalizeBookingEmail(nextCustomerEmail) !== normalizeBookingEmail(existing.customer_email);
    const isRescheduled = existing.start_time !== nextStartISO || existing.service_id !== nextServiceId;
    const customerVisibleChange =
      isRescheduled ||
      existing.customer_name !== nextCustomerName ||
      existing.customer_phone !== nextCustomerPhone ||
      existing.person_count !== nextPersonCount;
    const notesChanged = (existing.notes ?? null) !== (notes ?? existing.notes ?? null);
    const tagsChanged = !areBookingTagsEqual(existing.tags ?? [], nextTags);

    const { data: service, error: serviceError } = await supabase
      .from('booking_services')
      .select('*')
      .eq('id', nextServiceId)
      .eq('location_id', existing.location_id)
      .single();

    if (serviceError || !service) {
      if (isSchemaError(serviceError)) {
        return NextResponse.json({ error: SCHEMA_HINT }, { status: 503 });
      }
      return NextResponse.json({ error: 'Service not found' }, { status: 404 });
    }

    if (!hasServiceRuleFields(service)) {
      return NextResponse.json({ error: SCHEMA_HINT }, { status: 503 });
    }

    const startTimeDate = new Date(nextStartISO);
    if (Number.isNaN(startTimeDate.getTime())) {
      return NextResponse.json({ error: 'Invalid start_time format' }, { status: 400 });
    }

    const serviceDurationMinutes =
      service.duration_minutes +
      getServicePersonUnits(service, nextPersonCount) * (service.duration_per_additional_person_minutes ?? 0);
    const occupancyMinutes = serviceDurationMinutes + Math.max(0, service.buffer_minutes ?? 0);
    const boundaryToleranceMinutes = Math.max(0, service.close_overrun_tolerance_minutes);
    let resolvedCapacity = 1;

    const endTimeDate = new Date(startTimeDate.getTime() + serviceDurationMinutes * 60 * 1000);
    const occupiedUntilDate = new Date(startTimeDate.getTime() + occupancyMinutes * 60 * 1000);
    const nextEndISO = endTimeDate.toISOString();
    const nextOccupiedUntilISO = occupiedUntilDate.toISOString();

    // Only enforce slot/staff checks if the booking is moving to a new slot or service
    const isSameSchedulingWindow =
      existing.start_time === nextStartISO &&
      existing.service_id === nextServiceId &&
      Number(existing.person_count ?? 1) === nextPersonCount;

    if (nextStatus !== BookingStatus.CANCELLED && !isSameSchedulingWindow) {
      const bookingDayOfWeek = startTimeDate.getUTCDay();
      if (
        Array.isArray(service.available_days) &&
        service.available_days.length > 0 &&
        !service.available_days.includes(bookingDayOfWeek)
      ) {
        return NextResponse.json({ error: 'Selected service is not available on this day' }, { status: 400 });
      }

      const { data: branchSettingsRow, error: settingsError } = await supabase
        .from('branch_settings')
        .select('*')
        .eq('location_id', existing.location_id)
        .eq('day_of_week', bookingDayOfWeek)
        .maybeSingle();

      if (settingsError) {
        if (isSchemaError(settingsError)) {
          return NextResponse.json({ error: SCHEMA_HINT }, { status: 503 });
        }
        return NextResponse.json({ error: 'Failed to load branch settings' }, { status: 500 });
      }

      const branchSettings = branchSettingsRow ?? buildDefaultBranchSchedule(bookingDayOfWeek);
      resolvedCapacity = Math.max(1, branchSettings.concurrent_staff || 1);

      if (branchSettings.is_closed) {
        return NextResponse.json({ error: 'Branch is closed on this day' }, { status: 400 });
      }

      const dateKey = startTimeDate.toISOString().slice(0, 10);
      const { data: override, error: overrideError } = await supabase
        .from('branch_schedule_overrides')
        .select('*')
        .eq('location_id', existing.location_id)
        .eq('date', dateKey)
        .maybeSingle();

      if (overrideError) {
        if (isSchemaError(overrideError)) {
          return NextResponse.json({ error: SCHEMA_HINT }, { status: 503 });
        }
        return NextResponse.json({ error: 'Failed to load branch overrides' }, { status: 500 });
      }

      if (override?.is_closed) {
        return NextResponse.json({ error: 'Branch is closed on this date' }, { status: 400 });
      }

      const openTime = override?.open_time ?? branchSettings.open_time;
      const closeTime = override?.close_time ?? branchSettings.close_time;
      const lunchStart = override?.lunch_start_time ?? branchSettings.lunch_start_time;
      const lunchEnd = override?.lunch_end_time ?? branchSettings.lunch_end_time;
      const prayerStart = override?.prayer_start_time ?? branchSettings.prayer_start_time;
      const prayerEnd = override?.prayer_end_time ?? branchSettings.prayer_end_time;

      const serviceStartBound = service.service_start_time ?? openTime;
      const serviceEndBound = service.service_end_time ?? closeTime;

      const bookingStartMinutes = timeToMinutes(extractUtcTimeHHMMSS(startTimeDate));
      const bookingEndMinutes = timeToMinutes(extractUtcTimeHHMMSS(endTimeDate));
      const bookingOccupiedUntilMinutes = timeToMinutes(extractUtcTimeHHMMSS(occupiedUntilDate));
      const serviceStartMinutes = timeToMinutes(serviceStartBound);
      const serviceEndMinutes = timeToMinutes(serviceEndBound);

      if (
        bookingStartMinutes < serviceStartMinutes ||
        bookingOccupiedUntilMinutes > serviceEndMinutes + boundaryToleranceMinutes
      ) {
        return NextResponse.json({ error: 'Selected time is outside service operating hours' }, { status: 400 });
      }

      if (
        overlapsRangeBeyondTolerance(
          bookingStartMinutes,
          bookingOccupiedUntilMinutes,
          lunchStart,
          lunchEnd,
          boundaryToleranceMinutes
        )
      ) {
        return NextResponse.json({ error: 'Selected time overlaps lunch break' }, { status: 400 });
      }

      if (
        overlapsRangeBeyondTolerance(
          bookingStartMinutes,
          bookingOccupiedUntilMinutes,
          prayerStart,
          prayerEnd,
          boundaryToleranceMinutes
        )
      ) {
        return NextResponse.json({ error: 'Selected time overlaps prayer break' }, { status: 400 });
      }

      const startOfDay = new Date(`${dateKey}T00:00:00Z`).toISOString();
      const endOfDay = new Date(`${dateKey}T23:59:59Z`).toISOString();

      const { data: overlappingCandidates, error: overlapError } = await supabase
        .from('bookings')
        .select(`
          id,
          service_id,
          person_count,
          start_time,
          end_time,
          booking_services:service_id(
            duration_minutes,
            buffer_minutes,
            duration_per_additional_person_minutes,
            person_count_excludes_family_head
          )
        `)
        .eq('location_id', existing.location_id)
        .gte('start_time', startOfDay)
        .lte('start_time', endOfDay)
        .neq('status', 'cancelled')
        .neq('id', id);

      if (overlapError) {
        if (isSchemaError(overlapError)) {
          return NextResponse.json({ error: SCHEMA_HINT }, { status: 503 });
        }
        return NextResponse.json({ error: 'Failed to check availability' }, { status: 500 });
      }

      resolvedCapacity = Math.max(1, override?.concurrent_staff ?? branchSettings.concurrent_staff ?? 1);
      const overlapCount = countBufferedOverlaps(overlappingCandidates || [], nextStartISO, nextOccupiedUntilISO);
      if (overlapCount >= resolvedCapacity) {
        return NextResponse.json({ error: 'No available staff for this time slot' }, { status: 409 });
      }
    }

    const updates: Record<string, unknown> = {
      status: nextStatus,
      customer_name: nextCustomerName,
      customer_phone: nextCustomerPhone,
      customer_email: nextCustomerEmail,
      service_id: nextServiceId,
      person_count: nextPersonCount,
      tags: nextTags,
      start_time: nextStartISO,
      end_time: nextEndISO,
    };

    if (notes !== undefined) updates.notes = notes;
    if (isRescheduled) {
      updates.last_rescheduled_at = new Date().toISOString();
      updates.reschedule_count = Math.max(0, Number(existing.reschedule_count ?? 0)) + 1;
    }

    const { data, error } = await supabase
      .from('bookings')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      if (isSchemaError(error)) {
        return NextResponse.json({ error: SCHEMA_HINT }, { status: 503 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const shouldReserveCapacity =
      nextStatus !== BookingStatus.CANCELLED &&
      nextStatus !== BookingStatus.COMPLETED &&
      (!isSameSchedulingWindow || existing.status === BookingStatus.CANCELLED || existing.status === BookingStatus.COMPLETED)

    if (nextStatus === BookingStatus.CANCELLED || nextStatus === BookingStatus.COMPLETED) {
      await releaseBookingCapacity(supabase, id)
    } else if (shouldReserveCapacity) {
      const capacityReservation = await reserveBookingCapacity(supabase, {
        bookingId: id,
        locationId: existing.location_id,
        startTime: nextStartISO,
        occupiedUntil: nextOccupiedUntilISO,
        capacity: resolvedCapacity,
      })

      if (!capacityReservation.success) {
        await supabase.from('bookings').update({
          status: existing.status,
          customer_name: existing.customer_name,
          customer_phone: existing.customer_phone,
          customer_email: existing.customer_email,
          service_id: existing.service_id,
          person_count: existing.person_count,
          tags: existing.tags,
          start_time: existing.start_time,
          end_time: existing.end_time,
          notes: existing.notes,
          last_rescheduled_at: existing.last_rescheduled_at,
          reschedule_count: existing.reschedule_count,
        }).eq('id', id)
        return NextResponse.json({ error: capacityReservation.error || 'No available staff for this time slot' }, { status: 409 })
      }
    }

    const { data: location } = await supabase
      .from('locations')
      .select('name,address_line1,address_line2,city,postcode,country,phone')
      .eq('id', existing.location_id)
      .single();

    const emailKind = deriveBookingEmailKind({
      previousStatus: existing.status as BookingStatus,
      nextStatus: nextStatus as BookingStatus,
      customerVisibleChange,
      emailChanged,
    });
    const emailSubject = emailKind
      ? deriveBookingEmailSubject({ kind: emailKind, emailChanged })
      : null;
    const emailTemplate =
      emailKind === 'cancellation'
        ? service.cancellation_template
        : emailKind === 'confirmation'
        ? service.confirmation_template
        : service.modification_template;

    let emailResult: { sent: boolean; reason?: string; senderEmail: string } | null = null;
    if (emailKind && emailSubject) {
      emailResult = await sendBookingEmail({
        to: nextCustomerEmail,
        subject: emailSubject,
        kind: emailKind,
        template: emailTemplate,
        customerName: nextCustomerName,
        serviceName: service.name,
        startTimeISO: nextStartISO,
        branchName: location?.name,
        branchAddress: buildBranchAddress(location),
        branchContactNumber: location?.phone || 'Contact unavailable',
      });

      await storeBookingEmailAttempt(supabase, {
        bookingId: id,
        locationId: existing.location_id,
        customerEmail: nextCustomerEmail,
        emailKind,
        emailSubject,
        senderEmail: emailResult.senderEmail,
        notificationStatus: emailResult.sent ? 'sent' : 'failed',
        failureReason: emailResult.reason ?? null,
        metadata: {
          service_id: service.id,
          service_name: service.name,
          booking_status: nextStatus,
          email_changed: emailChanged,
          previous_customer_email: existing.customer_email,
          rescheduled: isRescheduled,
          notes_changed: notesChanged,
          tags_changed: tagsChanged,
        },
      });
    }

    await logBookingAudit(supabase, {
      booking_id: id,
      location_id: existing.location_id,
      action_type:
        nextStatus === BookingStatus.CANCELLED
          ? 'cancelled'
          : isRescheduled
          ? 'rescheduled'
          : status !== undefined && existing.status !== nextStatus
          ? 'status_changed'
          : 'amended',
      actor_identifier: request.headers.get('x-user-email') || request.headers.get('x-user-id'),
      before_data: {
        status: existing.status,
        customer_name: existing.customer_name,
        customer_phone: existing.customer_phone,
        customer_email: existing.customer_email,
        service_id: existing.service_id,
        person_count: existing.person_count,
        tags: existing.tags,
        start_time: existing.start_time,
        end_time: existing.end_time,
        notes: existing.notes,
        updated_at: existing.updated_at,
      },
      after_data: {
        status: data.status,
        customer_name: data.customer_name,
        customer_phone: data.customer_phone,
        customer_email: data.customer_email,
        service_id: data.service_id,
        person_count: data.person_count,
        tags: data.tags,
        start_time: data.start_time,
        end_time: data.end_time,
        notes: data.notes,
        updated_at: data.updated_at,
      },
      metadata: {
        email_kind: emailKind,
        email_changed: emailChanged,
        previous_customer_email: existing.customer_email,
        rescheduled: isRescheduled,
        notes_changed: notesChanged,
        tags_changed: tagsChanged,
      },
    });

    if (idempotencyKey) {
      await recordIdempotentBooking(supabase, {
        actionName: `booking.update:${id}`,
        key: idempotencyKey,
        locationId: existing.location_id,
        bookingId: id,
        responseCode: 200,
      });
    }

    return NextResponse.json({
      success: true,
      booking: data,
      email_resent: emailChanged,
      email_warning: emailResult && !emailResult.sent ? emailResult.reason : undefined,
      email_sent: emailResult?.sent ?? false,
      rescheduled: isRescheduled,
    });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

function countBufferedOverlaps(bookings: any[], slotStartISO: string, slotEndISO: string): number {
  const slotStart = new Date(slotStartISO).getTime();
  const slotEnd = new Date(slotEndISO).getTime();
  return bookings.filter((booking) => {
    const bookingStart = new Date(booking.start_time).getTime();
    const bookingEnd = getBookingOccupiedUntilMs(booking);
    return bookingStart < slotEnd && bookingEnd > slotStart;
  }).length;
}

function getBookingOccupiedUntilMs(booking: any): number {
  const bookingEndMs = new Date(booking.end_time).getTime();
  if (Number.isNaN(bookingEndMs)) {
    return new Date(booking.start_time).getTime();
  }

  const service = booking?.booking_services ?? null;
  if (!service) {
    return bookingEndMs;
  }

  const bufferMinutes = Math.max(0, Number(service.buffer_minutes ?? 0));
  return bookingEndMs + bufferMinutes * 60 * 1000;
}
