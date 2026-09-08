import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import PosPreviewClient from '@/app/dashboard/pos/PosPreviewClient'

describe('POS frontend preview', () => {
  it('shows operational categories, supplier sorting, and compact transaction editing', () => {
    render(<PosPreviewClient branchName="Bradford" />)

    const nadraMenu = screen.getByLabelText('NADRA Applications and certificates')
    expect(nadraMenu.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByLabelText('NICOP / CNIC')).toBeNull()

    fireEvent.click(nadraMenu)
    expect(nadraMenu.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByLabelText('NICOP / CNIC')).toBeTruthy()
    expect(screen.getByLabelText('POC')).toBeTruthy()
    expect(screen.getByLabelText('FRC')).toBeTruthy()
    expect(screen.getByLabelText('CRC')).toBeTruthy()
    expect(screen.getByLabelText('POA')).toBeTruthy()
    expect(screen.getByLabelText('Amount paid now')).toBeTruthy()
    expect(screen.getByText('Balance remaining £5.00')).toBeTruthy()

    fireEvent.click(screen.getByLabelText('NICOP / CNIC'))
    expect(nadraMenu.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByText('Pricing-table option matched from total price')).toBeTruthy()

    fireEvent.click(screen.getByLabelText('PK Passport Application payment'))
    expect(nadraMenu.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByLabelText('NICOP / CNIC')).toBeNull()
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

  it('switches between dated daily and separated monthly ledger views', () => {
    render(<PosPreviewClient branchName="Bradford" />)

    expect(screen.getByTitle('Reports')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Previous day' }))
    expect((screen.getByLabelText('Ledger date') as HTMLInputElement).value).toBe('2026-09-07')
    expect(screen.getByRole('heading', { name: 'Daily ledger' })).toBeTruthy()
    expect(screen.getAllByText('Ayesha Travel').length).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole('button', { name: 'Next day' }))
    expect(screen.getByRole('heading', { name: "Today's ledger" })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Previous day' }))

    fireEvent.click(screen.getByRole('button', { name: 'month' }))
    expect(screen.getByRole('heading', { name: 'Monthly ledger' })).toBeTruthy()
    expect(screen.getByLabelText('Ledger month')).toBeTruthy()
    expect(screen.getAllByText('Tuesday 8 September').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Monday 7 September').length).toBeGreaterThan(0)
    expect(screen.getByText('Active days')).toBeTruthy()
    expect(screen.getAllByText('Money in').length).toBeGreaterThan(0)
    expect(screen.getByText('Money out')).toBeTruthy()
    expect(screen.getByText('Net movement')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Previous month' }))
    expect((screen.getByLabelText('Ledger month') as HTMLInputElement).value).toBe('2026-08')

    fireEvent.click(screen.getByRole('button', { name: 'Today' }))
    expect(screen.getByRole('heading', { name: "Today's ledger" })).toBeTruthy()
    expect((screen.getByLabelText('Ledger date') as HTMLInputElement).value).toBe('2026-09-08')
  })

  it('offers keyboard shortcuts for search and quick entry', () => {
    render(<PosPreviewClient branchName="Bradford" />)

    fireEvent.keyDown(window, { key: '/' })
    expect(document.activeElement).toBe(screen.getByLabelText('Search transactions'))

    fireEvent.blur(screen.getByLabelText('Search transactions'))
    fireEvent.keyDown(window, { key: 'n' })
    expect(document.activeElement).toBe(screen.getByPlaceholderText('Walk-in or type a name'))
  })
})
