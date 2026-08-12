import type {
  PackageTransportRouteKind,
  PackageTransportRouteSelection,
} from '@/app/types/packages'

export type UmrahTransportPricingRoute = {
  id: string
  route_name: string
}

export type UmrahTransportPricingSupplier = {
  id: string
  name: string
  default_currency: string
}

export type UmrahTransportPricingVehicle = {
  id: string
  label: string
  passenger_capacity: string | null
}

export type UmrahTransportPricingRate = {
  route_id: string
  supplier_id: string
  vehicle_type_id: string
  currency: string
  cost_price: number
}

export type UmrahTransportPricingLabel = {
  supplier_id: string
  vehicle_type_id: string
  transport_label: string | null
}

export type UmrahTransportPricingData = {
  routes: UmrahTransportPricingRoute[]
  suppliers: UmrahTransportPricingSupplier[]
  vehicles: UmrahTransportPricingVehicle[]
  rates: UmrahTransportPricingRate[]
  labels: UmrahTransportPricingLabel[]
  sarToGbpExchangeRate: number
  damageRecoveryMarginMode: 'percent' | 'fixed'
  damageRecoveryMarginValue: number
  setupRequired?: boolean
  message?: string
}

export function makeId(prefix: string) {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}-${crypto.randomUUID().slice(0, 8)}`
  }
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`
}

