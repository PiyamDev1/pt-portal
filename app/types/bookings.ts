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
  slot_interval_minutes: number | null; // per-service slot interval override
  confirmation_template: string | null;
  modification_template: string | null;
  cancellation_template: string | null;
  /** Maximum persons in a single group/family booking (1 = no group bookings) */
  max_group_size: number;
  /** Extra minutes added per person beyond the first (0 = same as 1-person) */
  duration_per_additional_person_minutes: number;
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
  start_time: string; // ISO string
  end_time: string; // ISO string
  status: BookingStatus;
  source: BookingSource;
  created_at: string;
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
  person_count?: number; // 1 = individual; >1 = family/group
  source?: BookingSource;
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
