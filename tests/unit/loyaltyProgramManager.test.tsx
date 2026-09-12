// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import MemberServiceModal from '@/app/dashboard/bookings/MemberServiceModal'
import { LoyaltyProgramManager } from '@/app/dashboard/loyalty/LoyaltyProgramManager'
import type { LoyaltyDashboardPayload } from '@/lib/loyalty/contracts'
import { LOYALTY_PROGRAM_POLICY } from '@/lib/loyalty/program'

const locationId = '20000000-0000-4000-8000-000000000001'
const campaignOptions: LoyaltyDashboardPayload['campaignOptions'] = {
  services: [],
  branches: [{ id: locationId, name: 'Luton' }],
  walkInWindows: [
    {
      id: '30000000-0000-4000-8000-000000000001',
      locationId,
      serviceType: 'nadra',
      isoWeekday: 1,
      startsAt: '09:00',
      endsAt: '17:00',
      isActive: true,
    },
  ],
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('loyalty programme settings', () => {
  it('separates permanent rules into concise setting categories', () => {
    render(
      <LoyaltyProgramManager
        program={structuredClone(LOYALTY_PROGRAM_POLICY)}
        campaignOptions={campaignOptions}
      />,
    )

    expect(screen.getByRole('navigation', { name: 'Loyalty setting categories' })).toBeTruthy()
    expect(screen.getByText('Standard earning values')).toBeTruthy()
    expect(screen.queryByText('Ranks and benefits')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /Member Service/ }))
    expect(screen.getByText('Published Member Service hours')).toBeTruthy()
    expect(screen.queryByText('Verify and record a walk-in')).toBeNull()
    expect(screen.getByText(/record member walk-ins from Bookings/i)).toBeTruthy()
  })
})

describe('booking Member Service', () => {
  it('requires only a loyalty-card scan and explicit confirmation', async () => {
    const lookup = {
      member: {
        customerCode: 'PYM-7K4M-9Q2D-H',
        maskedCode: 'PYM-7K4M••••-H',
        name: 'Amina Customer',
      },
      branch: { id: locationId, name: 'Luton' },
      rank: { key: 'ruby', name: 'Ruby', colour: '#9F1239' },
      allowance: 2,
      used: 0,
      remaining: 2,
      canUse: true,
      unavailableReason: null,
      serviceType: 'nadra',
      programmeYear: 2026,
    }
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({ ok: true, json: async () => lookup } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ...lookup, used: 1, remaining: 1, idempotentReplay: false }),
      } as Response)

    render(
      <MemberServiceModal isOpen locationId={locationId} locationName="Luton" onClose={vi.fn()} />,
    )

    const cardInput = screen.getByLabelText('Scan loyalty card')
    fireEvent.change(cardInput, { target: { value: 'PYM-7K4M-9Q2D-H' } })
    fireEvent.submit(cardInput.closest('form')!)

    await waitFor(() => expect(screen.getByText('Amina Customer')).toBeTruthy())
    expect(screen.getAllByText('2')).toHaveLength(2)
    expect(screen.queryByRole('combobox')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm walk-in use' }))

    await waitFor(() => expect(screen.getByText('Walk-in confirmed')).toBeTruthy())
    expect(screen.getByText(/1 remain for 2026/)).toBeTruthy()
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const confirmation = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))
    expect(confirmation).toMatchObject({
      customerCode: 'PYM-7K4M-9Q2D-H',
      locationId,
    })
    expect(confirmation).not.toHaveProperty('serviceType')
    expect(confirmation).not.toHaveProperty('isOverride')
  })
})
