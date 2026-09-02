// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import AdminCommissionClient from '@/app/dashboard/admin-commission/AdminCommissionClient'
import { createDefaultCommissionProfile } from '@/lib/commissions/contracts'
import type { CommissionAdminData } from '@/lib/commissions/server'

const EMPLOYEE_ID = '11111111-1111-4111-8111-111111111111'
const PROFILE_ID = '22222222-2222-4222-8222-222222222222'
const PREVIOUS_PROFILE_ID = '22222222-2222-4222-8222-222222222223'
const LOCATION_ID = '33333333-3333-4333-8333-333333333333'

function adminData(): CommissionAdminData {
  const configuration = createDefaultCommissionProfile(EMPLOYEE_ID)
  configuration.label = 'Standard commission'
  configuration.locationId = LOCATION_ID

  return {
    schemaReady: true,
    schemaVersion: 2026083008,
    mode: 'shadow',
    packageIntegrationReady: true,
    applicationIntegrationReady: true,
    employees: [
      {
        id: EMPLOYEE_ID,
        fullName: 'Agent One',
        email: 'agent@example.com',
        role: 'Agent',
        location: { id: LOCATION_ID, name: 'Bradford', branchCode: 'BRD' },
        profileCount: 2,
        currentProfileId: PROFILE_ID,
        scheduledProfileId: null,
        openExceptionCount: 0,
      },
    ],
    profiles: [
      {
        id: PREVIOUS_PROFILE_ID,
        employeeId: EMPLOYEE_ID,
        label: 'Commission 2025',
        effectiveFrom: '2025-01-01',
        effectiveTo: '2026-01-31',
        locationId: LOCATION_ID,
        copiedFromProfileId: null,
        changeReason: 'Previous commission',
        createdAt: '2025-01-01T00:00:00Z',
        cancelledAt: null,
        cancellationReason: null,
        configuration: {
          ...configuration,
          label: 'Commission 2025',
          effectiveFrom: '2025-01-01',
        },
      },
      {
        id: PROFILE_ID,
        employeeId: EMPLOYEE_ID,
        label: 'Standard commission',
        effectiveFrom: '2026-08-01',
        effectiveTo: null,
        locationId: LOCATION_ID,
        copiedFromProfileId: null,
        changeReason: 'Initial commission',
        createdAt: '2026-08-01T00:00:00Z',
        cancelledAt: null,
        cancellationReason: null,
        configuration,
      },
    ],
    exchangeRates: [],
    sourceModules: [],
    exceptions: [],
    overview: {
      pendingEvents: 0,
      processedEvents: 0,
      heldEvents: 0,
      openExceptions: 0,
      activeShadowEntries: 0,
      shadowTotalGbp: 0,
      incompleteBonusPeriods: 0,
    },
    lastRun: null,
  }
}