function normalizeSearchText(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export function getRouteKind(routeName: string): PackageTransportRouteKind {
  const normalized = normalizeSearchText(routeName)
  if (normalized.includes('makkah') && normalized.includes('ziyarat')) return 'makkah_ziyarat'
  if (
    (normalized.includes('madinah') || normalized.includes('madina')) &&
    normalized.includes('ziyarat')
  ) {
    return 'madinah_ziyarat'
  }
  return 'transfer'
}

function isRouteKind(route: UmrahTransportPricingRoute, kind: PackageTransportRouteKind) {
  return getRouteKind(route.route_name) === kind
}

function getSupplierVehicleLabel(
  pricing: UmrahTransportPricingData | null,
  supplierId: string,
  vehicleTypeId: string,
) {
  if (!pricing) return ''
  const supplierLabel = pricing.labels.find(
    (label) => label.supplier_id === supplierId && label.vehicle_type_id === vehicleTypeId,
  )?.transport_label
  return (
    supplierLabel ||
    pricing.vehicles.find((vehicle) => vehicle.id === vehicleTypeId)?.label ||
    'Transport'
  )
}

function getTransportRate(
  pricing: UmrahTransportPricingData | null,
  routeId: string,
  supplierId: string,
  vehicleTypeId: string,
) {
  return pricing?.rates.find(
    (rate) =>
      rate.route_id === routeId &&
      rate.supplier_id === supplierId &&
      rate.vehicle_type_id === vehicleTypeId,
  )
}

export function convertTransportCostToGbp(
  amount: number,
  currency: string,
  pricing: UmrahTransportPricingData | null,
) {
  if (currency === 'GBP') return amount
  if (currency === 'SAR') {
    const exchangeRate = pricing?.sarToGbpExchangeRate || 0
    return exchangeRate > 0 ? amount / exchangeRate : amount
  }
  return amount
}

function getTransportExchangeRateSnapshot(
  currency: string,
  pricing: UmrahTransportPricingData | null,
) {
  if (currency === 'SAR') return pricing?.sarToGbpExchangeRate || 0
  if (currency === 'GBP') return 1
  return 0
}

function getDamageRecoveryMargin(baseCostGbp: number, pricing: UmrahTransportPricingData | null) {
  const mode: 'percent' | 'fixed' =
    pricing?.damageRecoveryMarginMode === 'percent' ? 'percent' : 'fixed'
  const value = Number(pricing?.damageRecoveryMarginValue || 0)
  const margin = mode === 'percent' ? baseCostGbp * (value / 100) : value
  return {
    mode,
    value,
    amountGbp: Math.max(0, Math.round(margin * 100) / 100),
  }
}

function buildTransportRouteCostSnapshot({
  routeId,
  supplierId,
  vehicleTypeId,
  pricing,
}: {
  routeId: string
  supplierId: string
  vehicleTypeId: string
  pricing: UmrahTransportPricingData | null
}) {
  const rate = getTransportRate(pricing, routeId, supplierId, vehicleTypeId)
  const supplier = pricing?.suppliers.find((item) => item.id === supplierId)
  if (!rate || !supplier) return null

  const costPrice = Number(rate.cost_price || 0)
  const currency = rate.currency || supplier.default_currency || 'GBP'
  const exchangeRate = getTransportExchangeRateSnapshot(currency, pricing)
  const baseCostPriceGbp = convertTransportCostToGbp(costPrice, currency, pricing)
  const margin = getDamageRecoveryMargin(baseCostPriceGbp, pricing)
  const costPriceGbp = baseCostPriceGbp + margin.amountGbp

  return {
    supplier,
    costPrice,
    currency,
    baseCostPriceGbp: Math.round(baseCostPriceGbp * 100) / 100,
    costPriceGbp: Math.round(costPriceGbp * 100) / 100,
    exchangeRate,
    margin,
  }
}

function findCheapestTransportRate(
  pricing: UmrahTransportPricingData | null,
  routeId: string,
  vehicleTypeId: string,
) {
  if (!pricing) return null
  return pricing.rates
    .filter(
      (rate) =>
        rate.route_id === routeId &&
        rate.vehicle_type_id === vehicleTypeId &&
        Number(rate.cost_price) > 0,
    )
    .sort((a, b) => {
      const aGbp = convertTransportCostToGbp(Number(a.cost_price), a.currency, pricing)
      const bGbp = convertTransportCostToGbp(Number(b.cost_price), b.currency, pricing)
      return aGbp - bGbp
    })[0]
}

function hasTransportRateForVehicle(
  pricing: UmrahTransportPricingData | null,
  routeId: string,
  vehicleTypeId: string,
) {
  return Boolean(findCheapestTransportRate(pricing, routeId, vehicleTypeId))
}

export function getPricedRouteOptions(
  pricing: UmrahTransportPricingData | null,
  vehicleTypeId: string,
  kind?: PackageTransportRouteKind,
) {
  if (!pricing || !vehicleTypeId) return []
  return pricing.routes.filter((route) => {
    if (kind && !isRouteKind(route, kind)) return false
    return hasTransportRateForVehicle(pricing, route.id, vehicleTypeId)
  })
}

function getRouteCategory(routeName: string) {
  const normalized = normalizeSearchText(routeName)
  if (normalized.startsWith('jeddah') || normalized.includes(' jeddah ')) return 'Jeddah'
  if (normalized.startsWith('makkah') || normalized.includes(' makkah ')) return 'Makkah'
  if (
    normalized.startsWith('madinah') ||
    normalized.startsWith('madina') ||
    normalized.includes(' madinah ') ||
    normalized.includes(' madina ')
  ) {
    return 'Madinah'
  }
  return 'Other routes'
}

export function getGroupedRouteOptions(routes: UmrahTransportPricingRoute[]) {
  const categoryOrder = ['Jeddah', 'Makkah', 'Madinah', 'Other routes']
  const grouped = new Map<string, UmrahTransportPricingRoute[]>()
  routes.forEach((route) => {
    const category = getRouteCategory(route.route_name)
    grouped.set(category, [...(grouped.get(category) || []), route])
  })
  return categoryOrder
    .map((category) => ({
      category,
      routes: grouped.get(category) || [],
    }))
    .filter((group) => group.routes.length > 0)
}

export function findDefaultTransportSelection(
  pricing: UmrahTransportPricingData | null,
  kind: PackageTransportRouteKind,
) {
  if (!pricing) return null
  for (const vehicle of pricing.vehicles) {
    const route = getPricedRouteOptions(pricing, vehicle.id, kind)[0]
    if (route) return { route, vehicle }
  }
  return null
}

export function getMajoritySupplier(routes: PackageTransportRouteSelection[]) {
  const counts = new Map<string, { supplierId: string; supplierName: string; count: number }>()
  routes.forEach((route) => {
    if (!route.supplierId) return
    const current = counts.get(route.supplierId)
    counts.set(route.supplierId, {
      supplierId: route.supplierId,
      supplierName: route.supplierName,
      count: (current?.count || 0) + 1,
    })
  })
  return Array.from(counts.values()).sort((a, b) => b.count - a.count)[0] || null
}

export function getTransportRouteBullets(routes: PackageTransportRouteSelection[]) {
  return routes.map((route) => `* ${route.routeName}`)
}

export function getTransportRouteBulletText(line: string) {
  return line.match(/^\*\s+(.+)$/)?.[1] || line
}

export function buildTransportSummary(routes: PackageTransportRouteSelection[], fallback: string) {
  if (routes.length === 0) return fallback
  return getTransportRouteBullets(routes).join('\n')
}

export function restoreTransportRoutesFromSummary(
  summary: string,
  pricing: UmrahTransportPricingData | null,
) {
  if (!pricing) return []
  const routeLookup = new Map(
    pricing.routes.map((route) => [normalizeSearchText(route.route_name), route]),
  )

  return summary
    .split('\n')
    .map((line) => line.match(/^\*\s+(.+)$/)?.[1]?.trim() || '')
    .filter(Boolean)
    .map((routeName) => {
      const route =
        routeLookup.get(normalizeSearchText(routeName)) ||
        pricing.routes.find(
          (item) =>
            normalizeSearchText(item.route_name).includes(normalizeSearchText(routeName)) ||
            normalizeSearchText(routeName).includes(normalizeSearchText(item.route_name)),
        )
      if (!route) return null

      const vehicle =
        pricing.vehicles.find((item) => hasTransportRateForVehicle(pricing, route.id, item.id)) ||
        pricing.vehicles[0]
      if (!vehicle) return null

      return resolveTransportRouteSelection(
        {
          id: makeId('transport-route'),
          kind: getRouteKind(route.route_name),
          routeId: route.id,
          vehicleTypeId: vehicle.id,
        },
        pricing,
      )
    })
    .filter((route): route is PackageTransportRouteSelection => Boolean(route))
}

export function resolveTransportRouteSelection(
  current: Partial<PackageTransportRouteSelection>,
  pricing: UmrahTransportPricingData | null,
): PackageTransportRouteSelection {
  const vehicle =
    pricing?.vehicles.find((item) => item.id === current.vehicleTypeId) || pricing?.vehicles[0]
  const pricedRoutes = vehicle ? getPricedRouteOptions(pricing, vehicle.id, current.kind) : []
  const route = pricedRoutes.find((item) => item.id === current.routeId) || pricedRoutes[0]
  const cheapestRate =
    route && vehicle ? findCheapestTransportRate(pricing, route.id, vehicle.id) : null
  const supplier = pricing?.suppliers.find((item) => item.id === cheapestRate?.supplier_id)
  const costSnapshot =
    route && supplier && vehicle
      ? buildTransportRouteCostSnapshot({
          routeId: route.id,
          supplierId: supplier.id,
          vehicleTypeId: vehicle.id,
          pricing,
        })
      : null

  return {
    id: current.id || makeId('transport-route'),
    kind: current.kind || getRouteKind(route?.route_name || ''),
    routeId: route?.id || '',
    routeName: route?.route_name || current.routeName || 'Transport route',
    supplierId: supplier?.id || '',
    supplierName: supplier?.name || '',
    vehicleTypeId: vehicle?.id || '',
    vehicleLabel:
      supplier && vehicle ? getSupplierVehicleLabel(pricing, supplier.id, vehicle.id) : '',
    costPrice: costSnapshot?.costPrice || 0,
    currency: costSnapshot?.currency || supplier?.default_currency || 'GBP',
    baseCostPriceGbp: costSnapshot?.baseCostPriceGbp || 0,
    costPriceGbp: costSnapshot?.costPriceGbp || 0,
    exchangeRate: costSnapshot?.exchangeRate || 0,
    exchangeRateMode: 'sar_per_gbp',
    damageRecoveryMarginMode: costSnapshot?.margin.mode || 'fixed',
    damageRecoveryMarginValue: costSnapshot?.margin.value || 0,
    damageRecoveryMarginAmountGbp: costSnapshot?.margin.amountGbp || 0,
  }
}

export function getTransportRouteNetCostForSupplier(
  route: PackageTransportRouteSelection,
  supplierId: string | undefined,
  pricing: UmrahTransportPricingData | null,
) {
  if (!supplierId) return route.costPriceGbp || 0
  const supplierCost = buildTransportRouteCostSnapshot({
    routeId: route.routeId,
    supplierId,
    vehicleTypeId: route.vehicleTypeId,
    pricing,
  })
  return supplierCost?.costPriceGbp ?? route.costPriceGbp ?? 0
}
