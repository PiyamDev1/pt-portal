import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const backupLimit = vi.fn(async (_limit: number) => ({ data: [], error: null }))
  const backupOrder = vi.fn(() => ({ limit: backupLimit }))
  const backupNeq = vi.fn(() => ({ order: backupOrder }))
  const backupIn = vi.fn(() => ({ neq: backupNeq }))
  const backupSelect = vi.fn(() => ({ in: backupIn }))
  const backupFrom = vi.fn(() => ({ select: backupSelect }))

  return {
    requireSuperAdminSession: vi.fn(),
    getServiceSupabaseClient: vi.fn(),
    getPackageBackupStorageConfig: vi.fn(),
    getPackageBackupStorageClient: vi.fn(),
    listLegacyBookingCustomers: vi.fn(),
    testLegacyBookingsConnections: vi.fn(),
    importLegacyBookingCustomer: vi.fn(),
    backupLimit,
    backupOrder,
    backupNeq,
    backupIn,
    backupSelect,
    backupFrom,
  }
})

vi.mock('@/lib/adminSessionAuth', () => ({
  requireSuperAdminSession: mocks.requireSuperAdminSession,
}))
vi.mock('@/lib/api/serviceSupabase', () => ({
  getServiceSupabaseClient: mocks.getServiceSupabaseClient,
}))
vi.mock('@/lib/packageIntegrations', () => ({
  getPackageBackupStorageConfig: mocks.getPackageBackupStorageConfig,
  getPackageBackupStorageClient: mocks.getPackageBackupStorageClient,
}))
vi.mock('@/lib/legacyBookingsMigration', () => ({
  listLegacyBookingCustomers: mocks.listLegacyBookingCustomers,
  testLegacyBookingsConnections: mocks.testLegacyBookingsConnections,
  importLegacyBookingCustomer: mocks.importLegacyBookingCustomer,
}))

import { POST as reconcilePackageBackups } from '@/app/api/travel-packages/backups/reconcile/route'
import { POST as importLegacyPackages } from '@/app/api/travel-packages/migration/import/route'
import { POST as scanLegacyPackages } from '@/app/api/travel-packages/migration/scan/route'

function postRequest(url: string, body?: string) {
  return new Request(url, {
    method: 'POST',
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body,
  })
}

describe('travel-package maintenance JSON boundaries', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireSuperAdminSession.mockResolvedValue({
      authorized: true,
      user: { id: 'admin-1' },
    })
    mocks.getPackageBackupStorageConfig.mockReturnValue({ bucketName: 'archive' })
    mocks.getServiceSupabaseClient.mockReturnValue({ from: mocks.backupFrom })
    mocks.listLegacyBookingCustomers.mockResolvedValue({ customers: [], nextPageToken: null })
  })

  it('rejects malformed backup reconciliation JSON and retains the empty-body batch default', async () => {
    const invalidResponse = await reconcilePackageBackups(
      postRequest('http://localhost/api/travel-packages/backups/reconcile', '{') as never,
    )
    expect(invalidResponse.status).toBe(400)
    expect(await invalidResponse.json()).toEqual({ error: 'Invalid JSON body' })
    expect(mocks.getServiceSupabaseClient).not.toHaveBeenCalled()

    const emptyResponse = await reconcilePackageBackups(
      postRequest('http://localhost/api/travel-packages/backups/reconcile') as never,
    )
    expect(emptyResponse.status).toBe(200)
    expect(mocks.backupLimit).toHaveBeenLastCalledWith(25)
  })

  it.each(['{', undefined])(
    'rejects invalid migration-import body %s before external work',
    async (body) => {
      const response = await importLegacyPackages(
        postRequest('http://localhost/api/travel-packages/migration/import', body) as never,
      )

      expect(response.status).toBe(400)
      expect(await response.json()).toEqual({ error: 'Invalid JSON body' })
      expect(mocks.getServiceSupabaseClient).not.toHaveBeenCalled()
      expect(mocks.listLegacyBookingCustomers).not.toHaveBeenCalled()
    },
  )

  it('preserves scan defaults and bounds the legacy customer page size', async () => {
    const emptyResponse = await scanLegacyPackages(
      postRequest('http://localhost/api/travel-packages/migration/scan') as never,
    )
    expect(emptyResponse.status).toBe(200)
    expect(mocks.listLegacyBookingCustomers).toHaveBeenLastCalledWith({ pageSize: 50 })

    const cappedResponse = await scanLegacyPackages(
      postRequest(
        'http://localhost/api/travel-packages/migration/scan',
        JSON.stringify({ limit: 500 }),
      ) as never,
    )
    expect(cappedResponse.status).toBe(200)
    expect(mocks.listLegacyBookingCustomers).toHaveBeenLastCalledWith({ pageSize: 100 })
  })

  it('rejects malformed scan JSON before calling the legacy system', async () => {
    const response = await scanLegacyPackages(
      postRequest('http://localhost/api/travel-packages/migration/scan', '{') as never,
    )

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Invalid JSON body' })
    expect(mocks.listLegacyBookingCustomers).not.toHaveBeenCalled()
    expect(mocks.testLegacyBookingsConnections).not.toHaveBeenCalled()
  })
})
