import type {
  PackageComponentOption,
  TravelPackageFolder,
  TravelPackageTransportVoucherData,
} from '@/app/types/packages'

const DEFAULT_TRANSPORT_PROVIDER = 'Barakat AlMusafar Trading'
const DEFAULT_TRANSPORT_PROVIDER_CONTACT = '+966555049005'
const DEFAULT_EXTRA_BAGGAGE_FEE = '50 SAR per bag'
const DEFAULT_CUSTOMER_PORTAL_URL = 'https://bookings.piyamtravel.com'
const PIYAM_LOGO_URL = `${DEFAULT_CUSTOMER_PORTAL_URL}/logo.png`

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function dateOnly(value: string | null | undefined) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toISOString().slice(0, 10)
}

function timeOnly(value: string | null | undefined) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toISOString().slice(11, 16)
}

function combineDateTime(date: string, time: string) {
  if (!date && !time) return ''
  if (!date) return time
  if (!time) return date
  return `${date}T${time}`
}

function formatTimeOnly(date: string, time: string) {
  if (!date || !time) return 'N/A'
  const dateTime = new Date(`${date}T${time}`)
  if (Number.isNaN(dateTime.getTime())) return 'N/A'

  const time24hr = dateTime.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
  const ampm = dateTime.toLocaleTimeString('en-US', { hour12: true, hour: 'numeric' }).slice(-2)

  return `${time24hr} ${ampm}`
}

function formatVoucherDateTime(date: string, time: string) {
  if (!date || !time) return 'N/A'
  const parsed = new Date(`${date}T${time}`)
  if (Number.isNaN(parsed.getTime())) return 'N/A'
  const formattedDate = parsed.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
  return `${formattedDate} @ ${formatTimeOnly(date, time)}`
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

function getSummaryLines(value: string | null | undefined) {
  return String(value || '')
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^[-*•]\s*/, ''))
    .filter(Boolean)
}

function getVehicleBags(vehicle: string) {
  const lower = vehicle.toLowerCase()
  if (lower.includes('coach')) return '52'
  if (lower.includes('coaster')) return '18'
  if (lower.includes('hiace')) return '13'
  if (lower.includes('h1')) return '6'
  if (lower.includes('car')) return '3'
  const seats = lower.match(/(\d+)\s*(seat|seater|pax|passenger)/)
  return seats?.[1] || '6'
}

function getVehicleName(value: string | null | undefined) {
  const text = String(value || '').trim()
  if (!text) return 'H1'
  if (/gmc|yukon/i.test(text)) return 'GMC Yukon XL'
  if (/hiace/i.test(text)) return 'Hiace'
  if (/coaster/i.test(text)) return 'Coaster'
  if (/coach/i.test(text)) return 'Coach'
  if (/h1/i.test(text)) return 'H1'
  if (/car/i.test(text)) return 'Car'
  return text
}

function looksLikeUuid(value: string | null | undefined) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value || '').trim(),
  )
}

function looksLikeTransportRoute(value: string | null | undefined) {
  const text = String(value || '').trim()
  if (!text) return false
  return (
    text.startsWith('*') ||
    /\b(jeddah|makkah|mecca|madinah|medina|airport|hotel|ziyarat|mazarat)\b/i.test(text)
  )
}

export function cleanTransportVoucherVehicleLabel(value: string | null | undefined, fallback = '') {
  const text = String(value || '').trim()
  if (!text || looksLikeTransportRoute(text) || looksLikeUuid(text)) return fallback
  return getVehicleName(text)
}

export function getPackageCustomerPortalBaseUrl() {
  return (
    process.env.NEXT_PUBLIC_BOOKINGS_PORTAL_URL ||
    process.env.NEXT_PUBLIC_PACKAGE_PORTAL_URL ||
    DEFAULT_CUSTOMER_PORTAL_URL
  ).replace(/\/+$/, '')
}

export function getPackageDocumentPortalUrl(
  token: string,
  baseUrl = getPackageCustomerPortalBaseUrl(),
) {
  const cleanToken = token.trim()
  return cleanToken ? `${baseUrl}/package-documents/${cleanToken}` : baseUrl
}

function routeType(description: string, index: number, total: number) {
  const lower = description.toLowerCase()
  if (lower.includes('ziyar') || lower.includes('tour')) return "Ziyara'at / Tour"
  if (lower.includes('airport') && index === 0) return 'Airport Pickup'
  if (lower.includes('airport') && index === total - 1) return 'Return Transfer'
  if (lower.includes('hotel')) return 'Hotel Transfer'
  return 'Transport Segment'
}

