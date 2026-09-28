import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'

import { BookingEmailTemplateEditor } from '@/app/dashboard/settings/components/BookingEmailTemplateEditor'

function EditorHarness({ initialValue = '' }: { initialValue?: string }) {
  const [value, setValue] = useState(initialValue)
  return (
    <BookingEmailTemplateEditor
      field="confirmation_template"
      label="Booking Confirmation Email Template"
      previewTitle="Confirmation"
      value={value}
      onChange={setValue}
    />
  )
}

describe('BookingEmailTemplateEditor', () => {
  it('applies the shared preset and updates the live preview', () => {
    render(<EditorHarness />)

    fireEvent.click(screen.getByRole('button', { name: 'Short' }))

    expect(
      (
        screen.getByRole('textbox', {
          name: 'Booking Confirmation Email Template',
        }) as HTMLTextAreaElement
      ).value,
    ).toBe('Booking confirmed: [service booked] on [date booked] at [time booked] - [branch name].')
    expect(screen.getByTitle('Confirmation preview').getAttribute('srcdoc')).toContain(
      'Visa Consultation',
    )
  })

  it('inserts an approved token at the current selection', () => {
    render(<EditorHarness initialValue="Dear customer" />)
    const textarea = screen.getByRole('textbox', {
      name: 'Booking Confirmation Email Template',
    }) as HTMLTextAreaElement
    textarea.setSelectionRange(5, 13)

    fireEvent.click(screen.getByRole('button', { name: '[Customer Name]' }))

    expect(textarea.value).toBe('Dear [Customer Name]')
  })
})
