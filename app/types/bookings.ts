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
  day_of_week: number; // 0=Sunday, 6=Saturday
  open_time: string; // HH:MM:SS
  close_time: string; // HH:MM:SS
  lunch_start_time: string | null; // HH:MM:SS
  lunch_end_time: string | null; // HH:MM:SS
  is_closed: boolean;
  concurrent_staff: number;
  slot_interval_minutes: number;
}

// Booking Services
export interface BookingService {
  id: string;
  name: string;
  duration_minutes: number;
  buffer_minutes: number;
  is_active: boolean;
}

// Bookings
export interface Booking {
  id: string;
  customer_name: string;
  customer_phone: string;
  service_id: string;
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
  customer_name: string;
  customer_phone: string;
  service_id: string;
  start_time: string; // ISO string
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
