import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import PosQuickTransactionSummary from '@/app/dashboard/pos/PosQuickTransactionSummary'

describe('PosQuickTransactionSummary', () => {
  it('shows the parent-computed impact context and delegates posting', () => {
    const onPost = vi.fn()

    render(
      <PosQuickTransactionSummary
        direction="out"
        impactSummary="Card impact −£42.00"
        destinationLabel="Direct to Remittance"
        loyaltyPoints={12}
        voucherDiscount="£5.00"
        posting={false}
        postButtonTitle="Post this transaction"
        postButtonLabel="Post transaction"
        onPost={onPost}
      />,
    )

    expect(screen.getByText('Card impact −£42.00')).toBeTruthy()
    expect(screen.getByText('Direct to Remittance')).toBeTruthy()
    expect(screen.getByText('+12 pts')).toBeTruthy()
    expect(screen.getByText('Voucher −£5.00')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Post transaction' }))
    expect(onPost).toHaveBeenCalledOnce()
  })

  it('keeps posting state and transfer presentation controlled by the parent', () => {
    const onPost = vi.fn()

    render(
      <PosQuickTransactionSummary
        direction="transfer"
        impactSummary="£100.00 moves between cash locations"
        posting
        postButtonTitle="Post this transaction"
        postButtonLabel="Posting…"
        onPost={onPost}
      />,
    )

    const button = screen.getByRole('button', { name: 'Posting…' })
    expect((button as HTMLButtonElement).disabled).toBe(true)
    expect(button.getAttribute('title')).toBe('Post this transaction')
    expect(screen.getByText('£100.00 moves between cash locations')).toBeTruthy()
    fireEvent.click(button)
    expect(onPost).not.toHaveBeenCalled()
  })
})
