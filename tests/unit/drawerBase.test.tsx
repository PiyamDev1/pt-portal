// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { DrawerBase } from '@/components/DrawerBase'

function DrawerHarness() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open ticket drawer
      </button>
      <DrawerBase
        isOpen={open}
        onClose={() => setOpen(false)}
        title="Ticket details"
        description="Complete the record"
        footer={<button type="button">Last action</button>}
      >
        <button type="button">First body action</button>
      </DrawerBase>
    </>
  )
}

describe('DrawerBase', () => {
  it('traps focus, closes with Escape, and restores focus to its opener', async () => {
    render(<DrawerHarness />)
    const opener = screen.getByRole('button', { name: 'Open ticket drawer' })
    opener.focus()
    fireEvent.click(opener)

    expect(screen.getByRole('dialog', { name: 'Ticket details' })).toBeTruthy()
    const close = screen.getByRole('button', { name: 'Close drawer' })
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
})
