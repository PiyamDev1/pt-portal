import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import PackageOverviewHeader from '@/app/dashboard/packages/[id]/PackageOverviewHeader'

describe('Package overview header', () => {
  it('shows package identity and delegates enabled actions', () => {
    const actions = {
      onViewFinalQuotation: vi.fn(),
      onSyncQuotation: vi.fn(),
      onGenerateAccessVoucher: vi.fn(),
      onTogglePackageGroup: vi.fn(),
    }

    render(
      <PackageOverviewHeader
        packageReference="PKG-2048"
        customerName="Amina Khan"
        packageType="Umrah"
        hasSelectedQuote
        syncingQuote={false}
        {...actions}
      />,
    )

    expect(screen.getByRole('heading', { name: 'PKG-2048' })).toBeTruthy()
    expect(screen.getByText('Amina Khan · Umrah')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'View Final Quotation' }))
    fireEvent.click(screen.getByRole('button', { name: 'Sync quotation changes' }))
    fireEvent.click(screen.getByRole('button', { name: 'Generate Access Voucher' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add Package Link' }))

    expect(actions.onViewFinalQuotation).toHaveBeenCalledOnce()
    expect(actions.onSyncQuotation).toHaveBeenCalledOnce()
    expect(actions.onGenerateAccessVoucher).toHaveBeenCalledOnce()
    expect(actions.onTogglePackageGroup).toHaveBeenCalledOnce()
  })

  it('keeps quote-only actions hidden when a quote has not been selected', () => {
    render(
      <PackageOverviewHeader
        packageReference="PKG-2049"
        customerName={null}
        packageType="Flight"
        hasSelectedQuote={false}
        syncingQuote={false}
        onViewFinalQuotation={() => {}}
        onSyncQuotation={() => {}}
        onGenerateAccessVoucher={() => {}}
        onTogglePackageGroup={() => {}}
      />,
    )

    expect(screen.getByText('No customer · Flight')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'View Final Quotation' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Sync quotation changes' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Generate Access Voucher' })).toBeTruthy()
  })
})
