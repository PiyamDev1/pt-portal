import { describe, expect, it } from 'vitest'
import {
  DEVICE_LAYOUT_COOKIE,
  detectDeviceLayout,
  parseDeviceLayoutOverride,
  readDeviceLayoutOverride,
} from '@/lib/deviceLayout'

describe('operating-system device layout detection', () => {
  it.each([
    [
      'Android phone',
      'Mozilla/5.0 (Linux; Android 15; Pixel 9 Pro) AppleWebKit/537.36 Chrome/132 Mobile Safari/537.36',
      undefined,
    ],
    [
      'Android tablet',
      'Mozilla/5.0 (Linux; Android 14; SM-X910) AppleWebKit/537.36 Chrome/132 Safari/537.36',
      undefined,
    ],
    [
      'iPhone',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_3 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148',
      undefined,
    ],
    [
      'iPad',
      'Mozilla/5.0 (iPad; CPU OS 18_3 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148',
      undefined,
    ],
    [
      'iPadOS desktop-style user agent',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Version/18.3 Mobile/15E148 Safari/604.1',
      undefined,
    ],
    ['Android client hint', 'Mozilla/5.0 AppleWebKit/537.36 Chrome/132 Safari/537.36', '"Android"'],
    ['iOS client hint', 'Mozilla/5.0 AppleWebKit/605.1.15 Safari/604.1', '"iOS"'],
  ])('uses the mobile app layout for %s', (_name, userAgent, platformHint) => {
    expect(detectDeviceLayout({ userAgent, platformHint })).toBe('mobile')
  })

  it.each([
    [
      'Windows office computer',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/132 Safari/537.36',
      '"Windows"',
    ],
    [
      'macOS computer',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.3 Safari/605.1.15',
      '"macOS"',
    ],
    ['Linux computer', 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/132', '"Linux"'],
    ['unknown client', '', ''],
  ])('uses the desktop webpage layout for %s', (_name, userAgent, platformHint) => {
    expect(detectDeviceLayout({ userAgent, platformHint })).toBe('desktop')
  })

  it('accepts only explicit mobile and desktop overrides', () => {
    expect(parseDeviceLayoutOverride('mobile')).toBe('mobile')
    expect(parseDeviceLayoutOverride(' Desktop ')).toBe('desktop')
    expect(parseDeviceLayoutOverride('automatic')).toBeNull()
    expect(parseDeviceLayoutOverride('tablet')).toBeNull()
  })

  it('reads the persisted layout override without matching similarly named cookies', () => {
    expect(
      readDeviceLayoutOverride(`session=abc; ${DEVICE_LAYOUT_COOKIE}=mobile; theme=dark`),
    ).toBe('mobile')
    expect(readDeviceLayoutOverride(`old_${DEVICE_LAYOUT_COOKIE}=desktop`)).toBeNull()
    expect(readDeviceLayoutOverride(`${DEVICE_LAYOUT_COOKIE}=invalid`)).toBeNull()
    expect(readDeviceLayoutOverride(`${DEVICE_LAYOUT_COOKIE}=%E0%A4%A`)).toBeNull()
  })
})
