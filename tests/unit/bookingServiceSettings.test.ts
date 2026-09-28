import { describe, expect, it } from 'vitest'

import {
  getBookingServicePortalSettingsError,
  isBookingServiceSchemaError,
  isMissingBookingServiceTimingColumns,
  validateBookingServiceTemplates,
} from '@/lib/bookingServiceSettings'

describe('booking service settings contract', () => {
  it('accepts valid customer portal controls and rejects invalid bounds', () => {
    expect(
      getBookingServicePortalSettingsError({
        customer_visible: true,
        customer_description: 'Bring your supporting documents.',
        customer_max_group_size: 4,
        customer_modification_cutoff_hours: 48,
      }),
    ).toBeNull()

    expect(getBookingServicePortalSettingsError({ customer_max_group_size: 0 })).toContain(
      '1 to 100',
    )
    expect(
      getBookingServicePortalSettingsError({ customer_modification_cutoff_hours: 169 }),
    ).toContain('0 to 168')
    expect(
      getBookingServicePortalSettingsError({ customer_description: 'x'.repeat(1001) }),
    ).toContain('1000 characters')
  })

  it('validates every service email through the shared booking template rules', () => {
    expect(
      validateBookingServiceTemplates({
        confirmation_template: 'Hello [Customer Name]',
        modification_template: null,
        cancellation_template: '',
      }),
    ).toEqual([])

    expect(
      validateBookingServiceTemplates({
        confirmation_template: 'Hello [Unknown Detail]',
        modification_template: 'Changed [Another Unknown Detail]',
      }),
    ).toEqual([
      { field: 'confirmation_template', invalidTokens: ['[Unknown Detail]'] },
      { field: 'modification_template', invalidTokens: ['[Another Unknown Detail]'] },
    ])
  })

  it('keeps schema fallback detection identical for collection and item routes', () => {
    expect(isBookingServiceSchemaError({ code: '42703' })).toBe(true)
    expect(isBookingServiceSchemaError({ code: '23505' })).toBe(false)

    expect(
      isMissingBookingServiceTimingColumns({
        message: "Could not find the 'close_overrun_tolerance_minutes' column in the schema cache",
      }),
    ).toBe(true)
    expect(
      isMissingBookingServiceTimingColumns({
        message: "Could not find the 'customer_visible' column in the schema cache",
      }),
    ).toBe(false)
  })
})
