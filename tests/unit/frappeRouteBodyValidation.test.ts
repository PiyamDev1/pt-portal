import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  class ProvisioningSetupError extends Error {
    statusCode = 424
  }

  return {
    ProvisioningSetupError,
    getUser: vi.fn(),
    requireAdminSession: vi.fn(),
    requireMaintenanceSession: vi.fn(),
    transferEmployeeToFrappe: vi.fn(),
    dispatchOutboxBatch: vi.fn(),
  }
})

vi.mock('@supabase/auth-helpers-nextjs', () => ({
  createServerClient: () => ({ auth: { getUser: mocks.getUser } }),
}))
vi.mock('next/headers', () => ({
  cookies: async () => ({ getAll: () => [] }),
}))
vi.mock('@/lib/adminSessionAuth', () => ({
  requireAdminSession: mocks.requireAdminSession,
  requireMaintenanceSession: mocks.requireMaintenanceSession,
}))
vi.mock('@/lib/integrations/frappe/provisioning', () => ({
  FRAPPE_DEFAULT_COMPANY: 'Piyam Travel',
  FrappeProvisioningSetupError: mocks.ProvisioningSetupError,
  getFrappeEmployeeProvisioningReadiness: vi.fn(),
  getFrappeProvisioningCandidate: vi.fn(),
  getFrappeProvisioningReferenceOptions: vi.fn(),
  transferEmployeeToFrappe: mocks.transferEmployeeToFrappe,
}))
vi.mock('@/lib/integrations/frappe/syncEngine', () => ({
  dispatchOutboxBatch: mocks.dispatchOutboxBatch,
}))

import { POST as selfServiceTransfer } from '@/app/api/integrations/frappe/provisioning/me/route'
import { POST as adminTransfer } from '@/app/api/integrations/frappe/provisioning/transfer/route'
import { POST as pushOutbox } from '@/app/api/integrations/frappe/sync/push/route'

describe('Frappe integration request bodies', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'employee-1' } }, error: null })
    mocks.requireAdminSession.mockResolvedValue({ authorized: true })
    mocks.requireMaintenanceSession.mockResolvedValue({ authorized: true })
    mocks.transferEmployeeToFrappe.mockResolvedValue({ linked: true })
    mocks.dispatchOutboxBatch.mockResolvedValue({ processed: 0, failed: 0 })
  })

  it.each([
    ['self-service transfer', selfServiceTransfer],
    ['admin transfer', adminTransfer],
  ])(
    'rejects malformed and empty JSON for %s before starting a transfer',
    async (_label, handler) => {
      for (const body of ['{', '']) {
        const response = await handler(
          new Request('http://localhost/api/integrations/frappe/transfer', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: body || undefined,
          }),
        )

        expect(response.status).toBe(400)
        expect(await response.json()).toEqual({ error: 'Invalid JSON request body' })
      }

      expect(mocks.transferEmployeeToFrappe).not.toHaveBeenCalled()
    },
  )

  it('overrides self-service transfer identity and disables admin-only account creation', async () => {
    const response = await selfServiceTransfer(
      new Request('http://localhost/api/integrations/frappe/provisioning/me', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          employee_id: 'another-employee',
          create_user: true,
          send_welcome_email: true,
        }),
      }),
    )

    expect(response.status).toBe(200)
    expect(mocks.transferEmployeeToFrappe).toHaveBeenCalledWith(
      expect.objectContaining({
        employee_id: 'employee-1',
        create_user: false,
        send_welcome_email: false,
      }),
    )
  })

  it('preserves empty-body outbox dispatch defaults and caps its batch size', async () => {
    const emptyResponse = await pushOutbox(
      new Request('http://localhost/api/integrations/frappe/sync/push', { method: 'POST' }),
    )
    expect(emptyResponse.status).toBe(200)
    expect(mocks.dispatchOutboxBatch).toHaveBeenLastCalledWith(25)

    const cappedResponse = await pushOutbox(
      new Request('http://localhost/api/integrations/frappe/sync/push', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ limit: 500 }),
      }),
    )
    expect(cappedResponse.status).toBe(200)
    expect(mocks.dispatchOutboxBatch).toHaveBeenLastCalledWith(250)
  })

  it('rejects malformed outbox JSON without dispatching', async () => {
    const response = await pushOutbox(
      new Request('http://localhost/api/integrations/frappe/sync/push', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{',
      }),
    )

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Invalid JSON request body' })
    expect(mocks.dispatchOutboxBatch).not.toHaveBeenCalled()
  })
})
