import { describe, expect, it } from 'vitest'
import { getReportableApiPath } from '@/app/components/ApiLatencyReporter'

const ORIGIN = 'https://portal.example.com'

describe('getReportableApiPath', () => {
  it('removes query strings and fragments from relative API URLs', () => {
    expect(
      getReportableApiPath('/api/bookings?q=customer%40example.com&token=secret#details', ORIGIN),
    ).toBe('/api/bookings')
  })

  it('returns only the pathname for same-origin absolute URLs and URL objects', () => {
    expect(
      getReportableApiPath(
        'https://portal.example.com/api/packages/share/token?code=secret',
        ORIGIN,
      ),
    ).toBe('/api/packages/share/token')
    expect(
      getReportableApiPath(
        new URL('https://portal.example.com/api/documents/preview?key=private'),
        ORIGIN,
      ),
    ).toBe('/api/documents/preview')
  })

  it('normalizes Request objects without retaining sensitive search parameters', () => {
    const request = new Request(
      'https://portal.example.com/api/bookings?customerPhone=%2B447000000000',
    )

    expect(getReportableApiPath(request, ORIGIN)).toBe('/api/bookings')
  })

  it('does not report cross-origin or non-API requests', () => {
    expect(
      getReportableApiPath('https://attacker.example/api/collect?secret=value', ORIGIN),
    ).toBeNull()
    expect(getReportableApiPath('/dashboard?token=secret', ORIGIN)).toBeNull()
  })
})
