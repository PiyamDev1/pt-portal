import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { requireStaffSession, loadPosLedger } = vi.hoisted(() => ({
  requireStaffSession: vi.fn(),
  loadPosLedger: vi.fn(),
}))

vi.mock('@/lib/auth/staffSession', () => ({ requireStaffSession }))
vi.mock('@/lib/pos/ledgerServer', () => ({
  loadPosLedger,
  PosLedgerAccessError: class PosLedgerAccessError extends Error {},
}))

import { GET } from '@/app/api/pos/ledger/route'

describe('POS ledger route', () => {
  beforeEach(() => {
    requireStaffSession.mockReset()
    loadPosLedger.mockReset()
  })

  it('rejects invalid period filters before querying ledger data', async () => {
    requireStaffSession.mockResolvedValue({
      authorized: true,
      employee: { id: 'staff-1' },
      user: { id: 'staff-1' },
    })

    const response = await GET(
      new NextRequest('http://localhost/api/pos/ledger?period=year&date=2026-09-08'),
    )

    expect(response.status).toBe(400)
    expect(loadPosLedger).not.toHaveBeenCalled()
  })

  it('loads the authenticated employee branch period with private caching', async () => {
    requireStaffSession.mockResolvedValue({
      authorized: true,
      employee: { id: 'staff-1' },
      user: { id: 'staff-1' },
    })
    loadPosLedger.mockResolvedValue({ items: [], summary: {}, context: {} })

    const response = await GET(
      new NextRequest('http://localhost/api/pos/ledger?period=month&date=2026-09-08'),
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    expect(loadPosLedger).toHaveBeenCalledWith('staff-1', 'month', '2026-09-08')
  })
})
