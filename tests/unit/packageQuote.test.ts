import { describe, expect, it } from 'vitest'
import {
  buildPackageCombinations,
  buildCustomerPackageOptions,
  buildPackagePresetSelections,
  buildPackageSnapshot,
  createTravelPackageReference,
  formatPackageQuoteForCopy,
  formatPackageCombinationForCopy,
  getDefaultPackageSelection,
  getFlightOptionPriceDeltas,
  getPackageDepositPaymentSummary,
  getPackagePassengerPriceBreakdown,
  getDefaultPackageExpiry,
  isPackageQuoteExpired,
  normalizePackageQuotePayload,
  rebuildConvertedPackageSnapshot,
  resolvePackageSelection,
  sortPackageOptionsLowToHigh,
} from '@/lib/packageQuote'
import type {
  PackageQuotePayload,
  TravelPackageFolder,
  TravelPackageQuote,
} from '@/app/types/packages'

const payload: PackageQuotePayload = {
  title: 'Family Umrah',
  packageType: 'umrah',
  currency: 'GBP',
  customerName: 'A Khan',
  customerPhone: '',
  customerEmail: '',
  adults: 2,
  childrenPaying: 1,
  childrenFree: 1,
  infants: 0,
  itineraryOrder: ['makkah', 'madinah'],
  departureDate: '',
  returnDate: '',
  stayGroups: [
    {
      id: 'makkah',
      label: 'Makkah',
      options: [
        { id: 'mk-a', title: 'Makkah A', summary: 'Makkah A\n5 nights', price: 400 },
        { id: 'mk-b', title: 'Makkah B', summary: 'Makkah B\n5 nights', price: 350 },
      ],
    },
    {
      id: 'madinah',
      label: 'Madinah',
      options: [
        { id: 'md-a', title: 'Madinah A', summary: 'Madinah A\n4 nights', price: 300 },
        { id: 'md-b', title: 'Madinah B', summary: 'Madinah B\n4 nights', price: 275 },
      ],
    },
  ],
  flightOptions: [
    {
      id: 'flt-a',
      title: 'Direct flights',
      summary: 'Direct flights',
      price: 900,
      pricingMode: 'total',
    },
  ],
  visaOptions: [
    {
      id: 'visa-a',
      title: 'ETA visas',
      summary: '4 x ETA visas',
      price: 50,
      pricingMode: 'per_person',
    },
  ],
  transportOptions: [
    { id: 'tr-a', title: 'Private transfers', summary: 'Private transfers', price: 180 },
  ],
  limitedTimeOffers: [],
  cardProcessingFeePercent: 2.5,
  notes: '',
}

