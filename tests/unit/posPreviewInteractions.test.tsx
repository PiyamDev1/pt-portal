// @vitest-environment jsdom

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import PosPreviewClient from '@/app/dashboard/pos/PosPreviewClient'
import { posTourStorageKey } from '@/app/dashboard/pos/PosGuidedTour'
import type { PosBootstrapPayload, PosLedgerPayload } from '@/lib/pos/contracts'

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
  },
}))

const LEDGER_HEIGHT_STORAGE_KEY = 'pt-portal:pos-preview:ledger-height'

const EMPTY_LEDGER: PosLedgerPayload = {
  items: [],
  summary: {
    moneyIn: 0,
    moneyOut: 0,
    netMovement: 0,
    cashNet: 0,
    cardNet: 0,
    bankNet: 0,
    unreconciledCount: 0,
  },
  context: {
    branchId: 'branch-1',
    branchName: 'Test branch',
    timezone: 'Europe/London',
    period: 'day',
    date: '2026-09-10',
    loadedAt: '2026-09-10T12:00:00.000Z',
    source: 'pos_transactions',
    truncated: false,
  },
}

const SOFT_PRICING_BOOTSTRAP: PosBootstrapPayload = {
  schemaReady: true,
  capabilityVersion: 2026090904,
  branch: { id: 'branch-1', name: 'Test branch', timezone: 'Europe/London' },
  catalogue: [
    {
      id: 'service-1',
      key: 'document-assistance',
      groupKey: 'document-assistance',
      label: 'Document Assistance',
      optionLabel: null,
      classification: 'SERVICE',
      defaultDirection: 'IN',
      allowedDirections: ['IN'],
      trackedSourceType: null,
      sourceRequired: false,
      customerRequired: false,
      loyaltyEligible: false,
      pointsPerGbp: 0,
      allowedPaymentMethods: ['CASH', 'CARD', 'BANK'],
      noteRequired: false,
      priceRequired: true,
      shortcut: null,
      pricingOptions: [],
      categoryKey: 'document-assistance',
      logoKey: null,
      logoUrl: null,
    },
  ],
  categories: [
    {
      id: 'category-1',
      key: 'document-assistance',
      label: 'Document Assistance',
      description: 'Document help',
      iconKey: 'files',
      displayOrder: 1,
      supplierPaymentsEnabled: false,
      services: [],
      shortcuts: [],
      supplierIds: [],
      defaultSupplierId: null,
    },
  ],
  tills: [{ id: 'till-1', code: 'T1', name: 'Main till', currency: 'GBP' }],
  activeShift: {
    id: '11111111-1111-4111-8111-111111111111',
    tillId: 'till-1',
    tillName: 'Main till',
    businessDate: '2026-09-10',
    status: 'OPEN',
    openingFloat: 100,
    openedBy: 'Test Agent',
    openedAt: '2026-09-10T09:00:00.000Z',
  },
  balances: { openingFloat: 100, drawer: 100, reserve: 0 },
  suppliers: [],
  supplierSources: [],
  employees: [],
  closeouts: [],
  permissions: {
    canPost: true,
    canManage: false,
    canApprove: false,
    canImport: false,
    canViewCrossBranch: false,
  },
  loadedAt: '2026-09-10T12:00:00.000Z',
}

