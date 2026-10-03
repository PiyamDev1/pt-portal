import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  BookingServiceSettingsPanel,
  type BookingServiceRow,
  useBookingServiceSettings,
} from '@/app/dashboard/settings/components/BookingServiceSettingsPanel'

function service(overrides: Partial<BookingServiceRow> = {}): BookingServiceRow {
  return {
    id: 'service-1',
    location_id: 'location-1',
    name: 'Visa consultation',
    duration_minutes: 30,
    buffer_minutes: 15,
    available_days: null,
    service_start_time: null,
    service_end_time: null,
    confirmation_template: null,
    modification_template: null,
    cancellation_template: null,
    duration_per_additional_person_minutes: 0,
    person_count_excludes_family_head: true,
    close_overrun_tolerance_minutes: 15,
    customer_visible: false,
    customer_description: null,
    customer_max_group_size: 20,
    customer_modification_cutoff_hours: 24,
    is_active: true,
    ...overrides,
  }
}

function ModelProbe({ locationId }: { locationId: string }) {
  const model = useBookingServiceSettings(locationId)
  return (
    <output aria-label="service summary">
      {JSON.stringify({
        loading: model.loading,
        total: model.services.length,
        active: model.activeServiceCount,
        customerPortal: model.customerPortalServiceCount,
        firstName: model.services[0]?.name ?? null,
      })}
    </output>
  )
}

function PanelProbe({ locationId }: { locationId: string }) {
  const model = useBookingServiceSettings(locationId)
  return <BookingServiceSettingsPanel model={model} />
}

describe('Booking service settings model', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('loads one branch contract and derives the header summaries', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        services: [
          service({ customer_visible: true }),
          service({ id: 'service-2', name: 'Internal review', is_active: false }),
        ],
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<ModelProbe locationId="location-1" />)

    await waitFor(() =>
      expect(screen.getByLabelText('service summary').textContent).toContain(
        '"loading":false,"total":2,"active":1,"customerPortal":1',
      ),
    )
    expect(fetchMock).toHaveBeenCalledWith('/api/bookings/settings/services?location_id=location-1')
  })

  it('ignores a stale response after the selected branch changes', async () => {
    let resolveFirst: ((value: unknown) => void) | undefined
    let resolveSecond: ((value: unknown) => void) | undefined
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      return new Promise((resolve) => {
        if (String(input).includes('location-1')) resolveFirst = resolve
        else resolveSecond = resolve
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    const view = render(<ModelProbe locationId="location-1" />)
    view.rerender(<ModelProbe locationId="location-2" />)

    await act(async () => {
      resolveSecond?.({
        ok: true,
        json: async () => ({
          services: [service({ id: 'service-2', location_id: 'location-2', name: 'Branch two' })],
        }),
      })
    })
    await waitFor(() =>
      expect(screen.getByLabelText('service summary').textContent).toContain(
        '"firstName":"Branch two"',
      ),
    )

    await act(async () => {
      resolveFirst?.({
        ok: true,
        json: async () => ({ services: [service({ name: 'Stale branch one' })] }),
      })
    })
    expect(screen.getByLabelText('service summary').textContent).toContain(
      '"firstName":"Branch two"',
    )
  })

  it('uses the shared field contract when creating a service', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'POST') {
        const body = JSON.parse(String(init.body))
        return {
          ok: true,
          json: async () => ({
            service: service({ ...body, id: 'service-created', is_active: true }),
          }),
        }
      }
      return { ok: true, json: async () => ({ services: [] }) }
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<PanelProbe locationId="location-1" />)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))

    fireEvent.click(screen.getByRole('button', { name: /Add Service/ }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Service Name' }), {
      target: { value: 'Document review' },
    })
    fireEvent.click(screen.getByRole('checkbox', { name: 'Offer in customer portal' }))
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Maximum group size' }), {
      target: { value: '6' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    const [, requestOptions] = fetchMock.mock.calls[1]
    expect(JSON.parse(String(requestOptions?.body))).toMatchObject({
      location_id: 'location-1',
      name: 'Document review',
      customer_visible: true,
      customer_max_group_size: 6,
    })
  })

  it('uses the same shared field contract when editing a service', async () => {
    const stored = service({ customer_visible: true, customer_max_group_size: 4 })
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'PATCH') {
        const body = JSON.parse(String(init.body))
        return { ok: true, json: async () => ({ service: { ...stored, ...body } }) }
      }
      return { ok: true, json: async () => ({ services: [stored] }) }
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<PanelProbe locationId="location-1" />)
    await screen.findByText('Visa consultation')
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))

    fireEvent.change(screen.getByRole('textbox', { name: 'Service Name' }), {
      target: { value: 'Updated consultation' },
    })
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Maximum group size' }), {
      target: { value: '8' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    const [, requestOptions] = fetchMock.mock.calls[1]
    expect(JSON.parse(String(requestOptions?.body))).toMatchObject({
      name: 'Updated consultation',
      customer_visible: true,
      customer_max_group_size: 8,
    })
  })
})
