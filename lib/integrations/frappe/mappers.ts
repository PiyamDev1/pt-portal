/**
 * Frappe Integration Mappers
 *
 * Converts between PT Portal records and Frappe-compatible payloads.
 */

export type LeaveRequestRow = {
  id: string
  employee_id: string
  leave_type_id: string
  from_date: string
  to_date: string
  half_day: boolean
  half_day_date: string | null
  requested_days: number
  status: 'pending' | 'approved' | 'rejected' | 'cancelled'
  approver_id: string | null
  rejection_reason: string | null
  frappe_docname: string | null
  sync_version: number
  source_system?: string
}

export type AttendanceDailyRow = {
  employee_id: string
  attendance_date: string
  first_punch_at: string | null
  last_punch_at: string | null
  worked_minutes: number | null
  status: 'present' | 'absent' | 'on_leave' | 'half_day' | 'weekend' | 'holiday'
  source: 'timeclock' | 'leave' | 'manual'
}

export type LifecycleRow = {
  employee_id: string
  lifecycle_status: 'active' | 'notice' | 'offboarding' | 'terminated'
  join_date: string | null
  notice_start_date: string | null
  last_working_day: string | null
  termination_reason: string | null
}

export function mapLeaveToFrappePayload(record: LeaveRequestRow) {
  return {
    external_id: record.id,
    employee: record.employee_id,
    leave_type: record.leave_type_id,
    from_date: record.from_date,
    to_date: record.to_date,
    half_day: record.half_day,
    half_day_date: record.half_day_date,
    total_leave_days: record.requested_days,
    status: mapLeaveStatusToFrappe(record.status),
    rejection_reason: record.rejection_reason,
    pt_sync_version: record.sync_version,
  }
}

export function mapAttendanceToFrappePayload(record: AttendanceDailyRow) {
  return {
    employee: record.employee_id,
    attendance_date: record.attendance_date,
    status: mapAttendanceStatusToFrappe(record.status),
    working_hours: record.worked_minutes ? Number((record.worked_minutes / 60).toFixed(2)) : 0,
    pt_source: record.source,
    pt_first_punch_at: record.first_punch_at,
    pt_last_punch_at: record.last_punch_at,
  }
}

export function mapLifecycleToFrappePayload(record: LifecycleRow) {
  return {
    employee: record.employee_id,
    employment_status: record.lifecycle_status,
    date_of_joining: record.join_date,
    notice_start_date: record.notice_start_date,
    relieving_date: record.last_working_day,
    termination_reason: record.termination_reason,
  }
}

export function mapLeaveStatusFromFrappe(status: string | null | undefined): LeaveRequestRow['status'] {
  const value = String(status || '').trim().toLowerCase()

  if (value === 'approved') return 'approved'
  if (value === 'rejected') return 'rejected'
  if (value === 'cancelled' || value === 'canceled') return 'cancelled'
  return 'pending'
}

function mapLeaveStatusToFrappe(status: LeaveRequestRow['status']) {
  if (status === 'pending') return 'Open'
  if (status === 'approved') return 'Approved'
  if (status === 'rejected') return 'Rejected'
  return 'Cancelled'
}

function mapAttendanceStatusToFrappe(status: AttendanceDailyRow['status']) {
  if (status === 'present') return 'Present'
  if (status === 'half_day') return 'Half Day'
  if (status === 'on_leave') return 'On Leave'
  if (status === 'holiday') return 'On Leave'
  if (status === 'weekend') return 'Absent'
  return 'Absent'
}
