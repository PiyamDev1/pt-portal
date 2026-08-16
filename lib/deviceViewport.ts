import type { DeviceLayout } from './deviceLayout'

export const MOBILE_APP_VIEWPORT_WIDTH = 430
const MIN_MOBILE_APP_VIEWPORT_WIDTH = 320
const MAX_MOBILE_APP_VIEWPORT_WIDTH = 480

export type DeviceScreenDimensions = {
  width?: number | null
  height?: number | null
}

function validDimension(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

/**
 * Keep the Android/iOS presentation on a phone-sized layout canvas even when a
 * browser or installed PWA reports a wide desktop-style CSS viewport.
 */
export function getMobileAppViewportWidth({ width, height }: DeviceScreenDimensions = {}): number {
  const dimensions = [width, height].filter(validDimension)
  if (dimensions.length === 0) return MOBILE_APP_VIEWPORT_WIDTH

  return Math.round(
    Math.min(
      MAX_MOBILE_APP_VIEWPORT_WIDTH,
      Math.max(MIN_MOBILE_APP_VIEWPORT_WIDTH, Math.min(...dimensions)),
    ),
  )
}

export function getDeviceViewportContent(
  layout: DeviceLayout,
  dimensions?: DeviceScreenDimensions,
): string {
  const width =
    layout === 'mobile' ? getMobileAppViewportWidth(dimensions) : ('device-width' as const)

  return `width=${width}, initial-scale=1, viewport-fit=cover`
}

export function getMobileViewportCompensation(
  layoutViewportWidth: number,
  mobileViewportWidth: number,
): number {
  if (!validDimension(layoutViewportWidth) || !validDimension(mobileViewportWidth)) return 1

  const ratio = layoutViewportWidth / mobileViewportWidth
  return ratio >= 1.25 ? Math.min(ratio, 2.5) : 1
}

/**
 * Update the live viewport after hydration or a manual Settings override.
 * `zoom` is used only as a fallback when an Android desktop-site/PWA viewport
 * refuses to reflow after its viewport meta tag is corrected.
 */
export function applyDeviceViewport(layout: DeviceLayout): number {
  if (typeof document === 'undefined' || typeof window === 'undefined') return 1

  let viewportMeta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]')
  if (!viewportMeta) {
    viewportMeta = document.createElement('meta')
    viewportMeta.name = 'viewport'
    document.head.appendChild(viewportMeta)
  }

  const dimensions = {
    width: window.screen?.width,
    height: window.screen?.height,
  }
  const mobileViewportWidth = getMobileAppViewportWidth(dimensions)
  const content = getDeviceViewportContent(layout, dimensions)
  if (viewportMeta.content !== content) viewportMeta.content = content

  const root = document.documentElement
  const compensation =
    layout === 'mobile' ? getMobileViewportCompensation(window.innerWidth, mobileViewportWidth) : 1

  if (compensation > 1) {
    root.dataset.mobileViewportCompensation = 'true'
    root.style.setProperty('--mobile-viewport-scale', String(compensation))
  } else {
    delete root.dataset.mobileViewportCompensation
    root.style.removeProperty('--mobile-viewport-scale')
  }

  return compensation
}
