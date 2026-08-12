export function selectTravelPackagePassengerColumns() {
  return `
    id, package_id, first_name, last_name, date_of_birth, passenger_type,
    passport_received, passport_checked, passport_issue_note, visa_status,
    ticket_status, room_allocation, internal_notes, created_by, updated_by,
    created_at, updated_at
  `
}