type VoucherTransportOption = PackageComponentOption | null | undefined
type VoucherRouteAssignment = NonNullable<
  TravelPackageTransportVoucherData['routeAssignments']
>[number]

function getStructuredTransportRoutes(transportOption: VoucherTransportOption) {
  return (transportOption?.transportRoutes || []).filter((route) => route.routeName)
}

function getTransportSupplierName(transportOption: VoucherTransportOption) {
  if (!transportOption) return ''
  if (transportOption.transportMainSupplierName) return transportOption.transportMainSupplierName
  const counts = new Map<string, { name: string; count: number }>()
  for (const route of getStructuredTransportRoutes(transportOption)) {
    if (!route.supplierName) continue
    const current = counts.get(route.supplierName)
    counts.set(route.supplierName, {
      name: route.supplierName,
      count: (current?.count || 0) + 1,
    })
  }
  return Array.from(counts.values()).sort((a, b) => b.count - a.count)[0]?.name || ''
}

function getTransportVehicleName(transportOption: VoucherTransportOption) {
  const routes = getStructuredTransportRoutes(transportOption)
  const vehicleLabels = Array.from(
    new Set(
      routes
        .map((route) =>
          cleanTransportVoucherVehicleLabel(route.vehicleLabel || route.vehicleTypeId),
        )
        .filter(Boolean),
    ),
  )
  if (vehicleLabels.length === 1) return vehicleLabels[0]
  if (vehicleLabels.length > 1) return 'Mixed vehicles'
  return getVehicleName(transportOption?.title || transportOption?.summary)
}

function createRouteAssignments(
  transportOption: VoucherTransportOption,
  departureDate: string,
  returnDate: string,
): VoucherRouteAssignment[] {
  const structuredRoutes = getStructuredTransportRoutes(transportOption)
  const fallbackVehicle = getTransportVehicleName(transportOption)
  return structuredRoutes.map((route, index) => {
    const date =
      index === 0 ? departureDate : index === structuredRoutes.length - 1 ? returnDate : ''
    return {
      routeName: route.routeName,
      type: routeType(route.routeName, index, structuredRoutes.length),
      supplierName: route.supplierName || '',
      vehicleType: cleanTransportVoucherVehicleLabel(
        route.vehicleLabel || route.vehicleTypeId,
        fallbackVehicle,
      ),
      date,
      time: '',
    }
  })
}

function formatPassengerLabel({
  adults,
  children,
  infants,
}: {
  adults: number
  children: number
  infants: number
}) {
  const total = Math.max(0, adults + children + infants)
  const parts = [
    `${adults} Adult${adults === 1 ? '' : 's'}`,
    `${children} Child${children === 1 ? '' : 'ren'}`,
  ]
  if (infants > 0) parts.push(`${infants} Infant${infants === 1 ? '' : 's'}`)
  return `${total} Passenger${total === 1 ? '' : 's'} (${parts.join(', ')})`
}

function createItinerary(
  routes: string[],
  departureDate: string,
  returnDate: string,
): NonNullable<TravelPackageTransportVoucherData['itinerary']> {
  return routes.map((route, index) => ({
    type: routeType(route, index, routes.length),
    description: route,
    date: index === 0 ? departureDate : index === routes.length - 1 ? returnDate : '',
    time: '',
  }))
}

