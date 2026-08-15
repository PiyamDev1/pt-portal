export type DeviceLayout = 'desktop' | 'mobile'

export const DEVICE_LAYOUT_COOKIE = 'pt_portal_device_layout'

export type DeviceDetectionInput = {
  userAgent?: string | null
  platformHint?: string | null
}

const MOBILE_PLATFORM_PATTERN = /^(android|ios|ipados)$/i
const MOBILE_USER_AGENT_PATTERN = /android|iphone|ipad|ipod/i
const IPADOS_DESKTOP_UA_PATTERN = /macintosh.*mobile/i

export function parseDeviceLayoutOverride(value?: string | null): DeviceLayout | null {
  const normalizedValue = String(value || '')
    .trim()
    .toLowerCase()
  return normalizedValue === 'desktop' || normalizedValue === 'mobile' ? normalizedValue : null
}

export function readDeviceLayoutOverride(cookieHeader?: string | null): DeviceLayout | null {
  const cookie = String(cookieHeader || '')
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${DEVICE_LAYOUT_COOKIE}=`))

  if (!cookie) return null
  try {
    return parseDeviceLayoutOverride(decodeURIComponent(cookie.slice(cookie.indexOf('=') + 1)))
  } catch {
    return null
  }
}

/**
 * Select the portal presentation from the operating system, not screen pixels.
 * Android and iOS/iPadOS use the app shell; Windows, macOS, Linux, ChromeOS,
 * and unknown desktop clients use the webpage shell.
 */
export function detectDeviceLayout({
  userAgent = '',
  platformHint = '',
}: DeviceDetectionInput): DeviceLayout {
  const normalizedPlatform = String(platformHint || '').replace(/^"|"$/g, '')
  const normalizedUserAgent = String(userAgent || '')

  if (
    MOBILE_PLATFORM_PATTERN.test(normalizedPlatform) ||
    MOBILE_USER_AGENT_PATTERN.test(normalizedUserAgent) ||
    IPADOS_DESKTOP_UA_PATTERN.test(normalizedUserAgent)
  ) {
    return 'mobile'
  }

  return 'desktop'
}
