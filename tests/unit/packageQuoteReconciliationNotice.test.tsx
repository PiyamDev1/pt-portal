import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import PackageQuoteReconciliationNotice from '@/app/dashboard/packages/[id]/PackageQuoteReconciliationNotice'

describe('Package quote reconciliation notice', () => {
  it('shows a reconciliation failure and delegates retry', () => {
    const onReconcile = vi.fn()

    render(
      <PackageQuoteReconciliationNotice
        quoteSync={{ status: 'failed', message: 'Please retry after checking the package.' }}
        syncing={false}
        onReconcile={onReconcile}
      />,
    )

    expect(screen.getByText('Quotation reconciliation failed')).toBeTruthy()
    expect(screen.getByText('Please retry after checking the package.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Reconcile again' }))
    expect(onReconcile).toHaveBeenCalledOnce()
  })

  it('shows preserved-conflict guidance and disables retry while syncing', () => {
    render(
      <PackageQuoteReconciliationNotice
        quoteSync={{
          status: 'review_required',
          conflicts: [{ message: 'Existing supplier booking was preserved.' }],
        }}
        syncing
        onReconcile={() => {}}
      />,
    )

    expect(screen.getByText('Quotation changes need an agent review')).toBeTruthy()
    expect(screen.getByText(/Existing supplier booking was preserved/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Reconcile again' }).hasAttribute('disabled')).toBe(
      true,
    )
  })

  it('renders nothing when reconciliation is already synced', () => {
    const { container } = render(
      <PackageQuoteReconciliationNotice
        quoteSync={{ status: 'synced' }}
        syncing={false}
        onReconcile={() => {}}
      />,
    )

    expect(container.firstChild).toBeNull()
  })
})
