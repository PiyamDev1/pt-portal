import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadTicketLedger } from '@/app/dashboard/ticketing/ledger/ledgerClientApi'

describe('ticket ledger client pagination', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('requests 25 records and preserves the cursor', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        Response.json({ items: [], airlines: [], context: {}, nextCursor: 'next-page' }),
      )
    vi.stubGlobal('fetch', fetchMock)

    const result = await loadTicketLedger({ search: 'ABC123', cursor: 'current-page' })

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/ticketing/ledger?limit=25&search=ABC123&cursor=current-page',
      { cache: 'no-store' },
    )
    expect(result.nextCursor).toBe('next-page')
  })
})
