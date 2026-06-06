import { renderBookingTemplate } from '@/lib/bookingEmail'

export const DEFAULT_REMINDER_SUBJECT = 'Appointment reminder: [service booked] on [date booked] at [time booked]'

export const DEFAULT_REMINDER_TEMPLATE = [
  'Dear [Customer Name],',
  '',
  'This is a reminder that your [service booked] appointment is scheduled for [date booked] at [time booked] at [branch name].',
  '',
  'If you cannot attend, please contact us as soon as possible.',
  '',
  'Kind regards,',
  'Piyam Travel',
].join('\n')

export type PenaltyAction = 'warn_only' | 'block_until_manual_review'

export interface BookingReminderSettings {
  location_id: string
  reminders_enabled: boolean
  reminder_hours_before: number
  same_day_reminder_enabled: boolean
  same_day_reminder_hours_before: number
  reminder_subject: string
  reminder_template: string
  attendance_confirmation_required: boolean
  penalty_enabled: boolean
  penalty_threshold: number
  penalty_action: PenaltyAction
  penalty_note: string | null
}

export function defaultReminderSettings(locationId: string): BookingReminderSettings {
  return {
    location_id: locationId,
    reminders_enabled: true,
    reminder_hours_before: 24,
    same_day_reminder_enabled: true,
    same_day_reminder_hours_before: 2,
    reminder_subject: DEFAULT_REMINDER_SUBJECT,
    reminder_template: DEFAULT_REMINDER_TEMPLATE,
    attendance_confirmation_required: true,
    penalty_enabled: true,
    penalty_threshold: 3,
    penalty_action: 'block_until_manual_review',
    penalty_note: 'Repeat no-show profile. Staff review required before accepting another appointment.',
  }
}

export function normalizePhoneForMatch(value: string | null | undefined): string | null {
  if (!value) return null
  const digits = value.replace(/\D/g, '')
  if (!digits) return null
  return digits
}

export function normalizeEmailForMatch(value: string | null | undefined): string | null {
  if (!value) return null
  const normalized = value.trim().toLowerCase()
  return normalized || null
}

export function renderReminderText(
  template: string,
  values: {
    customerName: string
    dateBooked: string
    timeBooked: string
    serviceBooked: string
    branchName: string
    branchAddress: string
    branchContactNumber: string
  }
): string {
  return renderBookingTemplate(template, {
    'Customer Name': values.customerName,
    'date booked': values.dateBooked,
    'time booked': values.timeBooked,
    'service booked': values.serviceBooked,
    'branch name': values.branchName,
    'branch address': values.branchAddress,
    'branch contact number': values.branchContactNumber,
  })
}
