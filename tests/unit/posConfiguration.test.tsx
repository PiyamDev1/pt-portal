import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import PosConfigurationClient from '@/app/dashboard/accounting/pos-configuration/PosConfigurationClient'

const configuration = {
  categories: [
    {
      id: 'category-1',
      category_key: 'remittance',
      label: 'Remittance',
      description: 'Send money',
      icon_key: 'landmark',
      display_order: 30,
      supplier_payments_enabled: true,
      is_active: true,
      is_system: true,
    },
  ],
  services: [
    {
      id: 'service-1',
      item_key: 'ria',
      category_id: 'category-1',
      label: 'Ria',
      option_label: 'Ria',
      classification: 'SERVICE',
      default_direction: 'IN',
      allowed_payment_methods: ['CASH', 'CARD', 'BANK'],
      tracked_source_type: null,
      source_required: false,
      customer_required: true,
      note_required: false,
      price_required: true,
      logo_key: 'ria',
      logo_url: '/pos/providers/ria.svg',
      display_order: 10,
      is_active: true,
    },
  ],
  suppliers: [
    {
      name: 'Ria',
      supplier_vendor_id: '10000000-0000-4000-8000-000000000001',
      alternate_names: [],
      source_area: 'Remittance',
      source_reference: null,
      settlement_mode: 'DEPOSIT_ACCOUNT',
      logo_key: 'ria',
      logo_url: '/pos/providers/ria.svg',
      is_system: true,
      is_active: true,
      supplier_vendors: { name: 'Ria' },
    },
  ],
  assignments: [
    {
      category_id: 'category-1',
      supplier_vendor_id: '10000000-0000-4000-8000-000000000001',
      is_default: true,
      is_active: true,
    },
  ],
  capabilityVersion: 2026090903,
  configurationReady: true,
}

describe('POS configuration workspace', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('organises settings into tabs and keeps loyalty configuration out of POS', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'POST') {
        return new Response(JSON.stringify({ success: true }), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      return new Response(JSON.stringify(configuration), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<PosConfigurationClient />)

    expect(await screen.findByText('No duplicates detected')).toBeTruthy()
    for (const tab of ['Overview', 'Categories', 'Services', 'Suppliers', 'Assignments']) {
      expect(screen.getByRole('button', { name: new RegExp(`^${tab}`) })).toBeTruthy()
    }

    fireEvent.click(screen.getByRole('button', { name: /^Services/ }))
    expect(screen.getByText('Services and subservices')).toBeTruthy()
    expect(screen.queryByLabelText(/loyalty/i)).toBeNull()
    expect(screen.getByText(/edited only in the Loyalty module/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Save service' }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3))
    const request = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')
    const body = JSON.parse(String(request?.[1]?.body)) as Record<string, unknown>
    expect(body.action).toBe('UPSERT_SERVICE')
    expect(body).not.toHaveProperty('loyaltyEligible')
    expect(body).not.toHaveProperty('pointsPerGbp')
  })

  it('reports duplicate active labels before an operator edits anything', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              ...configuration,
              categories: [
                ...configuration.categories,
                { ...configuration.categories[0], id: 'category-2', category_key: 'remit-two' },
              ],
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          ),
      ),
    )

    render(<PosConfigurationClient />)

    expect(await screen.findByText('Duplicate active category: Remittance')).toBeTruthy()
  })
})
