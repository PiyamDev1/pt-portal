import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { BookingReminderSettingsPanel } from '@/app/dashboard/settings/components/BookingReminderSettingsPanel'
import { DEFAULT_REMINDER_SUBJECT, defaultReminderSettings } from '@/lib/bookingReminders'

describe('BookingReminderSettingsPanel', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('loads and saves the shared reminder contract through the booking API', async () => {
    const stored = {
      ...defaultReminderSettings('location-1'),
      reminder_subject: 'Stored branch reminder',
    }
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'PATCH') {
        return {
          ok: true,
          json: async () => ({ settings: JSON.parse(String(init.body)).settings }),
        }
      }
      return { ok: true, json: async () => ({ settings: stored }) }
    })
    vi.stubGlobal('fetch', fetchMock)

    render(
      <BookingReminderSettingsPanel
        selectedLocationId="location-1"
        onEditServiceEmails={vi.fn()}
      />,
    )

    const subject = await screen.findByRole('textbox', { name: 'Email subject' })
    expect((subject as HTMLInputElement).value).toBe('Stored branch reminder')

    fireEvent.change(subject, { target: { value: 'Updated branch reminder' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save messages & attendance' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    const [, patchOptions] = fetchMock.mock.calls[1]
    expect(JSON.parse(String(patchOptions?.body))).toMatchObject({
      location_id: 'location-1',
      settings: { reminder_subject: 'Updated branch reminder' },
    })
  })

  it('uses canonical defaults and keeps the service-email handoff explicit', async () => {
    const onEditServiceEmails = vi.fn()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          settings: {
            ...defaultReminderSettings('location-1'),
            reminder_subject: 'Custom reminder',
          },
        }),
      }),
    )

    render(
      <BookingReminderSettingsPanel
        selectedLocationId="location-1"
        onEditServiceEmails={onEditServiceEmails}
      />,
    )

    const subject = await screen.findByRole('textbox', { name: 'Email subject' })
    fireEvent.click(screen.getByRole('button', { name: 'Reset defaults' }))
    fireEvent.click(screen.getByRole('button', { name: 'Edit service emails' }))

    expect((subject as HTMLInputElement).value).toBe(DEFAULT_REMINDER_SUBJECT)
    expect(onEditServiceEmails).toHaveBeenCalledOnce()
  })
})
