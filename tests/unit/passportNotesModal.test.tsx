import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import NotesModal from '@/app/dashboard/applications/passports/components/NotesModal'

describe('Passport NotesModal', () => {
  it('keeps save enabled after editing notes', async () => {
    const onClose = vi.fn()
    const onSave = vi.fn()

    function ControlledModal() {
      const [notes, setNotes] = useState('Initial note')

      return (
        <NotesModal
          open={true}
          onClose={onClose}
          trackingNumber="PK-123"
          notes={notes}
          setNotes={setNotes}
          onSave={onSave}
          isSaving={false}
          isLoading={false}
        />
      )
    }

    render(<ControlledModal />)

    const saveButton = screen.getByRole('button', { name: /save notes/i })
    const textarea = screen.getByLabelText(/notes \(saved per application\)/i)

    await waitFor(() => {
      expect(saveButton).toHaveProperty('disabled', true)
    })

    fireEvent.change(textarea, { target: { value: 'Initial note updated' } })

    await waitFor(() => {
      expect(saveButton).toHaveProperty('disabled', false)
    })
  })
})
