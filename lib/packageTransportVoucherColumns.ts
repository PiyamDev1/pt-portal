export function selectTravelPackageVoucherColumns() {
  return `
    id, package_id, reservation_id, document_id, version, status,
    customer_visible, voucher_data, rendered_html, generated_at, released_at,
    released_by, created_by, updated_by, created_at, updated_at
  `
}
