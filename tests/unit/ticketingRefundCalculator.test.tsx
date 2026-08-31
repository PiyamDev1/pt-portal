// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TicketCancellationCalculator } from '@/app/dashboard/ticketing/refund-calculator/TicketCancellationCalculator'
import {
  calculateTicketCancellation,
  calculateTicketReplacementAdjustment,
  parseGbpToPence,
} from '@/lib/ticketing/refundCalculator'

describe('ticket cancellation calculation', () => {
  it('preserves company costs and returns the desired markup', () => {
    const result = calculateTicketCancellation({
      ticketSalePricePence: 80000,
      supplierTicketCostPence: 65000,
      airlineCancellationFeePence: 15000,
      supplierCancellationChargePence: 1000,
      retainedAgentCommissionPence: 500,
      desiredCompanyMarkupPence: 2000,
    })

    expect(result.minimumCancellationChargePence).toBe(16500)
    expect(result.totalCancellationChargePence).toBe(18500)
    expect(result.customerRefundPence).toBe(61500)
    expect(result.expectedAirlineRecoveryPence).toBe(50000)
    expect(result.expectedCompanyResultPence).toBe(2000)
    expect(result.requiresManagerReview).toBe(false)
  })

  it('never returns a negative customer refund and reports the shortfall', () => {
    const result = calculateTicketCancellation({
      ticketSalePricePence: 10000,
      supplierTicketCostPence: 8000,
      airlineCancellationFeePence: 9000,
      supplierCancellationChargePence: 2000,
      retainedAgentCommissionPence: 500,
      desiredCompanyMarkupPence: 1000,
    })

    expect(result.totalCancellationChargePence).toBe(12500)
    expect(result.customerRefundPence).toBe(0)
    expect(result.customerRefundShortfallPence).toBe(2500)
    expect(result.requiresManagerReview).toBe(true)
  })

  it('parses GBP without floating-point amounts', () => {
    expect(parseGbpToPence('150')).toBe(15000)
    expect(parseGbpToPence('10.5')).toBe(1050)
    expect(parseGbpToPence('.05')).toBe(5)
    expect(parseGbpToPence('10.005')).toBeNull()
    expect(parseGbpToPence('-1')).toBeNull()
  })

  it('calculates the safe replacement price and additional customer payment', () => {
    const result = calculateTicketReplacementAdjustment({
      cancellationCreditPence: 61500,
      replacementSupplierCostPence: 70000,
      replacementRecordedSalePricePence: 75000,
      replacementAgentCommissionPence: 500,
      desiredReplacementMarkupPence: 2000,
    })

    expect(result.minimumSafeReplacementSalePence).toBe(72500)
    expect(result.minimumNetZeroReplacementSalePence).toBe(70500)
    expect(result.minimumAdditionalCustomerPaymentPence).toBe(11000)
    expect(result.recordedCancellationCreditAppliedPence).toBe(61500)
    expect(result.recordedAdditionalCustomerPaymentPence).toBe(13500)
    expect(result.recordedReplacementResultPence).toBe(4500)
    expect(result.companyLossAtRecordedSalePence).toBe(0)
    expect(result.desiredCompanyResultShortfallPence).toBe(0)
    expect(result.requiresManagerReview).toBe(false)
  })

  it('flags a replacement sale that would make the company absorb a loss', () => {
    const result = calculateTicketReplacementAdjustment({
      cancellationCreditPence: 61500,
      replacementSupplierCostPence: 70000,
      replacementRecordedSalePricePence: 68000,
      replacementAgentCommissionPence: 500,
      desiredReplacementMarkupPence: 2000,
    })

    expect(result.minimumSafeReplacementSalePence).toBe(72500)
    expect(result.companyLossAtRecordedSalePence).toBe(2500)
    expect(result.desiredCompanyResultShortfallPence).toBe(4500)
    expect(result.requiresManagerReview).toBe(true)
  })

  it('keeps unused cancellation value as customer credit instead of company income', () => {
    const result = calculateTicketReplacementAdjustment({
      cancellationCreditPence: 80000,
      replacementSupplierCostPence: 60000,
      replacementRecordedSalePricePence: 65000,
      replacementAgentCommissionPence: 500,
      desiredReplacementMarkupPence: 2000,
    })

    expect(result.recordedCancellationCreditAppliedPence).toBe(65000)
    expect(result.recordedCustomerCreditRemainingPence).toBe(15000)
    expect(result.recordedAdditionalCustomerPaymentPence).toBe(0)
  })
})

