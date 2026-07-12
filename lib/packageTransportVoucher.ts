import type { TravelPackageFolder, TravelPackageTransportVoucherData } from '@/app/types/packages'

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function formatDateTime(value: string) {
  if (!value) return 'To be confirmed'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return escapeHtml(value)
  return date.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  })
}

export function createDefaultTransportVoucherData(
  packageFolder: TravelPackageFolder,
): TravelPackageTransportVoucherData {
  return {
    arrivalAirport: '',
    arrivalAt: packageFolder.departure_date || '',
    departureAirport: '',
    departureAt: packageFolder.return_date || '',
    makkahHotel: '',
    madinahHotel: '',
    routes: [],
    vehicleType: '',
    transportCompany: '',
    driverContact: '',
    groundManager: '',
    publicNotes: '',
    internalNotes: '',
  }
}

export function normalizeTransportVoucherData(
  value: unknown,
  fallback?: Partial<TravelPackageTransportVoucherData>,
): TravelPackageTransportVoucherData {
  const input = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  const text = (key: keyof TravelPackageTransportVoucherData) =>
    typeof input[key] === 'string'
      ? String(input[key]).trim()
      : String(fallback?.[key] || '').trim()
  const routes = Array.isArray(input.routes)
    ? input.routes
        .map((route) => String(route).trim())
        .filter(Boolean)
        .slice(0, 20)
    : fallback?.routes || []

  return {
    arrivalAirport: text('arrivalAirport'),
    arrivalAt: text('arrivalAt'),
    departureAirport: text('departureAirport'),
    departureAt: text('departureAt'),
    makkahHotel: text('makkahHotel'),
    madinahHotel: text('madinahHotel'),
    routes,
    vehicleType: text('vehicleType'),
    transportCompany: text('transportCompany'),
    driverContact: text('driverContact'),
    groundManager: text('groundManager'),
    publicNotes: text('publicNotes'),
    internalNotes: text('internalNotes'),
  }
}

export function renderTransportVoucherHtml(
  packageFolder: Pick<
    TravelPackageFolder,
    'package_reference' | 'customer_name' | 'passenger_summary'
  >,
  data: TravelPackageTransportVoucherData,
) {
  const passengerCount = Number(packageFolder.passenger_summary?.totalPassengers || 0)
  const routes = data.routes.length
    ? `<ul>${data.routes.map((route) => `<li>${escapeHtml(route)}</li>`).join('')}</ul>`
    : '<p>Routes to be confirmed</p>'

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Transport Voucher ${escapeHtml(packageFolder.package_reference)}</title>
  <style>
    body{font-family:Arial,sans-serif;color:#172033;margin:0;background:#f4f6f8}.page{max-width:820px;margin:24px auto;background:#fff;border:1px solid #d9dee7}.header{background:#4b0f16;color:#fff;padding:24px 28px}.header h1{margin:4px 0 0;font-size:28px}.content{padding:28px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}.box{border:1px solid #d9dee7;padding:14px}.label{font-size:11px;text-transform:uppercase;font-weight:700;color:#687386}.value{margin-top:5px;font-size:15px;font-weight:700}.section{margin-top:20px;border-top:2px solid #4b0f16;padding-top:16px}.section h2{font-size:17px;margin:0 0 10px}li{margin:7px 0}.notice{margin-top:22px;padding:14px;background:#f7f1f2;border-left:4px solid #8b1e2d;white-space:pre-wrap}@media(max-width:640px){.page{margin:0}.grid{grid-template-columns:1fr}.content{padding:18px}}
  </style>
</head>
<body><main class="page">
  <header class="header"><div>Piyam Travel</div><h1>Transport Voucher</h1></header>
  <div class="content">
    <div class="grid">
      <div class="box"><div class="label">Package reference</div><div class="value">${escapeHtml(packageFolder.package_reference)}</div></div>
      <div class="box"><div class="label">Lead customer</div><div class="value">${escapeHtml(packageFolder.customer_name || 'Customer')}</div></div>
      <div class="box"><div class="label">Passengers</div><div class="value">${passengerCount || 'To be confirmed'}</div></div>
      <div class="box"><div class="label">Vehicle</div><div class="value">${escapeHtml(data.vehicleType || 'To be confirmed')}</div></div>
    </div>
    <section class="section"><h2>Arrival</h2><p><strong>${escapeHtml(data.arrivalAirport || 'Airport to be confirmed')}</strong><br>${formatDateTime(data.arrivalAt)}</p></section>
    <section class="section"><h2>Departure</h2><p><strong>${escapeHtml(data.departureAirport || 'Airport to be confirmed')}</strong><br>${formatDateTime(data.departureAt)}</p></section>
    <section class="section"><h2>Hotels</h2><p>Makkah: <strong>${escapeHtml(data.makkahHotel || 'To be confirmed')}</strong><br>Madinah: <strong>${escapeHtml(data.madinahHotel || 'To be confirmed')}</strong></p></section>
    <section class="section"><h2>Journey plan</h2>${routes}</section>
    <section class="section"><h2>Transport contacts</h2><p>Company: <strong>${escapeHtml(data.transportCompany || 'To be confirmed')}</strong><br>Driver: <strong>${escapeHtml(data.driverContact || 'To be confirmed')}</strong><br>Ground manager: <strong>${escapeHtml(data.groundManager || 'To be confirmed')}</strong></p></section>
    ${data.publicNotes ? `<div class="notice">${escapeHtml(data.publicNotes)}</div>` : ''}
  </div>
</main></body></html>`
}
