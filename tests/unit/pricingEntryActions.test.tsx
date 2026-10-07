import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import PricingEntryActions from '@/app/dashboard/settings/components/pricing/PricingEntryActions'

const renderActions = (isEditing: boolean, callbacks = {}) =>
  render(
    <table>
      <tbody>
        <tr>
          <PricingEntryActions
            isEditing={isEditing}
            onSave={vi.fn()}
            onCancel={vi.fn()}
            onEdit={vi.fn()}
            onDelete={vi.fn()}
            {...callbacks}
          />
        </tr>
      </tbody>
    </table>,
  )

describe('PricingEntryActions', () => {
  it('delegates edit and delete actions for a saved row', () => {
    const onEdit = vi.fn()
    const onDelete = vi.fn()
    renderActions(false, { onEdit, onDelete })

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

    expect(onEdit).toHaveBeenCalledOnce()
    expect(onDelete).toHaveBeenCalledOnce()
  })

  it('delegates save and cancel actions for an edited row', () => {
    const onSave = vi.fn()
    const onCancel = vi.fn()
    renderActions(true, { onSave, onCancel })

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onSave).toHaveBeenCalledOnce()
    expect(onCancel).toHaveBeenCalledOnce()
  })
})
