import { NextRequest, NextResponse } from 'next/server';
import { getRouteSupabaseClient } from '@/lib/api/serverSupabase';
import {
  BookingStatus,
  BookingSource,
  CreateBookingRequest,
  CreateBookingResponse,
} from '@/app/types/bookings';
import { sendBookingEmail } from '@/lib/bookingEmail';
import { buildDefaultBranchSchedule } from '@/lib/bookingBranchSchedule';
import {
  defaultReminderSettings,
  normalizeEmailForMatch,
  normalizePhoneForMatch,
} from '@/lib/bookingReminders';
import {
  deriveBookingEmailSubject,
  getIdempotencyKey,
  sanitizeBookingTags,
} from '@/lib/bookingOperations';
import {
  findIdempotentBooking,
  recordIdempotentBooking,
  storeBookingEmailAttempt,
} from '@/lib/bookingPersistence';
import { reserveBookingCapacity } from '@/lib/bookingCapacity';

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

const SCHEMA_HINT =
  'Booking schema is out of date. Run scripts/bootstrap/create-bookings-schema.sql in Supabase SQL editor.'

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
 * GET /api/bookings?from=ISO&to=ISO
 * Fetch all bookings in a date range (for the dashboard week view)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const locationId = searchParams.get('location_id');
    const status = searchParams.get('status');
    const source = searchParams.get('source');
    const serviceId = searchParams.get('service_id');
    const queryText = searchParams.get('q')?.trim();
    const modifiedSince = searchParams.get('modified_since');
    const includeCancelled = searchParams.get('include_cancelled') !== 'false';

    if (!from || !to) {
      return NextResponse.json({ error: 'from and to query params are required' }, { status: 400 });
    }

    const supabase = await getRouteSupabaseClient();

    let query = supabase
      .from('bookings')
      .select(`*, booking_services:service_id(name, duration_minutes)`)
      .gte('start_time', from)
      .lt('start_time', to)
      .order('start_time', { ascending: true });

    if (locationId) {
      query = query.eq('location_id', locationId);
    }
    if (status && status !== 'all') {
      query = query.eq('status', status);
    } else if (!includeCancelled) {
      query = query.neq('status', BookingStatus.CANCELLED);
    }
    if (source && source !== 'all') {
      query = query.eq('source', source);
    }
    if (serviceId && serviceId !== 'all') {
      query = query.eq('service_id', serviceId);
    }
    if (modifiedSince) {
      query = query.gte('updated_at', modifiedSince);
    }
    if (queryText) {
      query = query.or(
        `customer_name.ilike.%${queryText}%,customer_phone.ilike.%${queryText}%,customer_email.ilike.%${queryText}%,notes.ilike.%${queryText}%`
      );
    }

    const { data, error } = await query;

    if (error) {
      if (isSchemaError(error)) {
        return NextResponse.json({ bookings: [], warning: SCHEMA_HINT }, { status: 200 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ bookings: data || [] });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/bookings
 * Creates a new booking
 * Expected JSON body: { location_id, customer_name, customer_phone, customer_email, service_id, start_time, source?, notes? }
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as CreateBookingRequest;

    const { location_id, customer_name, customer_phone, customer_email, service_id, start_time, end_time } = body;
    const manualOverride = body.manual_override === true;
    const source = body.source || BookingSource.PORTAL;
    const notes = typeof body.notes === 'string' ? body.notes.trim() || null : body.notes ?? null;
    const personCount = Math.max(1, parseInt(String(body.person_count ?? 1), 10) || 1);
    const tags = sanitizeBookingTags(body.tags);

    if (!location_id || !customer_name || !customer_phone || !customer_email || !service_id || !start_time) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing required fields: location_id, customer_name, customer_phone, customer_email, service_id, start_time',
        } as CreateBookingResponse,
        { status: 400 }
      );
    }

    if (!isValidEmail(customer_email)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid email address',
        } as CreateBookingResponse,
        { status: 400 }
      );
    }

    if (!isValidPhone(customer_phone)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid phone number format. Use country code and number, e.g. +44 7123456789',
        } as CreateBookingResponse,
        { status: 400 }
      );
    }

    const startTimeDate = new Date(start_time);
    if (Number.isNaN(startTimeDate.getTime())) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid start_time format. Use ISO 8601 format',
        } as CreateBookingResponse,
        { status: 400 }
      );
    }

    const bookingDateKey = startTimeDate.toISOString().slice(0, 10);
    const todayUtc = new Date();
    todayUtc.setUTCHours(0, 0, 0, 0);
    const todayDateKey = todayUtc.toISOString().slice(0, 10);
    if (!manualOverride && bookingDateKey < todayDateKey) {
      return NextResponse.json(
        {
          success: false,
          error: 'Cannot create appointments for past dates',
        } as CreateBookingResponse,
        { status: 400 }
      );
    }

    const supabase = await getRouteSupabaseClient();
    const idempotencyKey = getIdempotencyKey(request, body);

    if (idempotencyKey) {
      const existingReplay = await findIdempotentBooking(supabase, 'booking.create', idempotencyKey);
      if (existingReplay?.booking_id) {
        const { data: existingBooking } = await supabase
          .from('bookings')
          .select('*')
          .eq('id', existingReplay.booking_id)
          .maybeSingle();

        if (existingBooking) {
          return NextResponse.json(
            {
              success: true,
              booking: existingBooking,
              idempotent_replay: true,
            } as CreateBookingResponse & { idempotent_replay: boolean },
            { status: existingReplay.response_code || 200 }
          );
        }
      }
    }

    const phoneNorm = normalizePhoneForMatch(customer_phone);
    const emailNorm = normalizeEmailForMatch(customer_email);
    const defaultPenaltySettings = defaultReminderSettings(location_id);

    const { data: reminderSettings, error: reminderSettingsError } = await supabase
      .from('booking_reminder_settings')
      .select('*')
      .eq('location_id', location_id)
      .maybeSingle();

    if (reminderSettingsError && !isSchemaError(reminderSettingsError)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Failed to load reminder settings',
        } as CreateBookingResponse,
        { status: 500 }
      );
    }

    const effectivePenaltySettings = reminderSettings || defaultPenaltySettings;
    if (effectivePenaltySettings.penalty_enabled && (phoneNorm || emailNorm)) {
      let penaltyMatched = false;

      if (phoneNorm) {
        const { data: phoneFlag, error: phoneFlagError } = await supabase
          .from('booking_contact_flags')
          .select('id, missed_count, penalty_applied')
          .eq('location_id', location_id)
          .eq('customer_phone_norm', phoneNorm)
          .maybeSingle();

        if (phoneFlagError && !isSchemaError(phoneFlagError)) {
          return NextResponse.json(
            {
              success: false,
              error: 'Failed to verify customer booking eligibility',
            } as CreateBookingResponse,
            { status: 500 }
          );
        }

        penaltyMatched = penaltyMatched || Boolean(phoneFlag?.penalty_applied);
      }

      if (emailNorm) {
        const { data: emailFlag, error: emailFlagError } = await supabase
          .from('booking_contact_flags')
          .select('id, missed_count, penalty_applied')
          .eq('location_id', location_id)
          .eq('customer_email_norm', emailNorm)
          .maybeSingle();

        if (emailFlagError && !isSchemaError(emailFlagError)) {
          return NextResponse.json(
            {
              success: false,
              error: 'Failed to verify customer booking eligibility',
            } as CreateBookingResponse,
            { status: 500 }
          );
        }

        penaltyMatched = penaltyMatched || Boolean(emailFlag?.penalty_applied);
      }

      if (
        penaltyMatched &&
        effectivePenaltySettings.penalty_action === 'block_until_manual_review' &&
        !manualOverride
      ) {
        return NextResponse.json(
          {
            success: false,
            error: 'This contact is temporarily blocked due to repeated missed appointments. Ask staff to review and use manual override if approved.',
          } as CreateBookingResponse,
          { status: 409 }
        );
      }
    }

    const { data: service, error: serviceError } = await supabase
      .from('booking_services')
      .select('*')
      .eq('id', service_id)
      .eq('location_id', location_id)
      .single();

    if (serviceError || !service) {
      if (isSchemaError(serviceError)) {
        return NextResponse.json(
          {
            success: false,
            error: SCHEMA_HINT,
          } as CreateBookingResponse,
          { status: 503 }
        );
      }
      return NextResponse.json(
        {
          success: false,
          error: 'Service not found',
        } as CreateBookingResponse,
        { status: 404 }
      );
    }

    if (!service.is_active) {
      return NextResponse.json(
        {
          success: false,
          error: 'Service is not available',
        } as CreateBookingResponse,
        { status: 400 }
      );
    }

    if (!hasServiceRuleFields(service)) {
      return NextResponse.json(
        {
          success: false,
          error: SCHEMA_HINT,
        } as CreateBookingResponse,
        { status: 503 }
      );
    }

    const bookingDayOfWeek = new Date(start_time).getUTCDay();
    if (
      !manualOverride &&
      Array.isArray(service.available_days) &&
      service.available_days.length > 0 &&
      !service.available_days.includes(bookingDayOfWeek)
    ) {
      return NextResponse.json(
        {
          success: false,
          error: 'Selected service is not available on this day',
        } as CreateBookingResponse,
        { status: 400 }
      );
    }

    const serviceDurationMinutes =
      service.duration_minutes +
      getServicePersonUnits(service, personCount) * (service.duration_per_additional_person_minutes ?? 0);
    const occupancyMinutes = serviceDurationMinutes + Math.max(0, service.buffer_minutes ?? 0);
    const boundaryToleranceMinutes = Math.max(0, service.close_overrun_tolerance_minutes);
    let resolvedCapacity = 1;

    let endTimeDate: Date;
    let occupiedUntilDate: Date;
    if (manualOverride) {
      if (!end_time) {
        return NextResponse.json(
          {
            success: false,
            error: 'Manual override requires end_time',
          } as CreateBookingResponse,
          { status: 400 }
        );
      }

      endTimeDate = new Date(end_time);
      if (Number.isNaN(endTimeDate.getTime())) {
        return NextResponse.json(
          {
            success: false,
            error: 'Invalid end_time format. Use ISO 8601 format',
          } as CreateBookingResponse,
          { status: 400 }
        );
      }

      if (endTimeDate.getTime() <= startTimeDate.getTime()) {
        return NextResponse.json(
          {
            success: false,
            error: 'End time must be later than start time',
          } as CreateBookingResponse,
          { status: 400 }
        );
      }

      occupiedUntilDate = endTimeDate;
    } else {
      endTimeDate = new Date(startTimeDate.getTime() + serviceDurationMinutes * 60 * 1000);
      occupiedUntilDate = new Date(startTimeDate.getTime() + occupancyMinutes * 60 * 1000);
    }

    const computedEndTime = endTimeDate.toISOString();
    const occupied_until = occupiedUntilDate.toISOString();

    if (manualOverride) {
      const dayOfWeek = startTimeDate.getUTCDay();
      const { data: branchSettingsRow, error: settingsError } = await supabase
        .from('branch_settings')
        .select('*')
        .eq('location_id', location_id)
        .eq('day_of_week', dayOfWeek)
        .maybeSingle();

      if (settingsError) {
        if (isSchemaError(settingsError)) {
          return NextResponse.json(
            {
              success: false,
              error: SCHEMA_HINT,
            } as CreateBookingResponse,
            { status: 503 }
          );
        }
        return NextResponse.json(
          {
            success: false,
            error: 'Failed to load branch settings',
          } as CreateBookingResponse,
          { status: 500 }
        );
      }

      const branchSettings = branchSettingsRow ?? buildDefaultBranchSchedule(dayOfWeek);
      resolvedCapacity = Math.max(1, branchSettings.concurrent_staff || 1);
      const dateKey = startTimeDate.toISOString().slice(0, 10);
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
        .eq('location_id', location_id)
        .gte('start_time', startOfDay)
        .lte('start_time', endOfDay)
        .neq('status', 'cancelled');

      if (overlapError) {
        if (isSchemaError(overlapError)) {
          return NextResponse.json(
            {
              success: false,
              error: SCHEMA_HINT,
            } as CreateBookingResponse,
            { status: 503 }
          );
        }
        return NextResponse.json(
          {
            success: false,
            error: 'Failed to check availability',
          } as CreateBookingResponse,
          { status: 500 }
        );
      }

      const overlapCount = countBufferedOverlaps(overlappingCandidates || [], start_time, occupied_until);
      if (overlapCount >= resolvedCapacity) {
        return NextResponse.json(
          {
            success: false,
            error: 'No available staff for this time slot',
          } as CreateBookingResponse,
          { status: 409 }
        );
      }
    }

    if (!manualOverride) {
      const dayOfWeek = startTimeDate.getUTCDay();
      const { data: branchSettingsRow, error: settingsError } = await supabase
        .from('branch_settings')
        .select('*')
        .eq('location_id', location_id)
        .eq('day_of_week', dayOfWeek)
        .maybeSingle();

      if (settingsError) {
        if (isSchemaError(settingsError)) {
          return NextResponse.json(
            {
              success: false,
              error: SCHEMA_HINT,
            } as CreateBookingResponse,
            { status: 503 }
          );
        }
        return NextResponse.json(
          {
            success: false,
            error: 'Failed to load branch settings',
          } as CreateBookingResponse,
          { status: 500 }
        );
      }

      const branchSettings = branchSettingsRow ?? buildDefaultBranchSchedule(dayOfWeek);

      if (branchSettings.is_closed) {
        return NextResponse.json(
          {
            success: false,
            error: 'Branch is closed on this day',
          } as CreateBookingResponse,
          { status: 400 }
        );
      }

      const dateKey = startTimeDate.toISOString().slice(0, 10);
      const { data: override, error: overrideError } = await supabase
        .from('branch_schedule_overrides')
        .select('*')
        .eq('location_id', location_id)
        .eq('date', dateKey)
        .maybeSingle();

      if (overrideError) {
        if (isSchemaError(overrideError)) {
          return NextResponse.json(
            {
              success: false,
              error: SCHEMA_HINT,
            } as CreateBookingResponse,
            { status: 503 }
          );
        }
        return NextResponse.json(
          {
            success: false,
            error: 'Failed to load branch overrides',
          } as CreateBookingResponse,
          { status: 500 }
        );
      }

      if (override?.is_closed) {
        return NextResponse.json(
          {
            success: false,
            error: 'Branch is closed on this date',
          } as CreateBookingResponse,
          { status: 400 }
        );
      }

      const openTime = override?.open_time ?? branchSettings.open_time;
      const closeTime = override?.close_time ?? branchSettings.close_time;
      const lunchStart = override?.lunch_start_time ?? branchSettings.lunch_start_time;
      const lunchEnd = override?.lunch_end_time ?? branchSettings.lunch_end_time;
      const prayerStart = override?.prayer_start_time ?? branchSettings.prayer_start_time;
      const prayerEnd = override?.prayer_end_time ?? branchSettings.prayer_end_time;
      resolvedCapacity = Math.max(1, override?.concurrent_staff ?? branchSettings.concurrent_staff ?? 1);

      const serviceStartBound = service.service_start_time ?? openTime;
      const serviceEndBound = service.service_end_time ?? closeTime;

      const bookingStartMinutes = timeToMinutes(extractUtcTimeHHMMSS(startTimeDate));
      const bookingOccupiedUntilMinutes = timeToMinutes(extractUtcTimeHHMMSS(occupiedUntilDate));
      const serviceStartMinutes = timeToMinutes(serviceStartBound);
      const serviceEndMinutes = timeToMinutes(serviceEndBound);

      if (
        bookingStartMinutes < serviceStartMinutes ||
        bookingOccupiedUntilMinutes > serviceEndMinutes + boundaryToleranceMinutes
      ) {
        return NextResponse.json(
          {
            success: false,
            error: 'Selected time is outside service operating hours',
          } as CreateBookingResponse,
          { status: 400 }
        );
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
        return NextResponse.json(
          {
            success: false,
            error: 'Selected time overlaps lunch break',
          } as CreateBookingResponse,
          { status: 400 }
        );
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
        return NextResponse.json(
          {
            success: false,
            error: 'Selected time overlaps prayer break',
          } as CreateBookingResponse,
          { status: 400 }
        );
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
        .eq('location_id', location_id)
        .gte('start_time', startOfDay)
        .lte('start_time', endOfDay)
        .neq('status', 'cancelled');

      if (overlapError) {
        if (isSchemaError(overlapError)) {
          return NextResponse.json(
            {
              success: false,
              error: SCHEMA_HINT,
            } as CreateBookingResponse,
            { status: 503 }
          );
        }
        return NextResponse.json(
          {
            success: false,
            error: 'Failed to check availability',
          } as CreateBookingResponse,
          { status: 500 }
        );
      }

      const overlapCount = countBufferedOverlaps(overlappingCandidates || [], start_time, occupied_until);
      if (overlapCount >= resolvedCapacity) {
        return NextResponse.json(
          {
            success: false,
            error: 'No available staff for this time slot',
          } as CreateBookingResponse,
          { status: 409 }
        );
      }
    }

    const { data: newBooking, error: insertError } = await supabase
      .from('bookings')
      .insert({
        location_id,
        customer_name,
        customer_phone,
        customer_email,
        service_id,
        person_count: personCount,
        tags,
        notes,
        start_time,
        end_time: computedEndTime,
        status: BookingStatus.PENDING,
        source,
      })
      .select()
      .single();

    if (insertError || !newBooking) {
      if (isSchemaError(insertError)) {
        return NextResponse.json(
          {
            success: false,
            error: SCHEMA_HINT,
          } as CreateBookingResponse,
          { status: 503 }
        );
      }
      return NextResponse.json(
        {
          success: false,
          error: 'Failed to create booking',
        } as CreateBookingResponse,
        { status: 500 }
      );
    }

    const capacityReservation = await reserveBookingCapacity(supabase, {
      bookingId: newBooking.id,
      locationId: location_id,
      startTime: start_time,
      occupiedUntil: occupied_until,
      capacity: resolvedCapacity,
    });

    if (!capacityReservation.success) {
      await supabase.from('bookings').delete().eq('id', newBooking.id);
      return NextResponse.json(
        {
          success: false,
          error: capacityReservation.error || 'No available staff for this time slot',
        } as CreateBookingResponse,
        { status: 409 }
      );
    }

    const { data: location } = await supabase
      .from('locations')
      .select('name,address_line1,address_line2,city,postcode,country,phone')
      .eq('id', location_id)
      .single();

    const emailResult = await sendBookingEmail({
      to: customer_email,
      subject: deriveBookingEmailSubject({ kind: 'confirmation' }),
      kind: 'confirmation',
      template: service.confirmation_template,
      customerName: customer_name,
      serviceName: service.name,
      startTimeISO: start_time,
      branchName: location?.name,
      branchAddress: buildBranchAddress(location),
      branchContactNumber: location?.phone || 'Contact unavailable',
    });

    await storeBookingEmailAttempt(supabase, {
      bookingId: newBooking.id,
      locationId: location_id,
      customerEmail: customer_email,
      emailKind: 'confirmation',
      emailSubject: deriveBookingEmailSubject({ kind: 'confirmation' }),
      senderEmail: emailResult.senderEmail,
      notificationStatus: emailResult.sent ? 'sent' : 'failed',
      failureReason: emailResult.reason ?? null,
      metadata: {
        service_id: service.id,
        service_name: service.name,
      },
    });

    await logBookingAudit(supabase, {
      booking_id: newBooking.id,
      location_id,
      action_type: 'created',
      actor_identifier: request.headers.get('x-user-email') || request.headers.get('x-user-id'),
      before_data: null,
      after_data: {
        status: newBooking.status,
        customer_name: newBooking.customer_name,
        customer_phone: newBooking.customer_phone,
        customer_email: newBooking.customer_email,
        service_id: newBooking.service_id,
        person_count: newBooking.person_count,
        tags: newBooking.tags,
        start_time: newBooking.start_time,
        end_time: newBooking.end_time,
        notes: newBooking.notes,
        updated_at: newBooking.updated_at,
      },
      metadata: {
        source,
        manual_override: manualOverride,
      },
    });

    if (idempotencyKey) {
      await recordIdempotentBooking(supabase, {
        actionName: 'booking.create',
        key: idempotencyKey,
        locationId: location_id,
        bookingId: newBooking.id,
        responseCode: 201,
        metadata: {
          source,
        },
      });
    }

    return NextResponse.json(
      {
        success: true,
        booking: newBooking,
        email_warning: emailResult.sent ? undefined : emailResult.reason,
      } as CreateBookingResponse & { email_warning?: string },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error in booking creation:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error',
      } as CreateBookingResponse,
      { status: 500 }
    );
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