export function createDefaultTransportVoucherData(
  packageFolder: TravelPackageFolder,
): TravelPackageTransportVoucherData {
  const selectedCombination = packageFolder.selected_quote_snapshot?.selection?.combination
  const selectedPayload = packageFolder.selected_quote_snapshot?.payload
  const passengerSummary = packageFolder.passenger_summary || {}
  const adults = Number(passengerSummary.adults || selectedPayload?.adults || 0)
  const children =
    Number(passengerSummary.childrenPaying || selectedPayload?.childrenPaying || 0) +
    Number(passengerSummary.childrenFree || selectedPayload?.childrenFree || 0)
  const infants = Number(passengerSummary.infants || selectedPayload?.infants || 0)
  const departureDate = dateOnly(packageFolder.departure_date || selectedPayload?.departureDate)
  const returnDate = dateOnly(packageFolder.return_date || selectedPayload?.returnDate)
  const transportOption = selectedCombination?.transportOption
  const routeAssignments = createRouteAssignments(transportOption, departureDate, returnDate)
  const structuredRouteLines = routeAssignments.map((route) => route.routeName)
  const transportLines = getSummaryLines(transportOption?.summary)
  const fallbackRoutes = structuredRouteLines.length
    ? structuredRouteLines
    : transportLines.length
      ? transportLines
      : selectedCombination?.staySelections?.length
        ? [
            'Airport to Makkah Hotel',
            ...selectedCombination.staySelections
              .slice(0, -1)
              .map(
                (stay, index) =>
                  `${stay.option.title} to ${selectedCombination.staySelections[index + 1]?.option.title}`,
              ),
            'Hotel to Airport',
          ]
        : []
  const makkahStay = selectedCombination?.staySelections?.find((stay) =>
    /makkah|mecca/i.test(`${stay.groupLabel} ${stay.option.title}`),
  )
  const madinahStay = selectedCombination?.staySelections?.find((stay) =>
    /madinah|medina/i.test(`${stay.groupLabel} ${stay.option.title}`),
  )
  const vehicle = getTransportVehicleName(transportOption)
  const providerName = getTransportSupplierName(transportOption) || DEFAULT_TRANSPORT_PROVIDER

  return {
    bookingId: packageFolder.package_reference,
    adults,
    children,
    infants,
    passengers: formatPassengerLabel({ adults, children, infants }),
    flightNumber: '',
    airports: selectedCombination?.flightOption?.title || '',
    landingDate: departureDate,
    landingTime: '',
    vehicle,
    maxBags: getVehicleBags(vehicle),
    extraBaggageFee: DEFAULT_EXTRA_BAGGAGE_FEE,
    providerName,
    providerContact: DEFAULT_TRANSPORT_PROVIDER_CONTACT,
    itinerary: routeAssignments.length
      ? routeAssignments.map((route) => ({
          type: route.type,
          description: route.routeName,
          date: route.date || '',
          time: route.time || '',
        }))
      : createItinerary(fallbackRoutes, departureDate, returnDate),
    routeAssignments,
    sourceTransportOptionId: transportOption?.id || '',
    sourceTransportOptionTitle: transportOption?.title || '',
    digitalVoucherUrl: '',
    qrCodeDataUrl: '',
    quoteSnapshot: {
      title: packageFolder.selected_quote_snapshot?.quote?.title || '',
      packageType: packageFolder.selected_quote_snapshot?.quote?.package_type || '',
      departureDate,
      returnDate,
      adults,
      children,
      infants,
      flightTitle: selectedCombination?.flightOption?.title || '',
      makkahHotel: makkahStay?.option.title || '',
      madinahHotel: madinahStay?.option.title || '',
      transportOptionId: transportOption?.id || '',
      transportOptionTitle: transportOption?.title || '',
      transportProvider: providerName,
      routes: fallbackRoutes,
    },
    arrivalAirport: '',
    arrivalAt: packageFolder.departure_date || '',
    departureAirport: '',
    departureAt: packageFolder.return_date || '',
    makkahHotel: makkahStay?.option.title || '',
    madinahHotel: madinahStay?.option.title || '',
    routes: fallbackRoutes,
    vehicleType: vehicle,
    transportCompany: providerName,
    driverContact: '',
    groundManager: DEFAULT_TRANSPORT_PROVIDER_CONTACT,
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
  const numberValue = (key: keyof TravelPackageTransportVoucherData) => {
    const parsed = Number(input[key] ?? fallback?.[key] ?? 0)
    return Number.isFinite(parsed) ? Math.max(0, parsed) : 0
  }
  const itinerarySource = Array.isArray(input.itinerary)
    ? input.itinerary
    : fallback?.itinerary || []
  const itinerary = itinerarySource
    .map((item) => {
      const candidate = item && typeof item === 'object' ? (item as Record<string, unknown>) : {}
      return {
        type: String(candidate.type || '').trim(),
        description: String(candidate.description || '').trim(),
        date: String(candidate.date || '').trim(),
        time: String(candidate.time || '').trim(),
      }
    })
    .filter((item) => item.type || item.description || item.date || item.time)
    .slice(0, 20)
  const routeAssignmentsSource = Array.isArray(input.routeAssignments)
    ? input.routeAssignments
    : fallback?.routeAssignments || []
  const routeAssignments = routeAssignmentsSource
    .map((item) => {
      const candidate = item && typeof item === 'object' ? (item as Record<string, unknown>) : {}
      return {
        routeName: String(candidate.routeName || '').trim(),
        type: String(candidate.type || '').trim(),
        supplierName: String(candidate.supplierName || '').trim(),
        vehicleType: cleanTransportVoucherVehicleLabel(
          String(candidate.vehicleType || '').trim(),
          String(fallback?.vehicleType || fallback?.vehicle || '').trim(),
        ),
        date: String(candidate.date || '').trim(),
        time: String(candidate.time || '').trim(),
      }
    })
    .filter((item) => item.routeName || item.type || item.supplierName || item.vehicleType)
    .slice(0, 20)
  const adults = numberValue('adults')
  const children = numberValue('children')
  const infants = numberValue('infants')
  const vehicle = text('vehicle') || text('vehicleType')
  const providerName = text('providerName') || text('transportCompany')
  const providerContact = text('providerContact') || text('groundManager')
  const quoteSnapshotInput =
    input.quoteSnapshot && typeof input.quoteSnapshot === 'object'
      ? (input.quoteSnapshot as Record<string, unknown>)
      : fallback?.quoteSnapshot || {}
  const quoteSnapshotRoutes = Array.isArray(quoteSnapshotInput.routes)
    ? quoteSnapshotInput.routes
        .map((route) => String(route).trim())
        .filter(Boolean)
        .slice(0, 20)
    : fallback?.quoteSnapshot?.routes || []

  return {
    bookingId: text('bookingId'),
    adults,
    children,
    infants,
    passengers: text('passengers') || formatPassengerLabel({ adults, children, infants }),
    flightNumber: text('flightNumber'),
    airports: text('airports'),
    landingDate: text('landingDate') || dateOnly(text('arrivalAt')),
    landingTime: text('landingTime') || timeOnly(text('arrivalAt')),
    vehicle,
    maxBags: text('maxBags') || getVehicleBags(vehicle),
    extraBaggageFee: text('extraBaggageFee') || DEFAULT_EXTRA_BAGGAGE_FEE,
    providerName,
    providerContact,
    itinerary,
    routeAssignments,
    sourceTransportOptionId: text('sourceTransportOptionId'),
    sourceTransportOptionTitle: text('sourceTransportOptionTitle'),
    digitalVoucherUrl: text('digitalVoucherUrl'),
    qrCodeDataUrl: text('qrCodeDataUrl'),
    quoteSnapshot: {
      title: String(quoteSnapshotInput.title || '').trim(),
      packageType: String(quoteSnapshotInput.packageType || '').trim(),
      departureDate: String(quoteSnapshotInput.departureDate || '').trim(),
      returnDate: String(quoteSnapshotInput.returnDate || '').trim(),
      adults: Number(quoteSnapshotInput.adults || 0) || 0,
      children: Number(quoteSnapshotInput.children || 0) || 0,
      infants: Number(quoteSnapshotInput.infants || 0) || 0,
      flightTitle: String(quoteSnapshotInput.flightTitle || '').trim(),
      makkahHotel: String(quoteSnapshotInput.makkahHotel || '').trim(),
      madinahHotel: String(quoteSnapshotInput.madinahHotel || '').trim(),
      transportOptionId: String(quoteSnapshotInput.transportOptionId || '').trim(),
      transportOptionTitle: String(quoteSnapshotInput.transportOptionTitle || '').trim(),
      transportProvider: String(quoteSnapshotInput.transportProvider || '').trim(),
      routes: quoteSnapshotRoutes,
    },
    arrivalAirport: text('arrivalAirport'),
    arrivalAt: text('arrivalAt') || combineDateTime(text('landingDate'), text('landingTime')),
    departureAirport: text('departureAirport'),
    departureAt: text('departureAt'),
    makkahHotel: text('makkahHotel'),
    madinahHotel: text('madinahHotel'),
    routes,
    vehicleType: text('vehicleType') || vehicle,
    transportCompany: text('transportCompany') || providerName,
    driverContact: text('driverContact'),
    groundManager: text('groundManager') || providerContact,
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
  const itinerary =
    data.itinerary && data.itinerary.length > 0
      ? data.itinerary
      : createItinerary(data.routes || [], '', '')
  const routeAssignments = data.routeAssignments || []
  const formatSegmentSchedule = (date: string, time: string) => {
    if (date && time) return formatVoucherDateTime(date, time)
    if (date) {
      const parsed = new Date(date)
      if (Number.isNaN(parsed.getTime())) return date
      return parsed.toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
    }
    if (time) return formatTimeOnly('2000-01-01', time)
    return 'Timing to be confirmed'
  }
  const itineraryHtml = itinerary.length
    ? itinerary
        .map((item, index) => {
          const assignment = routeAssignments[index]
          const detailParts = [
            assignment?.vehicleType ? `Vehicle: ${assignment.vehicleType}` : '',
            assignment?.supplierName ? `Provider: ${assignment.supplierName}` : '',
          ].filter(Boolean)
          return `<div class="segment"><div><strong>${index + 1}. ${escapeHtml(item.type || assignment?.type || 'Transport Segment')}</strong></div><div>${escapeHtml(item.description || assignment?.routeName || 'Details to be confirmed')}</div><div class="segment-time">${escapeHtml(formatSegmentSchedule(item.date || assignment?.date || '', item.time || assignment?.time || ''))}</div>${detailParts.length ? `<div class="segment-meta">${escapeHtml(detailParts.join(' · '))}</div>` : ''}</div>`
        })
        .join('')
    : '<div class="segment"><div><strong>1. Transport Segment</strong></div><div>Details to be confirmed</div><div class="segment-time">Timing to be confirmed</div></div>'
  const qrText = [
    'GROUND TRANSPORT',
    `REF: ${packageFolder.package_reference}`,
    `PASSENGER: ${packageFolder.customer_name || 'Customer'}`,
    '',
    ...itinerary.map(
      (item, index) =>
        `${index + 1}. ${item.type}: ${item.description} at ${formatVoucherDateTime(item.date, item.time)}`,
    ),
  ].join('\n')
  const qrContent = data.qrCodeDataUrl
    ? `<img src="${escapeHtml(data.qrCodeDataUrl)}" alt="Open digital voucher" />`
    : escapeHtml((data.digitalVoucherUrl || qrText).trim())
  const passengerLabel =
    data.passengers ||
    formatPassengerLabel({
      adults: data.adults || 0,
      children: data.children || 0,
      infants: data.infants || 0,
    })
  const vehicle = data.vehicle || data.vehicleType || 'To be confirmed'
  const providerName = data.providerName || data.transportCompany || 'To be confirmed'
  const providerContact = data.providerContact || data.groundManager || 'To be confirmed'

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Transport Voucher ${escapeHtml(packageFolder.package_reference)}</title>
  <style>
    @page{size:220mm 110mm;margin:0}*{box-sizing:border-box}body{font-family:Inter,Arial,sans-serif;color:#111827;margin:0;background:#f4f6f8}.voucher{width:220mm;min-height:110mm;max-width:100%;margin:24px auto;background:#fff;display:flex;border-radius:12px;border:1px dashed #cbd5e1;overflow:hidden}.main{flex:1;padding:7mm;display:flex;flex-direction:column;font-size:11px}.header{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:4mm;border-bottom:1px solid #e5e7eb}.brand{font-size:19px;font-weight:900;color:#800000}.title{text-align:right}.title h1{font-size:22px;font-weight:900;color:#800000;margin:0;line-height:1}.title p{font-size:9px;font-weight:800;color:#6b7280;letter-spacing:.05em;margin:2px 0 0}.grid{display:grid;grid-template-columns:1fr 1fr;gap:3mm 7mm;margin-top:4mm;flex:1}.label{font-size:8px;color:#6b7280;margin:0;text-transform:uppercase;font-weight:800;letter-spacing:.03em}.value{font-weight:800;color:#1f2937;margin:0}.lead{font-size:15px;color:#111827}.itinerary{grid-column:span 2;border-top:1px solid #e5e7eb;padding-top:3mm}.itinerary-list{font-size:10px;margin-top:2mm;color:#374151;display:grid;grid-template-columns:1fr;gap:1.5mm}.segment{border:1px solid #e5e7eb;border-radius:5px;padding:2mm 2.5mm;background:#f9fafb;break-inside:avoid}.segment-time{margin-top:1mm;font-weight:900;color:#800000}.segment-meta{margin-top:1mm;font-size:8px;color:#6b7280}.footer{border-top:1px solid #e5e7eb;padding-top:2.5mm;margin-top:auto;font-size:9px;display:flex;justify-content:space-between;gap:6mm}.stub{background:#800000;color:#fff;padding:6mm;width:62mm;flex-shrink:0;display:flex;flex-direction:column;justify-content:space-between}.stub-head{text-align:center;padding-bottom:4mm;border-bottom:1px solid #a83333}.stub-logo{display:block;margin:0 auto;max-width:42mm;max-height:19mm;background:#fff;border-radius:6px;padding:3mm}.stub-head p{font-size:9px;opacity:.85;margin:2mm 0 0;font-weight:800;letter-spacing:.08em}.stub-stack{margin-top:4mm;font-size:11px;display:flex;flex-direction:column;gap:3mm}.stub-label{font-size:8px;color:#fecaca;margin:0;font-weight:800;letter-spacing:.04em}.stub-value{font-weight:800;margin:0}.qr{background:#fff;color:#111827;padding:2mm;border-radius:6px;font-size:7px;white-space:pre-wrap;word-break:break-word;overflow:hidden;min-height:32mm;display:flex;align-items:center;justify-content:center}.qr img{display:block;width:30mm;height:30mm}.notice{margin-top:3mm;padding:2.5mm;background:#fef2f2;border-left:3px solid #800000;white-space:pre-wrap;font-size:9px}@media print{html,body{width:220mm;height:110mm;background:#fff}.voucher{width:220mm;height:110mm;margin:0;border-radius:0;border:1px dashed #94a3b8;box-shadow:none}.main{padding:6mm}.stub{padding:6mm}.segment{padding:1.8mm 2.3mm}.itinerary-list{gap:1.2mm}.no-print{display:none}}@media(max-width:720px){.voucher{margin:0;border-radius:0;display:block;width:100%;min-height:auto}.stub{width:auto}.grid{grid-template-columns:1fr}.itinerary{grid-column:auto}.footer{display:block}.title{text-align:left;margin-top:10px}.header{display:block}}
  </style>
</head>
<body><main class="voucher">
  <section class="main">
    <header class="header">
      <div class="brand">Piyam Travel</div>
      <div class="title"><h1>GROUND TRANSPORT</h1><p>VOUCHER / ITINERARY</p></div>
    </header>
    <div class="grid">
      <div><p class="label">Lead passenger</p><p class="value lead">${escapeHtml(packageFolder.customer_name || 'Customer')}</p></div>
      <div></div>
      <div><p class="label">Passengers</p><p class="value">${escapeHtml(passengerLabel || String(passengerCount || 'To be confirmed'))}</p></div>
      <div><p class="label">Flight</p><p class="value">${escapeHtml(data.flightNumber || 'To be confirmed')}</p></div>
      <div><p class="label">Arrival from</p><p class="value">${escapeHtml(data.airports || data.arrivalAirport || 'To be confirmed')}</p></div>
      <div><p class="label">Landing</p><p class="value">${escapeHtml(formatVoucherDateTime(data.landingDate || dateOnly(data.arrivalAt), data.landingTime || timeOnly(data.arrivalAt)))}</p></div>
      <div class="itinerary"><p class="label">Itinerary</p><div class="itinerary-list">${itineraryHtml}</div></div>
    </div>
    <div class="footer">
      <div><p class="value">Transport Provider: ${escapeHtml(providerName)}</p><p style="margin:0">Transport Manager contact: ${escapeHtml(providerContact)}</p></div>
      <div style="text-align:right"><p class="value">Voucher Agency: Piyam Travel</p><p style="margin:0">Email: info@piyamtravel.com | 24/7: +447400828212</p></div>
    </div>
    ${data.publicNotes ? `<div class="notice">${escapeHtml(data.publicNotes)}</div>` : ''}
  </section>
  <aside class="stub">
    <div>
      <div class="stub-head"><img class="stub-logo" src="${escapeHtml(PIYAM_LOGO_URL)}" alt="Piyam Travel"><p>CUSTOMER COPY</p></div>
      <div class="stub-stack">
        <div><p class="stub-label">PASSENGER</p><p class="stub-value">${escapeHtml(packageFolder.customer_name || 'Customer')}</p></div>
        <div><p class="stub-label">REFERENCE</p><p class="stub-value">${escapeHtml(packageFolder.package_reference)}</p></div>
        <div><p class="stub-label">BOOKING ID</p><p class="stub-value">${escapeHtml(data.bookingId || 'N/A')}</p></div>
        <div><p class="stub-label">VEHICLE</p><p class="stub-value">${escapeHtml(vehicle)}</p></div>
        <div><p class="stub-label">BAGGAGE</p><p class="stub-value" style="font-size:12px">${escapeHtml(data.maxBags || '0')} Bags Max (${escapeHtml(data.extraBaggageFee || DEFAULT_EXTRA_BAGGAGE_FEE)})</p></div>
      </div>
    </div>
    <div class="qr">${qrContent}</div>
  </aside>
</main></body></html>`
}
