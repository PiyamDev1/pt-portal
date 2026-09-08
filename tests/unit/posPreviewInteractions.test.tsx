// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import PosPreviewClient from '@/app/dashboard/pos/PosPreviewClient'
import type { PosLedgerPayload } from '@/lib/pos/contracts'

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
  },
}))

const LEDGER_HEIGHT_STORAGE_KEY = 'pt-portal:pos-preview:ledger-height'

describe('POS preview interactions', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    window.localStorage.clear()
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
})
