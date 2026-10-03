import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import {
  PackageQuoteBrowser,
  type PackageQuoteBrowserModel,
} from '@/app/dashboard/packages/PackageQuoteBrowser'
import { filterPackageQuotes } from '@/app/dashboard/packages/packageQuoteBrowserModel'
import type {
  PackageQuotePayload,
  TravelPackageGroup,
  TravelPackageQuote,
} from '@/app/types/packages'

const basePayload: PackageQuotePayload = {
  title: 'Family Umrah Quote',
  packageType: 'umrah',
  currency: 'GBP',
  customerName: 'Lead Family',
  customerPhone: '+447000000000',
  customerEmail: 'family@example.com',
  adults: 2,
  childrenPaying: 0,
  childrenFree: 0,
  infants: 0,
  itineraryOrder: ['makkah'],
  departureDate: '2026-12-01',
  returnDate: '2026-12-10',
  stayGroups: [
    {
      id: 'makkah',
      label: 'Makkah',
      options: [
        {
          id: 'hotel-1',
          title: 'Makkah Hotel',
          summary: 'Seven nights',
          price: 1000,
          isDefault: true,
        },
      ],
    },
  ],
  flightOptions: [],
  linkedFlightGroups: [],
  visaOptions: [],
  transportOptions: [],
  limitedTimeOffers: [],
  cardProcessingFeePercent: 0,
  notes: '',
}

function buildQuote(id: string, overrides: Partial<TravelPackageQuote> = {}): TravelPackageQuote {
  return {
    id,
    title: `${id} package quote`,
    package_type: 'umrah',
    status: 'draft',
    currency: 'GBP',
    customer_name: 'Lead Family',
    customer_phone: '+447000000000',
    customer_email: 'family@example.com',
    payload: basePayload,
    share_token: `${id}-token`,
    share_enabled: false,
    shared_at: null,
    expires_at: '2099-01-01T00:00:00.000Z',
    selected_option: null,
    selected_at: null,
    selection_note: null,
    created_by: 'staff-1',
    created_at: '2026-10-01T10:00:00.000Z',
    updated_at: null,
    ...overrides,
  }
}

const packageGroup: TravelPackageGroup = {
  id: 'group-1',
  group_reference: 'PTG-001',
  title: 'Linked families',
  lead_package_id: null,
  lead_quote_id: null,
  status: 'active',
  customer_visibility_mode: 'linked_notice_only',
  internal_notes: null,
  metadata: {},
  created_by: 'staff-1',
  updated_by: 'staff-1',
  created_at: '2026-10-01T09:00:00.000Z',
  updated_at: null,
  archived_at: null,
}

describe('PackageQuoteBrowser', () => {
  it('keeps linked quotes out of All while preserving explicit status filters', () => {
    const regularQuote = buildQuote('regular')
    const linkedQuote = buildQuote('linked', {
      payload: {
        ...basePayload,
        linkedPackageGroup: {
          groupId: 'group-1',
          groupReference: 'PTG-001',
          title: 'Linked families',
          visibilityMode: 'linked_notice_only',
          currentFamilyLabel: 'Family 1',
          sharedFlightSelection: false,
          linkedFamilies: [],
          sharedServices: [],
        },
      },
    })

    expect(filterPackageQuotes([linkedQuote, regularQuote], [packageGroup], 'all')).toEqual([
      regularQuote,
    ])
    expect(filterPackageQuotes([linkedQuote, regularQuote], [packageGroup], 'draft')).toHaveLength(
      2,
    )
  })

  it('owns filter state and delegates quote actions to the parent', () => {
    const liveQuote = buildQuote('live', {
      title: 'Live family quote',
      status: 'shared',
      share_enabled: true,
      created_at: '2026-10-03T10:00:00.000Z',
    })
    const draftQuote = buildQuote('draft', { title: 'Draft family quote' })
    const archivedQuote = buildQuote('archived', {
      title: 'Archived family quote',
      status: 'archived',
      archived_at: '2026-10-02T10:00:00.000Z',
    })
    const model: PackageQuoteBrowserModel = {
      quotes: [draftQuote, archivedQuote, liveQuote],
      packageGroups: [],
      activeQuoteId: draftQuote.id,
      loading: false,
      saving: false,
      onOpenQuote: vi.fn(),
      onDuplicateQuote: vi.fn(),
      onCopyShareLink: vi.fn(),
    }

    render(<PackageQuoteBrowser model={model} />)

    expect(screen.getByText('Live family quote')).toBeTruthy()
    expect(screen.getByText('Draft family quote')).toBeTruthy()
    expect(screen.queryByText('Archived family quote')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Bin' }))
    expect(screen.getByText('Archived family quote')).toBeTruthy()
    expect(screen.queryByText('Live family quote')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Live Links' }))
    fireEvent.click(screen.getByTitle('Open quote for editing'))
    fireEvent.click(screen.getByTitle('Duplicate quote as new draft'))
    fireEvent.click(screen.getByTitle('Copy customer link'))

    expect(model.onOpenQuote).toHaveBeenCalledWith(liveQuote)
    expect(model.onDuplicateQuote).toHaveBeenCalledWith(liveQuote)
    expect(model.onCopyShareLink).toHaveBeenCalledWith(liveQuote)
  })
})
