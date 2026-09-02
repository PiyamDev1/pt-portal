// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TicketAttributionDialog } from '@/app/dashboard/ticketing/ledger/TicketAttributionDialog'
import { TicketLedgerList } from '@/app/dashboard/ticketing/ledger/TicketLedgerList'
import { TicketQuickEntryForm } from '@/app/dashboard/ticketing/ledger/TicketQuickEntryForm'
import type {
  TicketAttributionEmployee,
  TicketLedgerItem,
} from '@/app/dashboard/ticketing/ledger/types'

const toastMocks = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
vi.mock('sonner', () => ({ toast: toastMocks }))

const ACTOR_ID = '10000000-0000-4000-8000-000000000001'
const RESPONSIBLE_ID = '10000000-0000-4000-8000-000000000002'
const ASSISTANT_ID = '10000000-0000-4000-8000-000000000003'

const EMPLOYEES: TicketAttributionEmployee[] = [
  { id: ACTOR_ID, fullName: 'Admin User' },
  { id: RESPONSIBLE_ID, fullName: 'Agent One' },
  { id: ASSISTANT_ID, fullName: 'Assistant Manager' },
]

const AIRLINES = [{ id: 'airline-tk', iataCode: 'TK', name: 'Turkish Airlines' }]

const ITEM: TicketLedgerItem = {
  bookingId: '80000000-0000-4000-8000-000000000001',
  transactionId: '82000000-0000-4000-8000-000000000001',
  bookingVersion: 5,
  transactionVersion: 2,
  pnr: 'ABC123',
  customerName: 'Aisha Khan',
  airline: AIRLINES[0],
  serviceType: 'TK',
  operationalStatus: 'issued',
  paymentStatus: 'unpaid',
  bookingDate: '2026-08-23',
  timeLimitAt: null,
  issuedAt: '2026-08-24',
  passengerCount: 2,
  packageMatchStatus: 'unmatched',
  commissionScope: 'ticket',
  commercialTreatment: 'standard',
  commissionWaiverReason: null,
  staffFamilyChangeFeeGbp: 5,
  staffFamilyRefundFeeGbp: 10,
  detailsStatus: 'needs_details',
  fares: [{ passengerType: 'ADT', quantity: 2, unitSupplierCost: 450, unitSalePrice: null }],
  responsibleEmployee: EMPLOYEES[0],
  assistantEmployees: [],
  attributionVersion: 1,
}

function fillQuickTicket() {
  fireEvent.change(screen.getByLabelText('Customer / lead passenger'), {
    target: { value: 'Aisha Khan' },
  })
  fireEvent.change(screen.getByLabelText('PNR'), { target: { value: 'abc123' } })
  fireEvent.change(screen.getByLabelText('Airline'), { target: { value: 'TK' } })
  fireEvent.change(screen.getByLabelText('ADT unit fare cost'), { target: { value: '450' } })
  fireEvent.change(screen.getByLabelText('ADT unit sale price'), { target: { value: '550' } })
}

