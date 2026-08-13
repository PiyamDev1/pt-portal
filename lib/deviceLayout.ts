export type DeviceLayout = 'desktop' | 'mobile'

export type DeviceDetectionInput = {
  userAgent?: string | null
  platformHint?: string | null
}

const MOBILE_PLATFORM_PATTERN = /^(android|ios|ipados)$/i
const MOBILE_USER_AGENT_PATTERN = /android|iphone|ipad|ipod/i
const IPADOS_DESKTOP_UA_PATTERN = /macintosh.*mobile/i

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
