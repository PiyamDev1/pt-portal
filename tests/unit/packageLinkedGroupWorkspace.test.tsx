import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import {
  PackageLinkedGroupWorkspace,
  type PackageLinkedGroupWorkspaceModel,
} from '@/app/dashboard/packages/PackageLinkedGroupWorkspace'
import type {
  PackageQuotePayload,
  TravelPackageGroup,
  TravelPackageQuote,
} from '@/app/types/packages'
import type { TravelPackageGroupDetail } from '@/lib/packageGroups'

const basePayload: PackageQuotePayload = {
  title: 'Lead family quote',
  packageType: 'umrah',
  currency: 'GBP',
  customerName: 'Lead Family',
  customerPhone: '+447000000001',
  customerEmail: 'lead@example.com',
  adults: 2,
  childrenPaying: 0,
  childrenFree: 0,
  infants: 0,
  itineraryOrder: [],
  departureDate: '2026-12-01',
  returnDate: '2026-12-10',
  stayGroups: [],
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
    title: `${id} family quote`,
    package_type: 'umrah',
    status: 'draft',
    currency: 'GBP',
    customer_name: `${id} Family`,
    customer_phone: '+447000000002',
    customer_email: `${id}@example.com`,
    payload: { ...basePayload, title: `${id} family quote`, customerName: `${id} Family` },
    share_token: `${id}-token`,
    share_enabled: false,
    shared_at: null,
    expires_at: '2099-01-01T00:00:00.000Z',
    selected_option: null,
    selected_at: null,
    selection_note: null,
    created_by: 'staff-1',
    created_at: '2026-10-02T10:00:00.000Z',
    updated_at: null,
    ...overrides,
  }
}

function buildGroup(id: string, overrides: Partial<TravelPackageGroup> = {}): TravelPackageGroup {
  return {
    id,
    group_reference: `PTG-${id}`,
    title: `${id} linked families`,
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
    ...overrides,
  }
}

function buildModel(
  overrides: Partial<PackageLinkedGroupWorkspaceModel> = {},
): PackageLinkedGroupWorkspaceModel {
  const activeQuote = buildQuote('lead')
  const secondQuote = buildQuote('second')
  const linkedQuote = buildQuote('linked')
  const activeGroup: TravelPackageGroupDetail = {
    ...buildGroup('active'),
    members: [
      {
        id: 'member-lead',
        group_id: 'active',
        package_id: null,
        quote_id: activeQuote.id,
        family_label: 'Family 1',
        customer_display_name: 'Lead Family',
        is_lead_family: true,
        customer_visible: true,
        sort_order: 10,
        metadata: {},
        created_at: '2026-10-01T09:00:00.000Z',
        updated_at: null,
      },
      {
        id: 'member-linked',
        group_id: 'active',
        package_id: null,
        quote_id: linkedQuote.id,
        family_label: 'Family 2',
        customer_display_name: 'Linked Family',
        is_lead_family: false,
        customer_visible: true,
        sort_order: 20,
        metadata: {},
        created_at: '2026-10-01T09:00:00.000Z',
        updated_at: null,
      },
    ],
    sharedServices: [],
  }

  return {
    activeQuote,
    activePackageGroup: activeGroup,
    activePackageGroupQuoteIds: new Set([activeQuote.id, linkedQuote.id]),
    payload: { customerName: basePayload.customerName },
    packageGroups: [activeGroup, buildGroup('archived', { status: 'archived' })],
    quotes: [activeQuote, secondQuote, linkedQuote, buildQuote('archived', { status: 'archived' })],
    loading: false,
    packageGroupLoading: false,
    packageGroupSaving: false,
    packageGroupSetupMessage: null,
    newGroupTitle: '',
    linkedFamilyLabel: 'Family 1',
    selectedGroupId: activeGroup.id,
    packageGroupSearch: '',
    quoteGroupSearch: '',
    selectedQuoteForGroupId: secondQuote.id,
    selectedQuoteFamilyLabel: 'Family 3',
    sharedTransportNote: 'Shared coach transfer',
    sharedFlightSelection: true,
    setNewGroupTitle: vi.fn(),
    setLinkedFamilyLabel: vi.fn(),
    setSelectedGroupId: vi.fn(),
    setPackageGroupSearch: vi.fn(),
    setQuoteGroupSearch: vi.fn(),
    setSelectedQuoteForGroupId: vi.fn(),
    setSelectedQuoteFamilyLabel: vi.fn(),
    setSharedTransportNote: vi.fn(),
    createPackageGroup: vi.fn(),
    linkSelectedPackageGroup: vi.fn(),
    linkSelectedQuoteToPackageGroup: vi.fn(),
    saveSharedTransportNote: vi.fn(),
    saveSharedFlightSelection: vi.fn(),
    unlinkCurrentQuoteFromGroup: vi.fn(),
    applyPackageGroupSnapshot: vi.fn(),
    ...overrides,
  }
}

describe('PackageLinkedGroupWorkspace', () => {
  it('owns disclosure and filtering while delegating group mutations', () => {
    const model = buildModel()
    render(<PackageLinkedGroupWorkspace model={model} />)

    expect(screen.queryByText('Create new group')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Show details' }))
    expect(screen.getByText('Create new group')).toBeTruthy()

    const groupSelect = screen.getByLabelText('Package group')
    expect(within(groupSelect).getByRole('option', { name: /PTG-active/ })).toBeTruthy()
    expect(within(groupSelect).queryByRole('option', { name: /PTG-archived/ })).toBeNull()

    const quoteSelect = screen.getByLabelText('Existing quotation')
    expect(within(quoteSelect).getByRole('option', { name: /second family quote/i })).toBeTruthy()
    expect(within(quoteSelect).queryByRole('option', { name: /linked family quote/i })).toBeNull()
    expect(within(quoteSelect).queryByRole('option', { name: /archived family quote/i })).toBeNull()

    fireEvent.change(screen.getByLabelText('Group name'), {
      target: { value: 'Three linked families' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Create & Link' }))
    fireEvent.click(screen.getByRole('button', { name: 'Link' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add Quote' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save Transport Note' }))
    fireEvent.click(screen.getByRole('button', { name: 'Refresh Snapshot' }))
    fireEvent.click(screen.getAllByRole('button', { name: /Same flights across packages/i })[0])

    expect(model.setNewGroupTitle).toHaveBeenCalledWith('Three linked families')
    expect(model.createPackageGroup).toHaveBeenCalledOnce()
    expect(model.linkSelectedPackageGroup).toHaveBeenCalledOnce()
    expect(model.linkSelectedQuoteToPackageGroup).toHaveBeenCalledOnce()
    expect(model.saveSharedTransportNote).toHaveBeenCalledOnce()
    expect(model.applyPackageGroupSnapshot).toHaveBeenCalledWith(model.activePackageGroup)
    expect(model.saveSharedFlightSelection).toHaveBeenCalledWith(false)
  })

  it('keeps unsaved quotations behind the existing save-first boundary', () => {
    render(
      <PackageLinkedGroupWorkspace
        model={buildModel({ activeQuote: null, activePackageGroup: null })}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Show details' }))
    expect(screen.getByText(/Save this quote first, then link it/)).toBeTruthy()
    expect(screen.queryByText('Create new group')).toBeNull()
  })
})