describe('POS preview interactions', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    window.localStorage.clear()
    window.localStorage.setItem(posTourStorageKey('preview'), 'true')
    Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', {
      configurable: true,
      value: vi.fn(),
    })
  })

  it('resizes and persists the ledger, then resets it on double-click', () => {
    render(<PosPreviewClient branchName="Test branch" />)

    const handle = screen.getByRole('separator', { name: 'Resize ledger' })
    expect(handle.getAttribute('aria-valuenow')).toBe('240')

    fireEvent.pointerDown(handle, { button: 0, clientY: 300, pointerId: 1 })
    fireEvent.pointerMove(handle, { clientY: 420, pointerId: 1 })
    fireEvent.pointerUp(handle, { clientY: 420, pointerId: 1 })

    expect(handle.getAttribute('aria-valuenow')).toBe('360')
    expect(window.localStorage.getItem(LEDGER_HEIGHT_STORAGE_KEY)).toBe('360')

    fireEvent.doubleClick(handle)

    expect(handle.getAttribute('aria-valuenow')).toBe('240')
    expect(window.localStorage.getItem(LEDGER_HEIGHT_STORAGE_KEY)).toBe('240')
  })

  it('only exposes scan capture after arming and disarms after one scan', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          id: 'member-1',
          customerCode: 'PYM-2345-6789-A',
          maskedCode: 'PYM-2345••••-A',
          name: 'Aisha Khan',
          maskedEmail: 'ai•••@example.com',
          availablePoints: 640,
        }),
      }),
    )
    render(<PosPreviewClient branchName="Test branch" />)

    expect(screen.queryByPlaceholderText('Scan now or type loyalty code')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Scan loyalty card/ }))

    const scanInput = screen.getByPlaceholderText('Scan now or type loyalty code')
    await waitFor(() => expect(document.activeElement).toBe(scanInput))
    fireEvent.change(scanInput, { target: { value: 'PYM-2345-6789-A' } })
    fireEvent.keyDown(scanInput, { key: 'Enter' })

    await waitFor(() => expect(screen.getByText(/640 points/)).toBeTruthy())
    expect(screen.queryByPlaceholderText('Scan now or type loyalty code')).toBeNull()
  })

  it('shows an empty live ledger without falling back to design transactions', () => {
    const liveLedger: PosLedgerPayload = {
      items: [],
      summary: {
        moneyIn: 0,
        moneyOut: 0,
        netMovement: 0,
        cashNet: 0,
        cardNet: 0,
        bankNet: 0,
        unreconciledCount: 0,
      },
      context: {
        branchId: 'branch-1',
        branchName: 'Test branch',
        timezone: 'Europe/London',
        period: 'day',
        date: '2026-09-08',
        loadedAt: '2026-09-08T12:00:00.000Z',
        source: 'daily_ledger_entries',
        truncated: false,
      },
    }

    render(<PosPreviewClient branchName="Test branch" initialLedger={liveLedger} />)

    expect(screen.getByText('Live ledger')).toBeTruthy()
    expect(screen.getByText('No matching transactions')).toBeTruthy()
    expect(screen.queryByText('POS-0908-014')).toBeNull()
  })

  it('refreshes the live ledger every two minutes', async () => {
    const liveLedger: PosLedgerPayload = {
      items: [],
      summary: {
        moneyIn: 0,
        moneyOut: 0,
        netMovement: 0,
        cashNet: 0,
        cardNet: 0,
        bankNet: 0,
        unreconciledCount: 0,
      },
      context: {
        branchId: 'branch-1',
        branchName: 'Test branch',
        timezone: 'Europe/London',
        period: 'day',
        date: '2026-09-08',
        loadedAt: '2026-09-08T12:00:00.000Z',
        source: 'pos_transactions',
        truncated: false,
      },
    }
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(liveLedger),
    })
    vi.stubGlobal('fetch', fetchMock)
    let automaticSync: (() => void) | undefined
    vi.spyOn(window, 'setInterval').mockImplementation((handler, timeout) => {
      if (timeout === 120_000) automaticSync = handler as () => void
      return 1
    })

    render(<PosPreviewClient branchName="Test branch" initialLedger={liveLedger} />)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    expect(automaticSync).toBeTypeOf('function')

    await act(async () => {
      automaticSync?.()
    })

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
  })

  it('posts an entered amount when the advisory pricing matcher has no suggestion', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url === '/api/pos/transactions' && init?.method === 'POST') {
        return {
          ok: true,
          json: vi.fn().mockResolvedValue({
            transactionId: 'transaction-1',
            reference: 'POS-001',
            idempotentReplay: false,
          }),
        }
      }
      if (url === '/api/pos/bootstrap') {
        return { ok: true, json: vi.fn().mockResolvedValue(SOFT_PRICING_BOOTSTRAP) }
      }
      return { ok: true, json: vi.fn().mockResolvedValue(EMPTY_LEDGER) }
    })
    vi.stubGlobal('fetch', fetchMock)

    render(
      <PosPreviewClient
        branchName="Test branch"
        initialLedger={EMPTY_LEDGER}
        initialBootstrap={SOFT_PRICING_BOOTSTRAP}
      />,
    )

    expect(screen.getByText(/price matcher is advisory/i)).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Amount paid now'), { target: { value: '25.00' } })
    fireEvent.click(screen.getByRole('button', { name: 'Post transaction' }))

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/pos/transactions',
        expect.objectContaining({ method: 'POST' }),
      ),
    )
    const transactionCall = fetchMock.mock.calls.find(
      ([url, init]) => String(url) === '/api/pos/transactions' && init?.method === 'POST',
    )
    const payload = JSON.parse(String(transactionCall?.[1]?.body)) as Record<string, unknown>
    expect(payload.pricingConfirmed).toBe(true)
    expect(payload).not.toHaveProperty('pricingId')
  })
})
