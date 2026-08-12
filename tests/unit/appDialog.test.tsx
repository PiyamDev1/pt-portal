// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { useAppDialog } from '@/components/AppDialog'
import { ConfirmationModal } from '@/app/dashboard/lms/components/ConfirmationModal'
import { ModalWrapper } from '@/app/dashboard/lms/components/ModalWrapper'

function DialogHarness() {
  const { confirm, prompt, dialog } = useAppDialog()
  const [result, setResult] = useState('pending')

  return (
    <>
      <button
        onClick={async () =>
          setResult(String(await confirm({ title: 'Delete item', message: 'Continue?' })))
        }
      >
        Open confirmation
      </button>
      <button
        onClick={async () =>
          setResult(
            String(
              await prompt({
                title: 'Cancel package',
                message: 'Add an audit reason.',
                label: 'Reason',
                required: true,
              }),
            ),
          )
        }
      >
        Open prompt
      </button>
      <output>{result}</output>
      {dialog}
    </>
  )
}

function LmsModalHarness() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button onClick={() => setOpen(true)}>Open LMS modal</button>
      {open && (
        <ModalWrapper title="LMS editor" onClose={() => setOpen(false)}>
          <button>First action</button>
          <button>Last action</button>
        </ModalWrapper>
      )}
    </>
  )
}

function LmsConfirmationHarness() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button onClick={() => setOpen(true)}>Open LMS confirmation</button>
      <ConfirmationModal
        isOpen={open}
        title="Delete payment"
        message="This cannot be undone."
        onConfirm={() => setOpen(false)}
        onCancel={() => setOpen(false)}
      />
    </>
  )
}

describe('useAppDialog', () => {
  it('resolves app-native confirmation decisions', async () => {
    render(<DialogHarness />)

    fireEvent.click(screen.getByRole('button', { name: 'Open confirmation' }))
    expect(screen.getByRole('dialog', { name: 'Delete item' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))

    await waitFor(() => expect(screen.getByText('true')).toBeTruthy())
  })

  it('collects required text without invoking a browser prompt', async () => {
    render(<DialogHarness />)

    fireEvent.click(screen.getByRole('button', { name: 'Open prompt' }))
    const input = screen.getByLabelText('Reason')
    const continueButton = screen.getByRole('button', { name: 'Continue' })
    expect((continueButton as HTMLButtonElement).disabled).toBe(true)

    fireEvent.change(input, { target: { value: 'Customer requested cancellation' } })
    fireEvent.click(continueButton)

    await waitFor(() => expect(screen.getByText('Customer requested cancellation')).toBeTruthy())
  })

  it('cancels with Escape and restores focus to the opener', async () => {
    render(<DialogHarness />)
    const opener = screen.getByRole('button', { name: 'Open confirmation' })
    opener.focus()
    fireEvent.click(opener)

    fireEvent.keyDown(document, { key: 'Escape' })

    await waitFor(() => expect(screen.getByText('false')).toBeTruthy())
    expect(document.activeElement).toBe(opener)
  })
})

describe('modal accessibility', () => {
  it('traps focus in the LMS modal and restores it after Escape', async () => {
    render(<LmsModalHarness />)
    const opener = screen.getByRole('button', { name: 'Open LMS modal' })
    opener.focus()
    fireEvent.click(opener)

    expect(screen.getByRole('dialog', { name: 'LMS editor' })).toBeTruthy()
    const close = screen.getByLabelText('Close modal')
    const last = screen.getByRole('button', { name: 'Last action' })
    await waitFor(() => expect(document.activeElement).toBe(close))

    last.focus()
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(document.activeElement).toBe(close)

    close.focus()
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(last)

    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(document.activeElement).toBe(opener)
  })

  it('gives the LMS confirmation an accessible name and restores focus', async () => {
    render(<LmsConfirmationHarness />)
    const opener = screen.getByRole('button', { name: 'Open LMS confirmation' })
    opener.focus()
    fireEvent.click(opener)

    expect(screen.getByRole('dialog', { name: 'Delete payment' })).toBeTruthy()
    fireEvent.keyDown(document, { key: 'Escape' })

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(document.activeElement).toBe(opener)
  })
})