describe('Ticketing attribution UI', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    toastMocks.success.mockReset()
    toastMocks.error.mockReset()
  })

  it('locks the responsible agent but allows non-admin staff to record assistance', () => {
    render(
      <TicketQuickEntryForm
        airlines={AIRLINES}
        timezone="Europe/London"
        employeeId={ACTOR_ID}
        currentTimeMs={Date.parse('2026-08-27T12:00:00Z')}
        employeeName="Admin User"
        canManageAttribution={false}
        attributionEmployees={[]}
        onCreated={vi.fn()}
      />,
    )

    expect((screen.getByLabelText('Responsible agent') as HTMLSelectElement).disabled).toBe(true)
    expect((screen.getByLabelText('Add assistant') as HTMLSelectElement).disabled).toBe(false)
    expect(screen.queryByLabelText('Attribution reason')).toBeNull()
  })

  it('requires a reason for admin overrides, sends primary and assistants, then resets to Me', async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({ bookingId: ITEM.bookingId }, { status: 201 }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const onCreated = vi.fn(async () => undefined)
    render(
      <TicketQuickEntryForm
        airlines={AIRLINES}
        timezone="Europe/London"
        employeeId={ACTOR_ID}
        employeeName="Admin User"
        canManageAttribution
        attributionEmployees={EMPLOYEES}
        onCreated={onCreated}
      />,
    )

    expect((screen.getByLabelText('Responsible agent') as HTMLSelectElement).value).toBe(ACTOR_ID)
    expect(screen.getByRole('option', { name: 'Me — Admin User' })).toBeTruthy()

    fillQuickTicket()
    fireEvent.change(screen.getByLabelText('Responsible agent'), {
      target: { value: RESPONSIBLE_ID },
    })
    fireEvent.change(screen.getByLabelText('Add assistant'), {
      target: { value: ASSISTANT_ID },
    })
    expect(screen.getByLabelText('Selected assistants').textContent).toContain('Assistant Manager')

    fireEvent.click(screen.getByRole('button', { name: 'Save TK' }))
    expect(
      screen.getByText('Explain why this ticket is being entered for other staff.'),
    ).toBeTruthy()
    expect(fetchMock).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText('Attribution reason'), {
      target: { value: 'Entered while Agent One was off sick' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save TK' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body))
    expect(body).toMatchObject({
      responsibleEmployeeId: RESPONSIBLE_ID,
      assistantEmployeeIds: [ASSISTANT_ID],
      attributionReason: 'Entered while Agent One was off sick',
    })
    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1))
    expect(toastMocks.success).toHaveBeenCalledWith('TK ticket saved to the sales ledger')
    await waitFor(() =>
      expect((screen.getByLabelText('Responsible agent') as HTMLSelectElement).value).toBe(
        ACTOR_ID,
      ),
    )
    expect(screen.queryByLabelText('Attribution reason')).toBeNull()
    expect(screen.queryByLabelText('Selected assistants')).toBeNull()
  })

  it('shows operational attribution and offers correction only on admin TK rows', () => {
    const onCorrectAttribution = vi.fn()
    const onComplete = vi.fn()
    const { rerender } = render(
      <TicketLedgerList
        items={[{ ...ITEM, assistantEmployees: [EMPLOYEES[2]] }]}
        timezone="Europe/London"
        employeeId={ACTOR_ID}
        onComplete={onComplete}
        onMarkPaid={vi.fn()}
        onEditItinerary={vi.fn()}
        canManageAttribution
        onCorrectAttribution={onCorrectAttribution}
      />,
    )

    expect(screen.getByText('Responsible: Admin User')).toBeTruthy()
    expect(screen.getByText('Assisted by: Assistant Manager')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Correct staff attribution for ABC123' }))
    expect(onCorrectAttribution).toHaveBeenCalledWith(expect.objectContaining({ pnr: 'ABC123' }))
    expect(screen.queryByText(/commission|profit|margin|earnings/i)).toBeNull()

    rerender(
      <TicketLedgerList
        items={[{ ...ITEM, responsibleEmployee: EMPLOYEES[1] }]}
        timezone="Europe/London"
        employeeId={ACTOR_ID}
        onComplete={onComplete}
        onMarkPaid={vi.fn()}
        onEditItinerary={vi.fn()}
        canManageAttribution
        onCorrectAttribution={onCorrectAttribution}
      />,
    )
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Complete details for ABC123 on behalf of Agent One',
      }),
    )
    expect(onComplete).toHaveBeenCalledWith(
      expect.objectContaining({ pnr: 'ABC123', responsibleEmployee: EMPLOYEES[1] }),
    )
    expect(
      screen.getByRole('button', { name: 'Correct staff attribution for ABC123' }),
    ).toBeTruthy()

    rerender(
      <TicketLedgerList
        items={[{ ...ITEM, responsibleEmployee: EMPLOYEES[1] }]}
        timezone="Europe/London"
        employeeId={ACTOR_ID}
        onComplete={onComplete}
        onMarkPaid={vi.fn()}
        onEditItinerary={vi.fn()}
        canManageAttribution={false}
        onCorrectAttribution={onCorrectAttribution}
      />,
    )
    expect(screen.getByText('Details handled by Agent One')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /on behalf of Agent One/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /Correct staff attribution/ })).toBeNull()

    rerender(
      <TicketLedgerList
        items={[
          {
            ...ITEM,
            serviceType: 'DC',
            detailsStatus: 'recorded',
            assistantEmployees: [EMPLOYEES[2]],
          },
        ]}
        timezone="Europe/London"
        employeeId={ACTOR_ID}
        onComplete={onComplete}
        onMarkPaid={vi.fn()}
        onEditItinerary={vi.fn()}
        canManageAttribution
        onCorrectAttribution={onCorrectAttribution}
      />,
    )
    expect(screen.queryByRole('button', { name: /Correct staff attribution/ })).toBeNull()
    expect(screen.queryByText('Assisted by: Assistant Manager')).toBeNull()
    expect(screen.getByText('Booking owner: Admin User')).toBeTruthy()
  })

  it('submits an audited attribution correction with optimistic version and idempotency', async () => {
    const fetchMock = vi.fn(async () => Response.json({ attributionVersion: 2 }))
    vi.stubGlobal('fetch', fetchMock)
    const onSaved = vi.fn(async () => undefined)
    const onClose = vi.fn()
    render(
      <TicketAttributionDialog
        item={ITEM}
        employees={EMPLOYEES}
        onClose={onClose}
        onSaved={onSaved}
      />,
    )

    fireEvent.change(screen.getByLabelText('Correct responsible agent'), {
      target: { value: RESPONSIBLE_ID },
    })
    fireEvent.change(screen.getByLabelText('Add correction assistant'), {
      target: { value: ASSISTANT_ID },
    })
    fireEvent.change(screen.getByLabelText('Attribution correction reason'), {
      target: { value: 'Correcting entry made during staff illness' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save correction' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const [url, request] = fetchMock.mock.calls[0]
    expect(url).toBe(`/api/ticketing/ledger/${ITEM.bookingId}/attribution`)
    expect(request?.method).toBe('PATCH')
    expect(request?.headers).toMatchObject({
      'Content-Type': 'application/json',
      'Idempotency-Key': expect.any(String),
    })
    expect(JSON.parse(String(request?.body))).toEqual({
      expectedBookingVersion: 5,
      responsibleEmployeeId: RESPONSIBLE_ID,
      assistantEmployeeIds: [ASSISTANT_ID],
      commercialTreatment: 'standard',
      commissionWaiverReason: null,
      reason: 'Correcting entry made during staff illness',
    })
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(toastMocks.success).toHaveBeenCalledWith(
      'Staff and commission treatment corrected for ABC123',
    )
  })

  it('allows an administrator to correct only the commission treatment', async () => {
    const fetchMock = vi.fn(async () => Response.json({ attributionVersion: 1 }))
    vi.stubGlobal('fetch', fetchMock)
    render(
      <TicketAttributionDialog
        item={ITEM}
        employees={EMPLOYEES}
        onClose={vi.fn()}
        onSaved={vi.fn(async () => undefined)}
      />,
    )

    fireEvent.change(screen.getByLabelText('Correct commission treatment'), {
      target: { value: 'commission_waived' },
    })
    fireEvent.change(screen.getByLabelText('Correct commission waiver reason'), {
      target: { value: 'Approved exceptional waiver' },
    })
    fireEvent.change(screen.getByLabelText('Attribution correction reason'), {
      target: { value: 'Correcting commercial classification' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save correction' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toMatchObject({
      responsibleEmployeeId: ACTOR_ID,
      assistantEmployeeIds: [],
      commercialTreatment: 'commission_waived',
      commissionWaiverReason: 'Approved exceptional waiver',
    })
  })

  it('refreshes and closes a stale attribution correction after a version conflict', async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({ error: 'Ticket changed', code: 'VERSION_CONFLICT' }, { status: 409 }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const onSaved = vi.fn(async () => undefined)
    const onClose = vi.fn()
    render(
      <TicketAttributionDialog
        item={ITEM}
        employees={EMPLOYEES}
        onClose={onClose}
        onSaved={onSaved}
      />,
    )

    fireEvent.change(screen.getByLabelText('Correct responsible agent'), {
      target: { value: RESPONSIBLE_ID },
    })
    fireEvent.change(screen.getByLabelText('Attribution correction reason'), {
      target: { value: 'Correct stale owner' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save correction' }))

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(toastMocks.error).toHaveBeenCalledWith(
      'This ticket changed. Reopen it from the refreshed ledger and review again.',
    )
  })
})