describe('package quote calculator', () => {
  it('creates compact package references with the PT prefix', () => {
    expect(createTravelPackageReference()).toMatch(/^PT-[A-Z0-9]{6}$/)
  })

  it('creates package references from quotation reference codes', () => {
    expect(createTravelPackageReference('H29GPX - Umrah Quotation 31 Jul 2026')).toBe('PT-H29GPX')
    expect(createTravelPackageReference('PT-H29GPX')).toBe('PT-H29GPX')
  })

  it('generates sorted combinations including hotels, flights, and transport', () => {
    const combinations = buildPackageCombinations(payload)

    expect(combinations).toHaveLength(4)
    expect(combinations[0].staySelections.map((stay) => stay.option.id)).toEqual(['mk-b', 'md-b'])
    expect(combinations[0].totalPrice).toBe(1905)
    expect(combinations[0].perPersonPrice).toBeCloseTo(635, 3)
    expect(combinations[0].servicePassengers).toBe(4)
    expect(combinations.at(-1)?.totalPrice).toBe(1980)
  })

  it('generates customer options from lower to higher total cost', () => {
    const options = buildCustomerPackageOptions(payload)

    expect(options.map((option) => option.combination.totalPrice)).toEqual([1905, 1930, 1955, 1980])
    expect(options[0].selection.stayOptionIds).toEqual({ makkah: 'mk-b', madinah: 'md-b' })
  })

  it('formats WhatsApp-friendly copy for an option', () => {
    const [first] = buildPackageCombinations(payload)
    const copy = formatPackageCombinationForCopy(payload, first, 1)

    expect(copy).toContain('*Option 1*')
    expect(copy).toContain('***UMRAH PACKAGE***')
    expect(copy).toContain('***Flights***')
    expect(copy).toContain('****Visa****')
    expect(copy).toContain('*********HOTELS**********')
    expect(copy).toContain('*(Makkah)*')
    expect(copy).toContain('*Total Package Cost: £1,905.00*')
  })

  it('resolves a customer selection and rejects invalid option ids', () => {
    const resolved = resolvePackageSelection(payload, {
      stayOptionIds: { makkah: 'mk-a', madinah: 'md-b' },
      flightOptionId: 'flt-a',
      visaOptionId: 'visa-a',
      transportOptionId: 'tr-a',
    })

    expect(resolved.combination.totalPrice).toBe(1955)
    expect(() =>
      resolvePackageSelection(payload, {
        stayOptionIds: { makkah: 'missing', madinah: 'md-b' },
      }),
    ).toThrow('Select a valid Makkah option')
  })

  it('uses adjusted hotel cost for totals while preserving search cost', () => {
    const normalized = normalizePackageQuotePayload({
      ...payload,
      stayGroups: [
        {
          id: 'makkah',
          label: 'Makkah',
          options: [
            {
              id: 'mk-adjusted',
              title: 'Makkah adjusted',
              summary: 'Makkah adjusted',
              price: 1000,
              searchPrice: 1100,
              adjustedPrice: 900,
            },
          ],
        },
      ],
      flightOptions: [],
      visaOptions: [],
      transportOptions: [],
    })
    const [combination] = buildPackageCombinations(normalized)

    expect(normalized.stayGroups[0].options[0].searchPrice).toBe(1100)
    expect(normalized.stayGroups[0].options[0].adjustedPrice).toBe(900)
    expect(normalized.stayGroups[0].options[0].price).toBe(900)
    expect(combination.totalPrice).toBe(900)
  })

  it('does not let stale adjusted cost override visa and transport prices', () => {
    const normalized = normalizePackageQuotePayload({
      ...payload,
      flightOptions: [],
      stayGroups: [],
      visaOptions: [
        {
          id: 'visa-updated',
          title: 'Updated visa',
          summary: 'Updated visa',
          price: 145,
          adjustedPrice: 30,
          pricingMode: 'per_person',
          quantity: 1,
        },
      ],
      transportOptions: [
        {
          id: 'transport-updated',
          title: 'Updated transport',
          summary: 'Updated transport',
          price: 300,
          adjustedPrice: 180,
          pricingMode: 'total',
        },
      ],
    })

    expect(normalized.visaOptions[0].price).toBe(145)
    expect(normalized.visaOptions[0].adjustedPrice).toBe(145)
    expect(normalized.transportOptions[0].price).toBe(300)
    expect(normalized.transportOptions[0].adjustedPrice).toBe(300)
  })

  it('adds selected hotel extras to the resolved package total', () => {
    const addonPayload = normalizePackageQuotePayload({
      ...payload,
      flightOptions: [],
      visaOptions: [],
      transportOptions: [],
      stayGroups: [
        {
          id: 'makkah',
          label: 'Makkah',
          options: [
            {
              id: 'mk-hotel',
              title: 'Makkah hotel',
              summary: 'Makkah hotel',
              price: 1000,
              hotelAddonOptions: [
                {
                  id: 'breakfast',
                  label: 'Breakfast',
                  searchPrice: 250,
                  adjustedPrice: 200,
                  price: 200,
                },
              ],
            },
          ],
        },
      ],
    })

    const resolved = resolvePackageSelection(addonPayload, {
      stayOptionIds: { makkah: 'mk-hotel' },
      hotelAddonOptionIds: { makkah: ['breakfast'] },
      paymentMethod: 'bank_transfer',
    })

    expect(addonPayload.stayGroups[0].options[0].hotelAddonOptions?.[0].searchPrice).toBe(250)
    expect(resolved.selection.hotelAddonOptionIds).toEqual({ makkah: ['breakfast'] })
    expect(resolved.combination.staySelections[0].addonOptions?.[0].price).toBe(200)
    expect(resolved.combination.totalPrice).toBe(1200)
  })

  it('allows negative hotel extras for downgrade credits', () => {
    const downgradePayload = normalizePackageQuotePayload({
      ...payload,
      flightOptions: [],
      visaOptions: [],
      transportOptions: [],
      stayGroups: [
        {
          id: 'makkah',
          label: 'Makkah',
          options: [
            {
              id: 'mk-hotel',
              title: 'Makkah hotel',
              summary: 'Makkah hotel',
              price: 1000,
              hotelAddonOptions: [
                {
                  id: 'room-downgrade',
                  label: 'City view downgrade',
                  searchPrice: -100,
                  adjustedPrice: -75,
                  price: -75,
                },
              ],
            },
          ],
        },
      ],
    })

    const resolved = resolvePackageSelection(downgradePayload, {
      stayOptionIds: { makkah: 'mk-hotel' },
      hotelAddonOptionIds: { makkah: ['room-downgrade'] },
      paymentMethod: 'bank_transfer',
    })

    expect(downgradePayload.stayGroups[0].options[0].hotelAddonOptions?.[0].searchPrice).toBe(-100)
    expect(resolved.combination.staySelections[0].addonOptions?.[0].price).toBe(-75)
    expect(resolved.combination.totalPrice).toBe(925)
  })

  it('sorts hotel options from low to high by adjusted cost', () => {
    const sorted = sortPackageOptionsLowToHigh([
      {
        id: 'expensive',
        title: 'Expensive hotel',
        summary: '',
        price: 1400,
        searchPrice: 1300,
        adjustedPrice: 1400,
      },
      {
        id: 'better',
        title: 'Better hotel',
        summary: '',
        price: 950,
        searchPrice: 1100,
        adjustedPrice: 950,
      },
      {
        id: 'middle',
        title: 'Middle hotel',
        summary: '',
        price: 1100,
        searchPrice: 1000,
        adjustedPrice: 1100,
      },
    ])

    expect(sorted.map((option) => option.id)).toEqual(['better', 'middle', 'expensive'])
  })

  it('builds quick-select presets for cheapest, preferred, and luxury options', () => {
    const presetPayload = normalizePackageQuotePayload({
      ...payload,
      stayGroups: [
        {
          id: 'makkah',
          label: 'Makkah',
          options: [
            { id: 'mk-cheap', title: 'Cheap', summary: '', price: 500 },
            { id: 'mk-preferred', title: 'Preferred', summary: '', price: 700, isDefault: true },
            { id: 'mk-luxury', title: 'Luxury', summary: '', price: 900 },
          ],
        },
      ],
    })

    const presets = buildPackagePresetSelections(presetPayload)

    expect(presets.map((preset) => preset.label)).toEqual([
      'Cheapest Option',
      'Preffered Option',
      'Luxury Option',
    ])
    expect(presets[0].resolved?.selection.stayOptionIds).toEqual({ makkah: 'mk-cheap' })
    expect(presets[1].resolved?.selection.stayOptionIds).toEqual({ makkah: 'mk-preferred' })
    expect(presets[2].resolved?.selection.stayOptionIds).toEqual({ makkah: 'mk-luxury' })
  })

  it('includes the cheapest flight when building the cheapest preset', () => {
    const presetPayload = normalizePackageQuotePayload({
      ...payload,
      flightOptions: [
        {
          id: 'flight-agent',
          title: 'Agent preferred flight',
          summary: '',
          price: 900,
          pricingMode: 'total',
          isDefault: true,
        },
        {
          id: 'flight-cheapest',
          title: 'Cheapest flight',
          summary: '',
          price: 700,
          pricingMode: 'total',
        },
      ],
    })

    const [cheapest] = buildPackagePresetSelections(presetPayload)

    expect(cheapest.label).toBe('Cheapest Option')
    expect(cheapest.resolved?.selection.flightOptionId).toBe('flight-cheapest')
  })

  it('includes the cheapest linked flight legs when building the cheapest preset', () => {
    const presetPayload = normalizePackageQuotePayload({
      ...payload,
      adults: 2,
      childrenPaying: 0,
      childrenFree: 0,
      infants: 0,
      flightOptions: [
        {
          id: 'flight-main',
          title: 'Main flight',
          summary: '',
          price: 800,
          pricingMode: 'total',
          isDefault: true,
        },
      ],
      linkedFlightGroups: [
        {
          id: 'return-leg',
          baseFlightOptionId: 'flight-main',
          routeLabel: 'Madinah to London',
          defaultOptionId: 'agent-choice',
          options: [
            {
              id: 'agent-choice',
              airlineName: 'Agent choice',
              summary: '',
              adultPrice: 250,
              childPrice: 200,
              infantPrice: 50,
              adultDelta: 0,
              childDelta: 0,
              infantDelta: 0,
              isDefault: true,
            },
            {
              id: 'cheapest-leg',
              airlineName: 'Cheapest linked flight',
              summary: '',
              adultPrice: 175,
              childPrice: 150,
              infantPrice: 40,
              adultDelta: 0,
              childDelta: 0,
              infantDelta: 0,
            },
          ],
        },
      ],
    })

    const [cheapest, preferred, luxury] = buildPackagePresetSelections(presetPayload)

    expect(cheapest.resolved?.selection.linkedFlightOptionIds).toEqual({
      'return-leg': 'cheapest-leg',
    })
    expect(preferred.resolved?.selection.linkedFlightOptionIds).toEqual({
      'return-leg': 'agent-choice',
    })
    expect(luxury.resolved?.selection.linkedFlightOptionIds).toEqual({
      'return-leg': 'agent-choice',
    })
    expect(cheapest.resolved?.combination.totalPrice).toBeLessThan(
      preferred.resolved?.combination.totalPrice || 0,
    )
  })

  it('calculates linked flight option differences from actual leg costs', () => {
    const linkedPayload = normalizePackageQuotePayload({
      ...payload,
      adults: 1,
      childrenPaying: 1,
      childrenFree: 0,
      infants: 1,
      stayGroups: [
        {
          id: 'makkah',
          label: 'Makkah',
          options: [{ id: 'mk-only', title: 'Makkah', summary: 'Makkah', price: 1000 }],
        },
      ],
      flightOptions: [{ id: 'flt-a', title: 'Main flight', summary: 'Main flight', price: 0 }],
      linkedFlightGroups: [
        {
          id: 'leg-home',
          baseFlightOptionId: 'flt-a',
          routeLabel: 'Madinah to London',
          defaultOptionId: 'saudia',
          options: [
            {
              id: 'saudia',
              airlineName: 'Saudia',
              summary: 'Included leg',
              adultPrice: 200,
              childPrice: 150,
              infantPrice: 50,
              adultDelta: 0,
              childDelta: 0,
              infantDelta: 0,
              isDefault: true,
            },
            {
              id: 'egyptair',
              airlineName: 'EgyptAir',
              summary: 'Alternative leg',
              adultPrice: 260,
              childPrice: 180,
              infantPrice: 70,
              adultDelta: 0,
              childDelta: 0,
              infantDelta: 0,
            },
          ],
        },
      ],
      visaOptions: [],
      transportOptions: [],
    })

    const defaultSelection = resolvePackageSelection(linkedPayload, {
      ...getDefaultPackageSelection(linkedPayload),
      linkedFlightOptionIds: { 'leg-home': 'saudia' },
    })
    const implicitSelection = resolvePackageSelection(linkedPayload, {
      stayOptionIds: { makkah: 'mk-only' },
    })
    const alternativeSelection = resolvePackageSelection(linkedPayload, {
      ...getDefaultPackageSelection(linkedPayload),
      linkedFlightOptionIds: { 'leg-home': 'egyptair' },
    })

    expect(defaultSelection.combination.totalPrice).toBe(1400)
    expect(defaultSelection.selection.linkedFlightOptionIds).toEqual({ 'leg-home': 'saudia' })
    expect(implicitSelection.selection.flightOptionId).toBe('flt-a')
    expect(implicitSelection.selection.linkedFlightOptionIds).toEqual({ 'leg-home': 'saudia' })
    expect(implicitSelection.combination.totalPrice).toBe(1400)
    expect(alternativeSelection.combination.totalPrice).toBe(1510)
    expect(alternativeSelection.selection.linkedFlightOptionIds).toEqual({
      'leg-home': 'egyptair',
    })
  })

  it('includes linked legs when comparing complete flight options', () => {
    const linkedPayload = normalizePackageQuotePayload({
      ...payload,
      adults: 2,
      childrenPaying: 0,
      childrenFree: 0,
      infants: 0,
      flightOptions: [
        {
          id: 'preferred-flight',
          title: 'Preferred return flight',
          summary: '',
          adultPrice: 600,
          childPrice: 0,
          infantPrice: 0,
          isDefault: true,
        },
        {
          id: 'split-flight',
          title: 'Split outbound flight',
          summary: '',
          adultPrice: 335,
          childPrice: 0,
          infantPrice: 0,
        },
      ],
      linkedFlightGroups: [
        {
          id: 'split-return-leg',
          baseFlightOptionId: 'split-flight',
          routeLabel: 'Jeddah to London',
          defaultOptionId: 'split-return-default',
          options: [
            {
              id: 'split-return-default',
              airlineName: 'Return airline',
              summary: '',
              adultPrice: 285,
              childPrice: 0,
              infantPrice: 0,
              adultDelta: 0,
              childDelta: 0,
              infantDelta: 0,
              isDefault: true,
            },
          ],
        },
      ],
      visaOptions: [],
      transportOptions: [],
      limitedTimeOffers: [],
    })

    const deltas = getFlightOptionPriceDeltas(
      linkedPayload,
      linkedPayload.flightOptions[1],
      linkedPayload.flightOptions[0],
    )
    const splitSelection = resolvePackageSelection(linkedPayload, {
      ...getDefaultPackageSelection(linkedPayload),
      flightOptionId: 'split-flight',
    })
    const hotelTotal = splitSelection.combination.staySelections.reduce(
      (total, stay) => total + stay.option.price,
      0,
    )

    expect(deltas.adult).toBe(20)
    expect(splitSelection.combination.linkedFlightSelections).toHaveLength(1)
    expect(splitSelection.combination.grossPrice).toBe(hotelTotal + 2 * (335 + 285))
  })

  it('defaults quote expiry to 72 hours from now', () => {
    const now = Date.now()
    const expiresAt = getDefaultPackageExpiry()
    const diffHours = (new Date(expiresAt).getTime() - now) / (60 * 60 * 1000)

    expect(diffHours).toBeGreaterThan(71.9)
    expect(diffHours).toBeLessThanOrEqual(72)
    expect(isPackageQuoteExpired(expiresAt, now)).toBe(false)
    expect(isPackageQuoteExpired(new Date(now - 1000).toISOString(), now)).toBe(true)
  })

  it('preserves textarea spacing in component summaries', () => {
    const normalized = normalizePackageQuotePayload({
      ...payload,
      stayGroups: [
        {
          id: 'makkah',
          label: 'Makkah',
          options: [
            {
              id: 'mk-space',
              title: 'Makkah spaced',
              summary: 'Line one\n\n  Line two with leading space',
              price: 400,
            },
          ],
        },
        payload.stayGroups[1],
      ],
    })

    expect(normalized.stayGroups[0].options[0].summary).toBe(
      'Line one\n\n  Line two with leading space',
    )
  })

  it('uses generic location stays for holiday quotes and keeps Location 1 first', () => {
    const normalized = normalizePackageQuotePayload({
      packageType: 'holiday',
      stayGroups: [
        {
          id: 'location-1',
          label: 'Location 1',
          options: [{ id: 'loc-1-hotel', title: 'Beach resort', summary: '', price: 1200 }],
        },
        {
          id: 'location-2',
          label: 'Location 2',
          options: [{ id: 'loc-2-hotel', title: 'City hotel', summary: '', price: 800 }],
        },
      ],
      itineraryOrder: ['location-2', 'location-1', 'location-3'],
    })

    expect(normalized.packageType).toBe('holiday')
    expect(normalized.stayGroups.map((group) => group.label)).toEqual(['Location 1', 'Location 2'])
    expect(normalized.itineraryOrder[0]).toBe('location-1')
  })

  it('generates customer options for a single-location holiday quote', () => {
    const holidayPayload = normalizePackageQuotePayload({
      packageType: 'holiday',
      currency: 'GBP',
      adults: 2,
      childrenPaying: 0,
      stayGroups: [
        {
          id: 'location-1',
          label: 'Dubai',
          options: [
            {
              id: 'dubai-hotel',
              title: 'Dubai Marina Hotel',
              summary: '5 nights',
              price: 1600,
            },
          ],
        },
      ],
      flightOptions: [],
      visaOptions: [],
      transportOptions: [],
    })

    const options = buildCustomerPackageOptions(holidayPayload)

    expect(options).toHaveLength(1)
    expect(options[0].combination.staySelections).toHaveLength(1)
    expect(options[0].combination.staySelections[0].groupLabel).toBe('Dubai')
    expect(options[0].combination.totalPrice).toBe(1600)
  })

  it('preserves linked package group notes without exposing shared transport cost in copy', () => {
    const normalized = normalizePackageQuotePayload({
      ...payload,
      linkedPackageGroup: {
        groupId: 'group-1',
        groupReference: 'PTG-ABC123',
        title: 'Ali / Hussain Umrah',
        visibilityMode: 'linked_notice_only',
        currentFamilyLabel: 'Family Ali',
        sharedFlightSelection: true,
        linkedFamilies: [
          {
            packageId: 'package-2',
            familyLabel: 'Family Hussain',
            packageReference: 'PT-HUS123',
            customerVisible: true,
          },
        ],
        sharedServices: [
          {
            serviceType: 'transport',
            title: 'Shared transport',
            customerNote: 'Transport is shared with Family Hussain / PT-HUS123.',
            customerVisible: true,
          },
        ],
      },
    })

    const copy = formatPackageQuoteForCopy(normalized, 1, 'https://example.test/packages/token')

    expect(normalized.linkedPackageGroup?.groupReference).toBe('PTG-ABC123')
    expect(normalized.linkedPackageGroup?.sharedFlightSelection).toBe(true)
    expect(copy).toContain('Package URL: https://example.test/packages/token')
    expect(copy).toContain('* Transport is shared with Family Hussain / PT-HUS123.')
    expect(copy).not.toContain('allocated')
    expect(copy).not.toContain('internal')
  })

  it('charges under-5 passengers for per-person services but not hotel payer count', () => {
    const servicePayload: PackageQuotePayload = {
      ...payload,
      adults: 2,
      childrenPaying: 0,
      childrenFree: 1,
      infants: 0,
      stayGroups: [
        {
          id: 'makkah',
          label: 'Makkah',
          options: [{ id: 'mk-only', title: 'Makkah', summary: 'Makkah', price: 1000 }],
        },
      ],
      flightOptions: [
        {
          id: 'flight-pp',
          title: 'Per person flight',
          summary: 'Per person flight',
          price: 300,
          pricingMode: 'per_person',
        },
      ],
      visaOptions: [
        {
          id: 'visa-pp',
          title: 'Per person visa',
          summary: 'Per person visa',
          price: 50,
          pricingMode: 'per_person',
        },
      ],
      transportOptions: [
        {
          id: 'transport-total',
          title: 'Total transport',
          summary: 'Total transport',
          price: 200,
          pricingMode: 'total',
        },
      ],
    }

    const [combination] = buildPackageCombinations(servicePayload)

    expect(combination.payingGuests).toBe(2)
    expect(combination.servicePassengers).toBe(3)
    expect(combination.totalPrice).toBe(2250)
    expect(combination.perPersonPrice).toBe(1125)
  })

  it('preserves total transport mode and includes preferred transport in selections', () => {
    const transportPayload = normalizePackageQuotePayload({
      ...payload,
      adults: 2,
      childrenPaying: 0,
      childrenFree: 0,
      infants: 0,
      flightOptions: [],
      visaOptions: [],
      transportOptions: [
        {
          id: 'transport-total',
          title: 'Private transfer',
          summary: 'Private transfer',
          price: 300,
          pricingMode: 'total',
          isDefault: true,
        },
      ],
    })

    const resolved = resolvePackageSelection(transportPayload, {
      stayOptionIds: { makkah: 'mk-b', madinah: 'md-b' },
      paymentMethod: 'bank_transfer',
    })

    expect(transportPayload.transportOptions[0].pricingMode).toBe('total')
    expect(resolved.selection.transportOptionId).toBe('transport-total')
    expect(resolved.combination.transportOption?.pricingMode).toBe('total')
    expect(resolved.combination.totalPrice).toBe(925)
  })

  it('refreshes a converted package snapshot from corrected transport data', () => {
    const originalPayload = normalizePackageQuotePayload({
      ...payload,
      flightOptions: [],
      visaOptions: [],
      transportOptions: [
        {
          id: 'transport-selected',
          title: 'Private transport',
          summary: '* Jeddah Airport to Makkah Hotel (Car)',
          price: 300,
          pricingMode: 'total',
          isDefault: true,
          transportRoutes: [
            {
              id: 'route-selection-1',
              kind: 'transfer',
              routeId: 'jeddah-makkah',
              routeName: 'Jeddah Airport to Makkah Hotel',
              supplierId: 'supplier-1',
              supplierName: 'Supplier 1',
              vehicleTypeId: 'car',
              vehicleLabel: 'Car',
              costPrice: 100,
              currency: 'GBP',
              costPriceGbp: 100,
            },
          ],
        },
      ],
    })
    const originalSelection = resolvePackageSelection(originalPayload, {
      stayOptionIds: { makkah: 'mk-b', madinah: 'md-b' },
      transportOptionId: 'transport-selected',
      customerName: 'A Khan',
    })
    const originalQuote: TravelPackageQuote = {
      id: 'quote-transport-sync',
      title: originalPayload.title,
      package_type: originalPayload.packageType,
      status: 'converted',
      currency: originalPayload.currency,
      customer_name: 'A Khan',
      customer_phone: null,
      customer_email: null,
      payload: originalPayload,
      share_token: 'share-token',
      share_enabled: false,
      shared_at: null,
      expires_at: '2026-12-01T00:00:00.000Z',
      selected_option: originalSelection,
      selected_at: '2026-08-01T10:00:00.000Z',
      selection_note: 'Original selection',
      converted_package_id: 'package-1',
      converted_at: '2026-08-01T10:05:00.000Z',
      created_by: 'agent-1',
      created_at: '2026-08-01T09:00:00.000Z',
      updated_at: null,
    }
    const previousSnapshot = buildPackageSnapshot(
      originalQuote,
    ) as unknown as TravelPackageFolder['selected_quote_snapshot']
    const correctedPayload = normalizePackageQuotePayload({
      ...originalPayload,
      transportOptions: [
        {
          ...originalPayload.transportOptions[0],
          summary: '* Madinah Airport to Madinah Hotel (H1)',
          price: 420,
          transportRoutes: [
            {
              ...originalPayload.transportOptions[0].transportRoutes?.[0],
              routeId: 'madinah-airport-hotel',
              routeName: 'Madinah Airport to Madinah Hotel',
              vehicleTypeId: 'h1',
              vehicleLabel: 'H1',
              costPrice: 140,
              costPriceGbp: 140,
            },
          ],
        },
      ],
    })

    const refreshed = rebuildConvertedPackageSnapshot(
      {
        ...originalQuote,
        payload: correctedPayload,
        selected_option: null,
        selected_at: null,
        selection_note: null,
      },
      previousSnapshot,
    )

    expect(refreshed.selection.selection.transportOptionId).toBe('transport-selected')
    expect(refreshed.selection.combination.transportOption?.transportRoutes?.[0]).toMatchObject({
      routeId: 'madinah-airport-hotel',
      routeName: 'Madinah Airport to Madinah Hotel',
      vehicleTypeId: 'h1',
      vehicleLabel: 'H1',
    })
    expect(refreshed.selection.combination.transportOption?.price).toBe(420)
    expect(refreshed.publicSummary.totalPrice).toBe(refreshed.selection.combination.totalPrice)
    expect(refreshed.snapshot.quote.selected_at).toBe('2026-08-01T10:00:00.000Z')
  })

  it('calculates per-person transport mode for every passenger', () => {
    const transportPayload = normalizePackageQuotePayload({
      ...payload,
      adults: 2,
      childrenPaying: 0,
      childrenFree: 1,
      infants: 1,
      flightOptions: [],
      visaOptions: [],
      transportOptions: [
        {
          id: 'transport-pp',
          title: 'Shared transfer',
          summary: 'Shared transfer',
          price: 25,
          pricingMode: 'per_person',
          isDefault: true,
        },
      ],
    })

    const resolved = resolvePackageSelection(transportPayload, {
      stayOptionIds: { makkah: 'mk-b', madinah: 'md-b' },
      paymentMethod: 'bank_transfer',
    })

    expect(resolved.selection.transportOptionId).toBe('transport-pp')
    expect(resolved.combination.totalPrice).toBe(725)
  })

  it('formats alternative transport options with routes and vehicles for WhatsApp copy', () => {
    const transportPayload = normalizePackageQuotePayload({
      ...payload,
      adults: 2,
      childrenPaying: 1,
      childrenFree: 0,
      infants: 0,
      flightOptions: [],
      visaOptions: [],
      transportOptions: [
        {
          id: 'transport-car',
          title: 'Private car transport',
          summary: '',
          price: 300,
          pricingMode: 'total',
          isDefault: true,
          transportRoutes: [
            {
              id: 'route-1',
              kind: 'transfer',
              routeId: 'jeddah-makkah',
              routeName: 'Jeddah Airport to Makkah Hotel',
              supplierId: 'supplier-1',
              supplierName: 'Supplier 1',
              vehicleTypeId: 'car',
              vehicleLabel: 'Car',
              costPrice: 100,
              currency: 'GBP',
            },
          ],
        },
        {
          id: 'transport-h1',
          title: 'Upgrade to H1',
          summary: '',
          price: 390,
          pricingMode: 'total',
          transportRoutes: [
            {
              id: 'route-2',
              kind: 'transfer',
              routeId: 'jeddah-makkah',
              routeName: 'Jeddah Airport to Makkah Hotel',
              supplierId: 'supplier-1',
              supplierName: 'Supplier 1',
              vehicleTypeId: 'h1',
              vehicleLabel: 'H1',
              costPrice: 130,
              currency: 'GBP',
            },
          ],
        },
      ],
    })

    const copy = formatPackageQuoteForCopy(transportPayload)

    expect(copy).toContain('****Transport Included****')
    expect(copy).toContain('* Jeddah Airport to Makkah Hotel (Car)')
    expect(copy).toContain('****Alternative Transport Options****')
    expect(copy).toContain('*Upgrade to H1*')
    expect(copy).toContain('* Jeddah Airport to Makkah Hotel (H1)')
    expect(copy).toContain('Difference: +£30.00 p.p.')
  })

  it('applies active limited-time offers to the final package total', () => {
    const offerPayload: PackageQuotePayload = {
      ...payload,
      limitedTimeOffers: [
        {
          id: 'early-bird',
          title: 'Early bird offer',
          summary: 'Book today and save.',
          expiresAt: '2999-01-01T12:00:00.000Z',
          discountAmount: 120,
          discountMode: 'total',
          active: true,
        },
        {
          id: 'inactive-offer',
          title: 'Inactive offer',
          summary: '',
          expiresAt: '2999-01-01T12:00:00.000Z',
          discountAmount: 999,
          discountMode: 'total',
          active: false,
        },
      ],
    }

    const [combination] = buildPackageCombinations(offerPayload)
    const copy = formatPackageCombinationForCopy(offerPayload, combination, 1)

    expect(combination.grossPrice).toBe(1905)
    expect(combination.offerDiscountTotal).toBe(120)
    expect(combination.totalPrice).toBe(1785)
    expect(combination.appliedOffers.map((offer) => offer.id)).toEqual(['early-bird'])
    expect(copy).toContain('****EARLY BIRD OFFER****')
    expect(copy).toContain('*Discount Applied: -£120.00*')
    expect(copy).toContain('*Total Package Cost: £1,785.00*')
  })

  it('spreads package discounts evenly across all passenger price lines', () => {
    const offerPayload: PackageQuotePayload = {
      ...payload,
      infants: 1,
      limitedTimeOffers: [
        {
          id: 'family-saving',
          title: 'Family saving',
          summary: 'Save across every passenger.',
          expiresAt: '2999-01-01T12:00:00.000Z',
          discountAmount: 125,
          discountMode: 'total',
          active: true,
        },
      ],
    }

    const selection = getDefaultPackageSelection(offerPayload)
    const resolved = resolvePackageSelection(offerPayload, selection)
    const undiscounted = resolvePackageSelection(
      { ...offerPayload, limitedTimeOffers: [] },
      selection,
    )
    const breakdown = getPackagePassengerPriceBreakdown(offerPayload, resolved.combination)
    const undiscountedBreakdown = getPackagePassengerPriceBreakdown(
      { ...offerPayload, limitedTimeOffers: [] },
      undiscounted.combination,
    )

    const adultLine = breakdown.passengerLines?.find((line) => line.category === 'adult')
    const childFivePlusLine = breakdown.passengerLines?.find(
      (line) => line.category === 'child_5_plus',
    )
    const childTwoToFourLine = breakdown.passengerLines?.find(
      (line) => line.category === 'child_2_to_4',
    )
    const infantLine = breakdown.passengerLines?.find((line) => line.category === 'infant')
    const undiscountedAdultLine = undiscountedBreakdown.passengerLines?.find(
      (line) => line.category === 'adult',
    )
    const undiscountedChildFivePlusLine = undiscountedBreakdown.passengerLines?.find(
      (line) => line.category === 'child_5_plus',
    )
    const undiscountedChildTwoToFourLine = undiscountedBreakdown.passengerLines?.find(
      (line) => line.category === 'child_2_to_4',
    )
    const undiscountedInfantLine = undiscountedBreakdown.passengerLines?.find(
      (line) => line.category === 'infant',
    )

    expect(resolved.combination.offerDiscountTotal).toBe(125)
    expect(breakdown.total).toBeCloseTo(resolved.combination.totalPrice, 2)
    expect((undiscountedAdultLine?.unitPrice || 0) - (adultLine?.unitPrice || 0)).toBeCloseTo(25, 2)
    expect(
      (undiscountedChildFivePlusLine?.unitPrice || 0) - (childFivePlusLine?.unitPrice || 0),
    ).toBeCloseTo(25, 2)
    expect(
      (undiscountedChildTwoToFourLine?.unitPrice || 0) - (childTwoToFourLine?.unitPrice || 0),
    ).toBeCloseTo(25, 2)
    expect((undiscountedInfantLine?.unitPrice || 0) - (infantLine?.unitPrice || 0)).toBeCloseTo(
      25,
      2,
    )
  })

  it('applies a visa special discount only to the targeted passenger price line', () => {
    const visaDiscountPayload: PackageQuotePayload = {
      ...payload,
      adults: 2,
      childrenPaying: 0,
      childrenFree: 0,
      infants: 0,
      visaOptions: [
        {
          id: 'standard-visa',
          title: 'Standard visa',
          summary: '',
          price: 30,
          pricingMode: 'per_person',
          quantity: 1,
          visaPassengerCategory: 'adult',
        },
        {
          id: 'special-visa',
          title: 'Alternative visa',
          summary: '',
          price: 145,
          pricingMode: 'per_person',
          quantity: 1,
          visaPassengerCategory: 'adult',
        },
      ],
      limitedTimeOffers: [
        {
          id: 'visa-saving',
          title: 'Visa Special Discount',
          summary: 'Internal visa adjustment.',
          expiresAt: '2999-01-01T12:00:00.000Z',
          discountAmount: 45,
          discountMode: 'total',
          discountType: 'visa_special',
          eligibleServices: ['visa'],
          visaOptionId: 'special-visa',
          visaPassengerCategory: 'adult',
          visaQuantity: 1,
          active: true,
        },
      ],
    }

    const selection = getDefaultPackageSelection(visaDiscountPayload)
    const resolved = resolvePackageSelection(visaDiscountPayload, selection)
    const undiscounted = resolvePackageSelection(
      { ...visaDiscountPayload, limitedTimeOffers: [] },
      selection,
    )
    const breakdown = getPackagePassengerPriceBreakdown(visaDiscountPayload, resolved.combination)
    const copy = formatPackageQuoteForCopy(visaDiscountPayload)

    expect(resolved.combination.totalPrice).toBe(undiscounted.combination.totalPrice - 45)
    expect(breakdown.total).toBeCloseTo(resolved.combination.totalPrice, 2)
    expect(breakdown.passengerLines?.filter((line) => line.category === 'adult')).toHaveLength(2)
    expect(copy).not.toContain('VISA SPECIAL DISCOUNT')
    expect(copy).not.toContain('Internal visa adjustment')
  })

  it('uses preferred flights and tiered adult child infant pricing', () => {
    const tieredPayload: PackageQuotePayload = {
      ...payload,
      childrenFree: 0,
      infants: 1,
      flightOptions: [
        {
          id: 'flight-standard',
          title: 'Standard flights',
          summary: 'Standard flights',
          price: 0,
          pricingMode: 'per_person',
          isDefault: true,
          adultPrice: 600,
          childPrice: 500,
          infantPrice: 120,
        },
        {
          id: 'flight-direct',
          title: 'Direct flights',
          summary: 'Direct flights',
          price: 0,
          pricingMode: 'per_person',
          adultPrice: 700,
          childPrice: 575,
          infantPrice: 150,
        },
      ],
    }

    const selection = getDefaultPackageSelection(tieredPayload)
    const resolved = resolvePackageSelection(tieredPayload, selection)
    const breakdown = getPackagePassengerPriceBreakdown(tieredPayload, resolved.combination)

    expect(selection.flightOptionId).toBe('flight-standard')
    expect(resolved.combination.totalPrice).toBe(2900)
    expect(breakdown.adult).toBeCloseTo(928.33, 2)
    expect(breakdown.child).toBeCloseTo(828.33, 2)
    expect(breakdown.infant).toBe(215)
  })

  it('formats a single WhatsApp quote with defaults and option deltas', () => {
    const tieredPayload: PackageQuotePayload = {
      ...payload,
      title: 'September Umrah Package',
      childrenFree: 0,
      infants: 1,
      flightOptions: [
        {
          id: 'flight-standard',
          title: 'Standard flights',
          summary: 'Standard flights',
          price: 0,
          pricingMode: 'per_person',
          isDefault: true,
          adultPrice: 600,
          childPrice: 500,
          infantPrice: 120,
        },
        {
          id: 'flight-direct',
          title: 'Direct flights',
          summary: 'Direct flights',
          price: 0,
          pricingMode: 'per_person',
          adultPrice: 700,
          childPrice: 575,
          infantPrice: 150,
        },
      ],
    }

    const copy = formatPackageQuoteForCopy(tieredPayload)

    expect(copy).toContain('****September Umrah Package****')
    expect(copy).toContain('****Flight Included****')
    expect(copy).toContain('*Airline:* Standard flights')
    expect(copy).toContain('****Alternative Flights****')
    expect(copy).toContain('*Option 1 - Main Flight*')
    expect(copy).toContain('*Airline:* Direct flights')
    expect(copy).toContain('Difference: +£100.00 p.p.')
    expect(copy).toContain('----------------------------')
    expect(copy).toContain('Adult 12+:')
    expect(copy).toContain('Child 5+:')
    expect(copy).toContain('Infant under 2:')
    expect(copy).not.toContain('Total Package Cost')
  })

  it('formats all WhatsApp package options and shows hotel names before details', () => {
    const manyHotelPayload = normalizePackageQuotePayload({
      ...payload,
      flightOptions: [],
      visaOptions: [],
      transportOptions: [],
      stayGroups: [
        {
          id: 'makkah',
          label: 'Makkah',
          options: Array.from({ length: 13 }, (_, index) => ({
            id: `mk-${index + 1}`,
            title: `Hotel ${index + 1}`,
            summary: `29 Aug to 2 Sep\nRoom option ${index + 1}`,
            price: 500 + index,
          })),
        },
      ],
    })

    const copy = formatPackageQuoteForCopy(manyHotelPayload)

    expect(copy.match(/\*Option \d+\*/g)).toHaveLength(13)
    expect(copy).toContain('*Hotel 13*')
    expect(copy).toContain('Room option 13')
  })

  it('prices multiple visa types by quantity', () => {
    const mixedVisaPayload: PackageQuotePayload = {
      ...payload,
      adults: 9,
      childrenPaying: 0,
      childrenFree: 0,
      infants: 0,
      visaOptions: [
        {
          id: 'gb-eta',
          title: 'GB ETA',
          summary: 'GB ETA visa',
          price: 30,
          pricingMode: 'per_person',
          quantity: 8,
          visaPassengerCategory: 'adult',
        },
        {
          id: 'multi-entry',
          title: '1 year multiple entry',
          summary: 'Multiple entry visa with insurance',
          price: 145,
          pricingMode: 'per_person',
          quantity: 1,
          visaPassengerCategory: 'adult',
        },
      ],
    }

    const [combination] = buildPackageCombinations(mixedVisaPayload)
    const breakdown = getPackagePassengerPriceBreakdown(mixedVisaPayload, combination)
    const copy = formatPackageQuoteForCopy(mixedVisaPayload)

    expect(combination.visaOptions).toHaveLength(2)
    expect(combination.grossPrice).toBe(2090)
    expect(combination.totalPrice).toBe(2090)
    expect(breakdown.passengerLines).toHaveLength(2)
    expect(breakdown.passengerLines?.[0]).toMatchObject({
      category: 'adult',
      label: 'Adult 12+',
      quantity: 8,
    })
    expect(breakdown.passengerLines?.[0].unitPrice).toBeCloseTo(219.44, 2)
    expect(breakdown.passengerLines?.[0].total).toBeCloseTo(1755.56, 2)
    expect(breakdown.passengerLines?.[1]).toMatchObject({
      category: 'adult',
      label: 'Adult 12+',
      quantity: 1,
    })
    expect(breakdown.passengerLines?.[1].unitPrice).toBeCloseTo(334.44, 2)
    expect(breakdown.passengerLines?.[1].total).toBeCloseTo(334.44, 2)
    expect(copy).toContain('8 x Adult 12+: £219.44 p.p.')
    expect(copy).toContain('1 x Adult 12+: £334.44 p.p.')
    expect(copy).not.toContain('£30.00 p.p.')
    expect(copy).not.toContain('£145.00 p.p.')
  })

  it('adds card processing charges only when card is selected', () => {
    const bankSelection = resolvePackageSelection(payload, {
      ...getDefaultPackageSelection(payload),
      paymentMethod: 'bank_transfer',
    })
    const cardSelection = resolvePackageSelection(payload, {
      ...getDefaultPackageSelection(payload),
      paymentMethod: 'card',
    })

    expect(bankSelection.combination.paymentSurchargeTotal).toBe(0)
    expect(bankSelection.combination.totalPrice).toBe(1980)
    expect(cardSelection.combination.paymentSurchargeTotal).toBe(49.5)
    expect(cardSelection.combination.totalPrice).toBe(2029.5)
  })

  it('keeps deposit-only payment method separate from full package surcharge', () => {
    const depositSelection = resolvePackageSelection(
      {
        ...payload,
        depositRequired: true,
        depositAmount: 2000,
      },
      {
        ...getDefaultPackageSelection(payload),
        paymentIntent: 'deposit_only',
        paymentMethod: 'card',
        depositPaymentMethod: 'card',
      },
    )

    expect(depositSelection.selection.depositPaymentMethod).toBe('card')
    expect(depositSelection.combination.paymentMethod).toBe('bank_transfer')
    expect(depositSelection.combination.paymentSurchargeTotal).toBe(0)
    expect(depositSelection.combination.totalPrice).toBe(1980)
  })

  it('adds the configured Credit Card fee to deposit-only payable totals', () => {
    const depositPayload = {
      ...payload,
      cardProcessingFeePercent: 3,
      depositRequired: true,
      depositAmount: 1000,
    }

    const cardDeposit = getPackageDepositPaymentSummary(depositPayload, 'card')
    const bankDeposit = getPackageDepositPaymentSummary(depositPayload, 'bank_transfer')

    expect(cardDeposit.depositAmount).toBe(1000)
    expect(cardDeposit.processingFee).toBe(30)
    expect(cardDeposit.total).toBe(1030)
    expect(bankDeposit.processingFee).toBe(0)
    expect(bankDeposit.total).toBe(1000)
  })

  it('defaults new package quotes to a 3 percent Credit Card processing fee', () => {
    expect(normalizePackageQuotePayload({}).cardProcessingFeePercent).toBe(3)
  })
})
