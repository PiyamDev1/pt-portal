export function selectTravelPackagePaymentColumns() {
  return `
    id, package_id, invoice_id, reservation_id, amount, currency, payment_type, payment_method,
    payment_status, requested_at, due_at, received_at, received_by,
    receipt_reference, receipt_document_id, notes, metadata, created_by,
    updated_by, created_at, updated_at
  `
}
