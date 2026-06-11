import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildFrappeHandoffUrl,
  createFrappeHandoffToken,
  verifyFrappeHandoffTokenForTests,
} from '@/lib/integrations/frappe/handoff'

const identity = {
  employeeId: 'employee-123',
  email: 'staff@example.com',
  fullName: 'Staff Member',
  frappeEmployeeId: 'HR-EMP-0001',
  frappeUserId: 'staff@example.com',
}

describe('Frappe IMS handoff', () => {
  beforeEach(() => {
    vi.stubEnv('FRAPPE_BASE_URL', 'https://frio.piyamtravel.com')
    vi.stubEnv('FRAPPE_HANDOFF_SECRET', 'handoff-secret')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('creates a signed short-lived token for the Frappe bridge app', () => {
    const now = new Date('2026-06-11T12:00:00.000Z')
    const token = createFrappeHandoffToken(
      {
        ...identity,
        target: '/app/hr',
      },
      { now, ttlSeconds: 60 },
    )

    const payload = verifyFrappeHandoffTokenForTests(token, 'handoff-secret')
    expect(payload).toMatchObject({
      v: 1,
      iss: 'pt-portal',
      aud: 'frappe-hrms',
      sub: identity.employeeId,
      email: identity.email,
      full_name: identity.fullName,
      frappe_employee_id: identity.frappeEmployeeId,
      frappe_user_id: identity.frappeUserId,
      target: '/app/hr',
      iat: 1781179200,
      exp: 1781179260,
    })
    expect(payload.nonce).toEqual(expect.any(String))
  })

  it('sanitizes unsafe targets before signing', () => {
    const token = createFrappeHandoffToken({
      ...identity,
      target: 'https://evil.example.test',
    })

    const payload = verifyFrappeHandoffTokenForTests(token, 'handoff-secret')
    expect(payload.target).toBe('/app')
  })

  it('builds the bridge consume URL', () => {
    const url = new URL(buildFrappeHandoffUrl(identity))
    expect(url.origin).toBe('https://frio.piyamtravel.com')
    expect(url.pathname).toBe('/api/method/piyam_ims_bridge.api.handoff.consume')
    expect(url.searchParams.get('token')).toEqual(expect.any(String))
  })
})
