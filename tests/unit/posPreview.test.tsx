import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import PosPreviewClient from '@/app/dashboard/pos/PosPreviewClient'

describe('POS frontend preview', () => {
  it('shows operational categories, supplier sorting, and compact transaction editing', () => {
    render(<PosPreviewClient branchName="Bradford" />)

    expect(screen.getByRole('button', { name: /NADRA Application payment/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /NICOP · Normal NADRA service/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /NICOP · Urgent NADRA service/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /FRC NADRA certificate/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /PK Passport Application payment/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /GB Passport Application payment/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Visa Application payment/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Ticket & Package Tracked booking/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Remittance Fee · loyalty eligible/i })).toBeTruthy()

    expect((screen.getByLabelText('Sort ledger') as HTMLSelectElement).value).toBe('Supplier')

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    expect(screen.getByLabelText('Edit transaction name')).toBeTruthy()
    expect(screen.getByLabelText('Edit transaction amount')).toBeTruthy()
    expect(screen.getByLabelText('Edit transaction note')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Save edit' })).toBeTruthy()
  })

  it('previews supplier confirmation and extra-coin transfer states', () => {
    render(<PosPreviewClient branchName="Bradford" />)

    expect(screen.getByRole('heading', { name: 'Daily transactions' })).toBeTruthy()
    expect(screen.getByText('Bradford')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /Supplier payment Match a supplier/i }))
    expect(screen.getByText('Possible supplier match')).toBeTruthy()
    expect(screen.getAllByText('British Airways').length).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole('button', { name: 'Use this supplier' }))
    expect(screen.getByText('Supplier confirmed')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /Extra coins Drawer/i }))
    expect(screen.getByText('Internal transfer')).toBeTruthy()
    expect(screen.getByText('Extra-coin reserve')).toBeTruthy()
  })
})
