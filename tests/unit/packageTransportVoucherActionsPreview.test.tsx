import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PackageTransportVoucherActionsPreview } from '@/app/dashboard/packages/[id]/PackageTransportVoucherActionsPreview'

describe('PackageTransportVoucherActionsPreview', () => {
  it('delegates saving, generation, and print preview to the workspace', () => {
    const onSaveEdits = vi.fn()
    const onGenerate = vi.fn()
    const onOpenPreview = vi.fn()

    render(
      <PackageTransportVoucherActionsPreview
        hasEditingVoucher
        voucherVersion={3}
        saving={false}
        passengerError=""
        previewHtml="<p>Preview</p>"
        onSaveEdits={onSaveEdits}
        onGenerate={onGenerate}
        onOpenPreview={onOpenPreview}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Save edits to selected voucher' }))
    fireEvent.click(screen.getByRole('button', { name: 'Generate new internal voucher' }))
    fireEvent.click(screen.getByRole('button', { name: 'Generate new and release' }))
    fireEvent.click(screen.getByRole('button', { name: 'View / Print' }))

    expect(onSaveEdits).toHaveBeenCalledOnce()
    expect(onGenerate).toHaveBeenNthCalledWith(1, false)
    expect(onGenerate).toHaveBeenNthCalledWith(2, true)
    expect(onOpenPreview).toHaveBeenCalledOnce()
    expect(screen.getByText('v3')).toBeTruthy()
    expect(screen.getByTitle('Transport voucher preview').getAttribute('srcdoc')).toBe(
      '<p>Preview</p>',
    )
  })

  it('hides edit actions without a selected voucher and disables generation when invalid', () => {
    render(
      <PackageTransportVoucherActionsPreview
        hasEditingVoucher={false}
        voucherVersion={null}
        saving={false}
        passengerError="Select a larger vehicle."
        previewHtml=""
        onSaveEdits={vi.fn()}
        onGenerate={vi.fn()}
        onOpenPreview={vi.fn()}
      />,
    )

    expect(screen.queryByRole('button', { name: 'Save edits to selected voucher' })).toBeNull()
    expect(
      screen
        .getByRole('button', { name: 'Generate new internal voucher' })
        .hasAttribute('disabled'),
    ).toBe(true)
    expect(
      screen.getByRole('button', { name: 'Generate new and release' }).hasAttribute('disabled'),
    ).toBe(true)
    expect(screen.getByText('Unsaved preview')).toBeTruthy()
  })
})
