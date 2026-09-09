import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import PosPreviewClient from '@/app/dashboard/pos/PosPreviewClient'

describe('POS frontend preview', () => {
  beforeEach(() => {
    window.localStorage.clear()
    window.localStorage.setItem('pt-portal:pos:tutorial-dismissed:v1', 'true')
  })

  it('shows operational categories, supplier sorting, and immutable transaction actions', () => {
    render(<PosPreviewClient branchName="Bradford" />)

    const nadraMenu = screen.getByLabelText('Applications Identity, passport and visa applications')
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
    expect(screen.getByRole('heading', { name: 'NICOP / CNIC' })).toBeTruthy()

    expect(screen.getByLabelText('PK Passport')).toBeTruthy()
    expect(screen.getByLabelText('GB Passport')).toBeTruthy()
    expect(screen.getByLabelText('Visa')).toBeTruthy()

    fireEvent.click(screen.getByLabelText('Remittance Choose an approved provider'))
    const ria = screen.getByLabelText('Ria')
    const moneyGram = screen.getByLabelText('MoneyGram')
    expect(ria).toBeTruthy()
    expect(moneyGram).toBeTruthy()
    expect(ria.className).not.toBe(moneyGram.className)
    expect(screen.queryByText('Full amount earns points')).toBeNull()
    expect(screen.queryByLabelText('Extra coins Drawer ↔ reserve')).toBeNull()

    expect((screen.getByLabelText('Sort ledger') as HTMLSelectElement).value).toBe('Supplier')

    expect(screen.getByRole('button', { name: 'Refund' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Receipt' })).toBeTruthy()
    expect(screen.getByText('Tenders')).toBeTruthy()
    expect(screen.queryByLabelText('Edit transaction amount')).toBeNull()
  })

  it('keeps supplier payments separate and extra coins inside cash management', () => {
    render(<PosPreviewClient branchName="Bradford" />)

    expect(screen.getByRole('heading', { name: 'Daily transactions' })).toBeTruthy()
    expect(screen.getByText('Bradford')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Pay supplier' }))
    expect(screen.getByText('Possible supplier match')).toBeTruthy()
    expect(screen.getAllByText('British Airways').length).toBeGreaterThan(0)
    expect(screen.getByLabelText('Supplier category')).toBeTruthy()
    expect(
      screen.getByLabelText('Applications Identity, passport and visa applications'),
    ).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Use this supplier' }))
    expect(screen.getByText('Supplier confirmed')).toBeTruthy()

    fireEvent.click(screen.getByTitle('Cash management'))
    expect(screen.getByText('POS database upgrade pending')).toBeTruthy()
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
    expect(screen.getAllByText('Net movement').length).toBeGreaterThan(0)

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

  it('keeps a right-hand category in its grid column while opening a compact service list', () => {
    render(<PosPreviewClient branchName="Bradford" />)

    const ticketing = screen.getByLabelText('Ticketing & Packages Tickets and travel packages')
    fireEvent.click(ticketing)

    expect(ticketing.className).not.toContain('col-span-2')
    expect(document.getElementById('ticketing-packages-subcategories')?.className).toContain(
      'col-span-2',
    )
    expect(screen.getByLabelText('Ticketing').className).toContain('py-1.5')
  })

  it('shows the first-access tutorial until the user ticks the hide option', async () => {
    window.localStorage.removeItem('pt-portal:pos:tutorial-dismissed:v1')
    render(<PosPreviewClient branchName="Bradford" />)

    expect(await screen.findByRole('dialog')).toBeTruthy()
    expect(screen.getByText('Choose what the transaction is for')).toBeTruthy()
    fireEvent.click(
      screen.getByRole('checkbox', { name: 'Do not show this tutorial automatically again' }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Close POS tutorial' }))

    expect(window.localStorage.getItem('pt-portal:pos:tutorial-dismissed:v1')).toBe('true')
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
