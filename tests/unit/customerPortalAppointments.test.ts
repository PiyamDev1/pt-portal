import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  getOrCreateResourceAlias: vi.fn(),
  getServiceSupabaseClient: vi.fn(),
}))

vi.mock('@/lib/api/serviceSupabase', () => ({
  getServiceSupabaseClient: mocks.getServiceSupabaseClient,
}))

vi.mock('@/lib/customerPortal/grants', () => ({
  createCustomerAccessGrant: vi.fn(),
  getOrCreateResourceAlias: mocks.getOrCreateResourceAlias,
  resolveResourceAlias: vi.fn(),
  verifyCustomerAccessGrant: vi.fn(),
}))

import { customerBookingCatalog } from '@/lib/customerPortal/appointments'

function query(result: unknown) {
  const builder = {
    select: vi.fn(),
    eq: vi.fn(),
    not: vi.fn(),
    in: vi.fn(),
    order: vi.fn(),
  }
  builder.select.mockReturnValue(builder)
  builder.eq.mockReturnValue(builder)
  builder.not.mockReturnValue(builder)
  builder.in.mockReturnValue(builder)
  builder.order.mockResolvedValue(result)
  return builder
}

describe('customer appointment catalog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('publishes only services linked to a real branch', async () => {
    const servicesQuery = query({
      data: [
        {
          id: 'service-branch',
          location_id: 'location-1',
          name: 'Passport Biometrics',
          customer_description: null,
          duration_minutes: 15,
          customer_max_group_size: 20,
          customer_modification_cutoff_hours: 24,
        },
        {
          id: 'service-global',
          location_id: null,
          name: 'Internal global service',
          customer_description: null,
          duration_minutes: 30,
          customer_max_group_size: 20,
          customer_modification_cutoff_hours: 24,
        },
      ],
      error: null,
    })
    const locationsQuery = query({
      data: [
        {
          id: 'location-1',
          name: 'Luton branch',
          address_line1: '290A Dunstable Road',
          address_line2: null,
          city: 'Luton',
          postcode: 'LU4 8JN',
          country: 'United Kingdom',
          phone: '01582968538',
        },
      ],
      error: null,
    })
    mocks.from.mockImplementation((table: string) =>
      table === 'booking_services' ? servicesQuery : locationsQuery,
    )
    mocks.getServiceSupabaseClient.mockReturnValue({ from: mocks.from })
    mocks.getOrCreateResourceAlias.mockImplementation(
      async (resourceType: string, internalId: string) => ({
        publicId: `${resourceType}-${internalId}`,
      }),
    )

    const catalog = await customerBookingCatalog()

    expect(servicesQuery.not).toHaveBeenCalledWith('location_id', 'is', null)
    expect(catalog.services).toHaveLength(1)
    expect(catalog.services[0]).toMatchObject({
      id: 'service-service-branch',
      branchIds: ['branch-location-1'],
    })
    expect(mocks.getOrCreateResourceAlias).not.toHaveBeenCalledWith('service', 'service-global')
  })
})