describe('TicketCancellationCalculator', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('calculates the clarified cancellation preview without saving data', () => {
    render(<TicketCancellationCalculator />)

    fireEvent.change(screen.getByLabelText('Original ticket sale price'), {
      target: { value: '800.00' },
    })
    fireEvent.change(screen.getByLabelText('Original supplier ticket cost'), {
      target: { value: '650.00' },
    })
    fireEvent.change(screen.getByLabelText('Airline cancellation fee'), {
      target: { value: '150.00' },
    })
    fireEvent.change(screen.getByLabelText('Supplier cancellation charge'), {
      target: { value: '10.00' },
    })
    fireEvent.change(screen.getByLabelText('Retained agent commission'), {
      target: { value: '5.00' },
    })
    fireEvent.change(screen.getByLabelText('Desired company markup'), {
      target: { value: '20.00' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Calculate refund' }))

    expect(screen.getByText('£165.00')).toBeTruthy()
    expect(screen.getByText('£185.00')).toBeTruthy()
    expect(screen.getByText('£615.00')).toBeTruthy()
    expect(screen.getByText('£500.00')).toBeTruthy()
    expect(screen.getByText('£20.00')).toBeTruthy()
    expect(screen.getByText(/Actual profit or loss remains pending/)).toBeTruthy()
  })

  it('requires review when charges exceed the sale price', () => {
    render(<TicketCancellationCalculator />)

    fireEvent.change(screen.getByLabelText('Original ticket sale price'), {
      target: { value: '100.00' },
    })
    fireEvent.change(screen.getByLabelText('Original supplier ticket cost'), {
      target: { value: '80.00' },
    })
    fireEvent.change(screen.getByLabelText('Airline cancellation fee'), {
      target: { value: '90.00' },
    })
    fireEvent.change(screen.getByLabelText('Supplier cancellation charge'), {
      target: { value: '20.00' },
    })
    fireEvent.change(screen.getByLabelText('Retained agent commission'), {
      target: { value: '5.00' },
    })
    fireEvent.change(screen.getByLabelText('Desired company markup'), {
      target: { value: '10.00' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Calculate refund' }))

    expect(screen.getByRole('alert').textContent).toContain('Manager/Admin review required')
    expect(screen.getByRole('alert').textContent).toContain('£25.00')
    expect(screen.getByText('£0.00')).toBeTruthy()
  })

  it('advises the minimum replacement charge so the company does not fund the new ticket', () => {
    render(<TicketCancellationCalculator />)

    fireEvent.change(screen.getByLabelText('Original ticket sale price'), {
      target: { value: '800.00' },
    })
    fireEvent.change(screen.getByLabelText('Original supplier ticket cost'), {
      target: { value: '650.00' },
    })
    fireEvent.change(screen.getByLabelText('Airline cancellation fee'), {
      target: { value: '150.00' },
    })
    fireEvent.change(screen.getByLabelText('Supplier cancellation charge'), {
      target: { value: '10.00' },
    })
    fireEvent.change(screen.getByLabelText('Retained agent commission'), {
      target: { value: '5.00' },
    })
    fireEvent.change(screen.getByLabelText('Desired company markup'), {
      target: { value: '20.00' },
    })
    fireEvent.click(screen.getByLabelText('Use toward another ticket'))
    expect(screen.getByText(/Do not treat unconfirmed airline recovery/)).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Replacement supplier cost'), {
      target: { value: '700.00' },
    })
    fireEvent.change(screen.getByLabelText('Replacement sale price'), {
      target: { value: '680.00' },
    })
    fireEvent.change(screen.getByLabelText('Replacement agent commission'), {
      target: { value: '5.00' },
    })
    fireEvent.change(screen.getByLabelText('Replacement company markup'), {
      target: { value: '20.00' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Calculate refund' }))

    expect(screen.getByRole('alert').textContent).toContain(
      'Do not proceed at the recorded sale price',
    )
    expect(screen.getByRole('alert').textContent).toContain('£45.00 below')
    expect(screen.getByText('Minimum safe replacement price').nextSibling?.textContent).toBe(
      '£725.00',
    )
    expect(screen.getByText('Minimum extra customer payment').nextSibling?.textContent).toBe(
      '£110.00',
    )
  })

  it('can prefill replacement costs from a different existing booking', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          items: [
            {
              bookingId: 'replacement-booking',
              transactionId: 'replacement-transaction',
              pnr: 'XYZ789',
              customerName: 'Replacement Passenger',
              airline: { id: 'airline-pk', iataCode: 'PK', name: 'Pakistan International' },
              serviceType: 'TK',
              operationalStatus: 'held',
              fares: [
                {
                  passengerType: 'YTH',
                  quantity: 1,
                  unitSupplierCost: '500.00',
                  unitSalePrice: '575.00',
                },
              ],
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          detail: {
            passengers: [
              {
                passengerType: 'YTH',
                position: 1,
                fullName: 'Replacement Passenger',
                ticketNumber: null,
              },
            ],
          },
        }),
      )
    vi.stubGlobal('fetch', fetchMock)
    render(<TicketCancellationCalculator />)

    fireEvent.click(screen.getByLabelText('Use toward another ticket'))
    fireEvent.click(screen.getByLabelText('Select an existing booking'))
    fireEvent.change(screen.getByLabelText('Exact replacement PNR'), {
      target: { value: 'xy z789' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Find booking' }))

    await waitFor(() =>
      expect(screen.getByLabelText('Replacement supplier cost').getAttribute('value')).toBe(
        '500.00',
      ),
    )
    expect(screen.getByLabelText('Replacement sale price').getAttribute('value')).toBe('575.00')
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/ticketing/ledger?limit=100&search=XYZ789',
      expect.objectContaining({ cache: 'no-store' }),
    )
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/ticketing/ledger/replacement-booking',
      expect.objectContaining({ cache: 'no-store' }),
    )
  })

  it('finds an exact issued TK and prefills its single passenger fare', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          items: [
            {
              transactionId: 'transaction-dc',
              pnr: 'ABC123',
              customerName: 'Aisha Khan',
              airline: { iataCode: 'TK', name: 'Turkish Airlines' },
              serviceType: 'DC',
              operationalStatus: 'issued',
              fares: [
                {
                  passengerType: 'ADT',
                  quantity: 1,
                  unitSupplierCost: '20.00',
                  unitSalePrice: '30.00',
                },
              ],
            },
            {
              bookingId: 'booking-tk',
              transactionId: 'transaction-tk',
              pnr: 'ABC123',
              customerName: 'Aisha Khan',
              airline: { iataCode: 'TK', name: 'Turkish Airlines' },
              serviceType: 'TK',
              operationalStatus: 'issued',
              fares: [
                {
                  passengerType: 'ADT',
                  quantity: 1,
                  unitSupplierCost: '650.00',
                  unitSalePrice: '800.00',
                },
              ],
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          detail: {
            passengers: [
              {
                passengerType: 'ADT',
                position: 1,
                fullName: 'Aisha Khan',
                ticketNumber: '2351234567890',
              },
            ],
          },
        }),
      )
    vi.stubGlobal('fetch', fetchMock)
    render(<TicketCancellationCalculator />)

    fireEvent.change(screen.getByLabelText('Exact PNR for cancellation'), {
      target: { value: 'ab c123' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Find ticket' }))

    expect(await screen.findByText(/Prefilled ADT #1/)).toBeTruthy()
    expect(screen.getByLabelText('Original ticket sale price').getAttribute('value')).toBe('800.00')
    expect(screen.getByLabelText('Original supplier ticket cost').getAttribute('value')).toBe(
      '650.00',
    )
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/ticketing/ledger?limit=100&search=ABC123',
      expect.objectContaining({ cache: 'no-store' }),
    )
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/ticketing/ledger/booking-tk',
      expect.objectContaining({ cache: 'no-store' }),
    )
  })

  it('requires passenger-fare selection when the ticket has multiple fare groups', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          Response.json({
            items: [
              {
                bookingId: 'booking-tk',
                transactionId: 'transaction-tk',
                pnr: 'ABC123',
                customerName: 'Family Khan',
                airline: { iataCode: 'PK', name: 'Pakistan International Airlines' },
                serviceType: 'TK',
                operationalStatus: 'issued',
                fares: [
                  {
                    passengerType: 'ADT',
                    quantity: 2,
                    unitSupplierCost: '500.00',
                    unitSalePrice: '600.00',
                  },
                  {
                    passengerType: 'CHD',
                    quantity: 1,
                    unitSupplierCost: '300.00',
                    unitSalePrice: '400.00',
                  },
                ],
              },
            ],
          }),
        )
        .mockResolvedValueOnce(
          Response.json({
            detail: {
              passengers: [
                {
                  passengerType: 'ADT',
                  position: 1,
                  fullName: 'Adult One',
                  ticketNumber: '1234567890001',
                },
                {
                  passengerType: 'ADT',
                  position: 2,
                  fullName: 'Adult Two',
                  ticketNumber: '1234567890002',
                },
                {
                  passengerType: 'CHD',
                  position: 1,
                  fullName: 'Child One',
                  ticketNumber: '1234567890003',
                },
              ],
            },
          }),
        ),
    )
    render(<TicketCancellationCalculator />)

    fireEvent.change(screen.getByLabelText('Exact PNR for cancellation'), {
      target: { value: 'ABC123' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Find ticket' }))

    const fareSelect = await screen.findByLabelText('Passenger fare to cancel')
    expect(screen.getByLabelText('Original ticket sale price').getAttribute('value')).toBe('')
    fireEvent.change(fareSelect, { target: { value: 'transaction-tk:CHD' } })

    await waitFor(() =>
      expect(screen.getByLabelText('Original ticket sale price').getAttribute('value')).toBe(
        '400.00',
      ),
    )
    expect(screen.getByLabelText('Original supplier ticket cost').getAttribute('value')).toBe(
      '300.00',
    )
    expect(await screen.findByText(/Prefilled CHD #1/)).toBeTruthy()
  })

  it('locks a staff/family refund to airline fee plus the £25 admin fee', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          Response.json({
            items: [
              {
                bookingId: 'booking-family',
                transactionId: 'transaction-family',
                pnr: 'FAMILY1',
                customerName: 'Family Passenger',
                airline: { iataCode: 'PK', name: 'Pakistan International Airlines' },
                serviceType: 'TK',
                operationalStatus: 'issued',
                commercialTreatment: 'staff_family',
                staffFamilyRefundFeeGbp: 25,
                fares: [
                  {
                    passengerType: 'ADT',
                    quantity: 1,
                    unitSupplierCost: '100.00',
                    unitSalePrice: '100.00',
                  },
                ],
              },
            ],
          }),
        )
        .mockResolvedValueOnce(
          Response.json({
            detail: {
              passengers: [
                {
                  passengerType: 'ADT',
                  position: 1,
                  fullName: 'Family Passenger',
                  ticketNumber: '1234567890001',
                },
              ],
            },
          }),
        ),
    )
    render(<TicketCancellationCalculator />)

    fireEvent.change(screen.getByLabelText('Exact PNR for cancellation'), {
      target: { value: 'FAMILY1' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Find ticket' }))

    expect(
      await screen.findByText(/supplier charge and retained commission are £0.00/i),
    ).toBeTruthy()
    const supplierCharge = screen.getByLabelText('Supplier cancellation charge') as HTMLInputElement
    const retainedCommission = screen.getByLabelText(
      'Retained agent commission',
    ) as HTMLInputElement
    const adminFee = screen.getByLabelText('Desired company markup') as HTMLInputElement
    expect(supplierCharge.value).toBe('0.00')
    expect(supplierCharge.disabled).toBe(true)
    expect(retainedCommission.value).toBe('0.00')
    expect(retainedCommission.disabled).toBe(true)
    expect(adminFee.value).toBe('25.00')
    expect(adminFee.disabled).toBe(true)
    expect((screen.getByLabelText('Airline cancellation fee') as HTMLInputElement).disabled).toBe(
      false,
    )
  })
})
