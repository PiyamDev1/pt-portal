import { describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  getSupabaseClient: vi.fn(),
}))

vi.mock('@/lib/supabaseClient', () => ({
  getSupabaseClient: mocks.getSupabaseClient,
}))

import { GET } from '@/app/api/bookings/attendance/respond/route'

describe('GET /api/bookings/attendance/respond', () => {
  it('claims a reminder response once so repeat missed links cannot add another penalty', async () => {
    let responseStatus = 'unknown'
    let penaltyInsertCount = 0

    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'booking_reminder_events') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({
                  data: {
                    id: 'event-1',
                    booking_id: 'booking-1',
                    location_id: 'location-1',
                    response_status: responseStatus,
                  },
                  error: null,
                })),
              })),
            })),
            update: vi.fn((payload: { response_status?: string }) => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  select: vi.fn(() => ({
                    maybeSingle: vi.fn(async () => {
                      if (responseStatus !== 'unknown') return { data: null, error: null }
                      responseStatus = payload.response_status || responseStatus
                      return { data: { id: 'event-1' }, error: null }
                    }),
                  })),
                })),
              })),
            })),
          }
        }

        if (table === 'bookings') {
          return {
            update: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })),
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({
                  data: {
                    id: 'booking-1',
                    location_id: 'location-1',
                    customer_phone: '+44 7123456789',
                    customer_email: null,
                  },
                })),
              })),
            })),
          }
        }

        if (table === 'booking_reminder_settings') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({ maybeSingle: vi.fn(async () => ({ data: null })) })),
            })),
          }
        }

        if (table === 'booking_contact_flags') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({ maybeSingle: vi.fn(async () => ({ data: null })) })),
              })),
            })),
            insert: vi.fn(async () => {
              penaltyInsertCount += 1
              return { error: null }
            }),
          }
        }

        throw new Error(`Unexpected table ${table}`)
      }),
    }
    mocks.getSupabaseClient.mockReturnValue(supabase)

    const url = 'http://localhost/api/bookings/attendance/respond?token=secret&status=missed'
    const first = await GET(new NextRequest(url))
    const second = await GET(new NextRequest(url))

    expect(first.status).toBe(200)
    expect(second.status).toBe(200)
    expect(await second.text()).toContain('Response Already Recorded')
    expect(responseStatus).toBe('missed')
    expect(penaltyInsertCount).toBe(1)
  })
})
