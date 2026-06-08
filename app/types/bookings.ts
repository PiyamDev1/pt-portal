/**
 * Booking System Types
 * Defines all data structures for the appointment booking system
 */

// Enums matching Supabase types
export enum BookingStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  CANCELLED = 'cancelled',
  COMPLETED = 'completed',
}

export type BookingAttendanceStatus = 'unknown' | 'present' | 'missed' | 'manual_no_show'
export type BookingWaitlistStatus = 'waiting' | 'contacted' | 'booked' | 'cancelled' | 'expired'

export enum BookingSource {
  PORTAL = 'portal',
  WHATSAPP = 'whatsapp',
  WEBSITE = 'website',
}

// Branch Settings
export interface BranchSettings {
  id: string;
  location_id: string;
  day_of_week: number; // 0=Sunday, 6=Saturday
  open_time: string; // HH:MM:SS
  close_time: string; // HH:MM:SS
  lunch_start_time: string | null; // HH:MM:SS
  lunch_end_time: string | null; // HH:MM:SS
  prayer_start_time: string | null; // HH:MM:SS (e.g. Friday prayer)
  prayer_end_time: string | null; // HH:MM:SS
  is_closed: boolean;
  concurrent_staff: number;
  slot_interval_minutes: number;
}

export interface BranchScheduleOverride {
  id: string;
  location_id: string;
  date: string; // YYYY-MM-DD
  open_time: string | null;
  close_time: string | null;
  lunch_start_time: string | null;
  lunch_end_time: string | null;
  prayer_start_time: string | null;
  prayer_end_time: string | null;
  is_closed: boolean;
  concurrent_staff: number;
  slot_interval_minutes: number;
  notes: string | null;
}

// Booking Services
export interface BookingService {
  id: string;
  location_id: string;
  name: string;
  duration_minutes: number;
  buffer_minutes: number;
  available_days: number[] | null; // 0=Sunday, 6=Saturday
  service_start_time: string | null; // HH:MM:SS
  service_end_time: string | null; // HH:MM:SS
  confirmation_template: string | null;
  modification_template: string | null;
  cancellation_template: string | null;
  /** Extra minutes added per counted person unit based on service person-count rule. */
  duration_per_additional_person_minutes: number;
  /** If true, person_count excludes family head/applicant lead. */
  person_count_excludes_family_head: boolean;
  /** Minutes allowed past service end/branch close for appointment completion. */
  close_overrun_tolerance_minutes: number;
  is_active: boolean;
}

// Bookings
export interface Booking {
  id: string;
  customer_email: string;
  location_id: string;
  customer_name: string;
  customer_phone: string;
  service_id: string;
  person_count: number;
  tags?: string[];
  start_time: string; // ISO string
  end_time: string; // ISO string
  status: BookingStatus;
  source: BookingSource;
  last_email_sent_at?: string | null;
  last_email_kind?: string | null;
  last_email_status?: string | null;
  last_email_error?: string | null;
  last_email_subject?: string | null;
  last_email_recipient?: string | null;
  last_rescheduled_at?: string | null;
  reschedule_count?: number;
  attendance_status?: BookingAttendanceStatus;
  created_at: string;
  updated_at?: string;
}

export interface BookingDraftPayload {
  customer_name: string
  customer_email: string
  phone_country_code: string
  phone_local: string
  service_id: string
  notes: string
  tags: string
  date: string
  start_time: string
  end_time: string
  manual_override: boolean
  person_count: number
}

export interface BookingWaitlistEntry {
  id: string
  location_id: string
  service_id: string | null
  customer_name: string
  customer_phone: string
  customer_email: string | null
  person_count: number
  preferred_date: string | null
  preferred_time_start: string | null
  preferred_time_end: string | null
  source: BookingSource
  status: BookingWaitlistStatus
  notes: string | null
  linked_booking_id?: string | null
  created_at: string
  updated_at?: string
}

// API Request/Response Types
export interface AvailableSlot {
  time: string; // HH:MM format
  isoString: string; // Full ISO 8601 timestamp
}

export interface CreateBookingRequest {
  location_id: string;
  customer_name: string;
  customer_phone: string;
  customer_email: string;
  service_id: string;
  start_time: string; // ISO string
  end_time?: string; // ISO string for manual overrides
  person_count?: number; // 1 = individual; >1 = family/group
  tags?: string[];
  notes?: string | null;
  manual_override?: boolean;
  source?: BookingSource;
  idempotency_key?: string;
}

export interface CreateBookingResponse {
  success: boolean;
  booking?: Booking;
  error?: string;
}

export interface AvailableSlotsResponse {
  date: string;
  service_id: string;
  slots: AvailableSlot[];
}
