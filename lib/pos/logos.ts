export const POS_PROVIDER_LOGO_KEYS = [
  'ria',
  'moneygram',
  'western-union',
  'dex',
  'intercity',
] as const

export const POS_SUPPLIER_LOGO_KEYS = [...POS_PROVIDER_LOGO_KEYS, 'polani-travel'] as const

const PROVIDER_LOGOS = new Set<string>(POS_PROVIDER_LOGO_KEYS)
const SUPPLIER_LOGOS = new Set<string>(POS_SUPPLIER_LOGO_KEYS)
const CUSTOM_LOGO_KEY =
  /^custom-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

export function isCustomPosLogoKey(value: unknown): value is string {
  return typeof value === 'string' && CUSTOM_LOGO_KEY.test(value)
}

export function posLogoUrl(logoKey: string | null | undefined, kind: 'service' | 'supplier') {
  if (!logoKey) return null
  if (isCustomPosLogoKey(logoKey)) return `/api/pos/logos/${encodeURIComponent(logoKey)}`
  if (kind === 'service' && PROVIDER_LOGOS.has(logoKey)) return `/pos/providers/${logoKey}.svg`
  if (kind === 'supplier' && PROVIDER_LOGOS.has(logoKey)) return `/pos/providers/${logoKey}.svg`
  if (kind === 'supplier' && SUPPLIER_LOGOS.has(logoKey)) return `/pos/suppliers/${logoKey}.svg`
  return null
}
