import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import PosPreviewClient from '@/app/dashboard/pos/PosPreviewClient'

describe('POS frontend preview', () => {
  it('shows operational categories, supplier sorting, and compact transaction editing', () => {
    render(<PosPreviewClient branchName="Bradford" />)

    const nadraMenu = screen.getByLabelText('NADRA NICOP and certificates')
    expect(nadraMenu.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByLabelText('NICOP · Normal')).toBeTruthy()
    expect(screen.getByLabelText('NICOP · Urgent')).toBeTruthy()
    expect(screen.getByLabelText('FRC')).toBeTruthy()

    fireEvent.click(nadraMenu)
    expect(nadraMenu.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByLabelText('NICOP · Normal')).toBeNull()

    fireEvent.click(nadraMenu)
    expect(screen.getByLabelText('NICOP · Normal')).toBeTruthy()
    expect(screen.getByLabelText('PK Passport Application payment')).toBeTruthy()
    expect(screen.getByLabelText('GB Passport Application payment')).toBeTruthy()
    expect(screen.getByLabelText('Visa Application payment')).toBeTruthy()
    expect(screen.getByLabelText('Ticket & Package Tracked booking')).toBeTruthy()
    expect(screen.getByLabelText('Remittance Fee · loyalty eligible')).toBeTruthy()

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

    fireEvent.click(screen.getByLabelText('Supplier payment Match a supplier'))
    expect(screen.getByText('Possible supplier match')).toBeTruthy()
    expect(screen.getAllByText('British Airways').length).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole('button', { name: 'Use this supplier' }))
    expect(screen.getByText('Supplier confirmed')).toBeTruthy()

    fireEvent.click(screen.getByLabelText('Extra coins Drawer ↔ reserve'))
    expect(screen.getByText('Internal transfer')).toBeTruthy()
    expect(screen.getByText('Extra-coin reserve')).toBeTruthy()
  })
})