describe('Admin Commission editor modes', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('keeps Edit commission and New commission as separate workflows', () => {
    render(<AdminCommissionClient initialData={adminData()} />)

    expect(screen.getByRole('button', { name: 'New commission' })).toBeTruthy()
    fireEvent.click(screen.getAllByRole('button', { name: 'Edit commission' })[0]!)

    expect(screen.getByRole('heading', { name: 'Edit commission for Agent One' })).toBeTruthy()
    expect(screen.queryByLabelText('Start the new commission from')).toBeNull()
    expect((screen.getByLabelText('Commission plan name') as HTMLInputElement).value).toBe(
      'Standard commission',
    )
    expect((screen.getByLabelText('Branch scope') as HTMLSelectElement).value).toBe(LOCATION_ID)
    expect(screen.getByRole('group', { name: 'NADRA applications - normal' })).toBeTruthy()
    expect(
      screen.getByRole('group', { name: 'NADRA applications - urgent / executive' }),
    ).toBeTruthy()
    expect(
      screen.getByRole('group', { name: 'Pakistani passport applications - normal' }),
    ).toBeTruthy()
    expect(screen.getByRole('group', { name: 'British passport applications' })).toBeTruthy()
    expect(screen.getByRole('group', { name: 'Visa applications' })).toBeTruthy()

    fireEvent.change(screen.getByLabelText(/Effective from/), {
      target: { value: '2026-09-01' },
    })
    expect(screen.queryByRole('alert')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Close commission plan editor' }))
    fireEvent.click(screen.getByRole('button', { name: 'New commission' }))

    expect(screen.getByRole('heading', { name: 'New commission for Agent One' })).toBeTruthy()
    expect(screen.getByLabelText('Start the new commission from')).toBeTruthy()
    expect((screen.getByLabelText('Commission plan name') as HTMLInputElement).value).toBe(
      'New commission',
    )
    expect((screen.getByLabelText('Branch scope') as HTMLSelectElement).value).toBe('')
  })

  it('disables plan changes until the Application commission migration is installed', () => {
    const data = adminData()
    data.applicationIntegrationReady = false

    render(<AdminCommissionClient initialData={data} />)

    expect(
      (screen.getByRole('button', { name: 'New commission' }) as HTMLButtonElement).disabled,
    ).toBe(true)
    expect(screen.getByText('Commission-plan database upgrade required')).toBeTruthy()
  })

  it('records an edit as a replacement rather than a copied commission', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => ({
      ok: true,
      json: async () => (init?.method === 'POST' ? {} : adminData()),
    }))
    vi.stubGlobal('fetch', fetchMock)
    render(<AdminCommissionClient initialData={adminData()} />)

    fireEvent.click(screen.getAllByRole('button', { name: 'Edit commission' })[0]!)
    fireEvent.change(screen.getByLabelText('Reason for this commission plan'), {
      target: { value: 'Updated individual ticket rate' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save edited commission' }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        `/api/commissions/admin/profiles/${PROFILE_ID}`,
        expect.objectContaining({ method: 'PUT' }),
      )
    })
    const profileRequest = fetchMock.mock.calls.find(
      ([url]) => url === `/api/commissions/admin/profiles/${PROFILE_ID}`,
    )
    const body = JSON.parse(String(profileRequest?.[1]?.body)) as { copiedFromProfileId?: string }

    expect(body.copiedFromProfileId).toBeNull()
  })

  it('edits a previous policy without allowing its timeline boundaries to move', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => adminData(),
    }))
    vi.stubGlobal('fetch', fetchMock)
    render(<AdminCommissionClient initialData={adminData()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Edit previous policy' }))

    expect(screen.getByRole('heading', { name: 'Edit previous policy for Agent One' })).toBeTruthy()
    expect((screen.getByLabelText(/Effective from/) as HTMLInputElement).value).toBe('2025-01-01')
    expect((screen.getByLabelText(/Effective from/) as HTMLInputElement).disabled).toBe(true)
    expect((screen.getByLabelText('Branch scope') as HTMLSelectElement).disabled).toBe(true)
    expect(screen.queryByRole('alert')).toBeNull()

    fireEvent.change(screen.getByLabelText('Reason for this commission plan'), {
      target: { value: 'Correct historical application recipient' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save previous policy correction' }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        `/api/commissions/admin/profiles/${PREVIOUS_PROFILE_ID}`,
        expect.objectContaining({ method: 'PUT' }),
      )
    })
  })

  it('edits mixed currencies, refund treatment, and multiple recurring profit targets', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => ({
      ok: true,
      json: async () => (init?.method === 'PUT' ? {} : adminData()),
    }))
    vi.stubGlobal('fetch', fetchMock)
    render(<AdminCommissionClient initialData={adminData()} />)

    fireEvent.click(screen.getAllByRole('button', { name: 'Edit commission' })[0]!)
    fireEvent.change(screen.getByLabelText('Employee default commission currency'), {
      target: { value: 'usd' },
    })
    fireEvent.change(screen.getByLabelText('Salary currency override'), {
      target: { value: 'pkr' },
    })

    const ticketRates = screen.getByRole('group', { name: 'Ticket sales' })
    fireEvent.change(within(ticketRates).getByLabelText('Method'), {
      target: { value: 'per_unit' },
    })
    fireEvent.change(screen.getByLabelText('Ticket sales payout currency override'), {
      target: { value: 'eur' },
    })
    fireEvent.click(screen.getByLabelText('Reverse original commission'))
    fireEvent.click(screen.getByLabelText(/Company profit target from this employee/))
    fireEvent.click(screen.getByRole('button', { name: 'Add profit target' }))
    fireEvent.click(screen.getByRole('checkbox', { name: /Repeat a bonus/ }))
    fireEvent.change(screen.getByLabelText('Reason for this commission plan'), {
      target: { value: 'Mixed currency and bonus schedule update' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save edited commission' }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        `/api/commissions/admin/profiles/${PROFILE_ID}`,
        expect.objectContaining({ method: 'PUT' }),
      )
    })
    const request = fetchMock.mock.calls.find(
      ([url]) => url === `/api/commissions/admin/profiles/${PROFILE_ID}`,
    )
    const body = JSON.parse(String(request?.[1]?.body))
    expect(body.compensation).toMatchObject({ currency: 'USD', salaryCurrency: 'PKR' })
    expect(body.services.tkPrimary.currency).toBe('EUR')
    expect(body.ticketRefundCommission.treatment).toBe('reverse_original')
    expect(body.monthlyBonus.steps).toHaveLength(2)
    expect(body.monthlyBonus.recurring.enabled).toBe(true)
  })
})
