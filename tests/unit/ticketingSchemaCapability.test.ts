import { describe, expect, it } from 'vitest'
import {
  hasTicketingSchemaCapability,
  normalizeTicketingSchemaStatus,
} from '@/lib/ticketing/schemaCapability'

describe('Ticketing schema capability normalization', () => {
  it.each([
    { ready: true, version: 2026082403 },
    [{ ready: true, version: 2026082403 }],
    [{ ready: true, version: '2026082403' }],
  ])('accepts an object or singleton-array status: %j', (status) => {
    expect(normalizeTicketingSchemaStatus(status)).toEqual({
      ready: true,
      version: 2026082403,
    })
    expect(hasTicketingSchemaCapability(status, 2026082403)).toBe(true)
  })

  it.each([
    null,
    {},
    { ready: 'true', version: 2026082403 },
    { ready: true, version: '' },
    { ready: true, version: 2026082403.5 },
    [],
    [
      { ready: true, version: 2026082403 },
      { ready: true, version: 2026082403 },
    ],
    [[{ ready: true, version: 2026082403 }]],
  ])('fails closed for a malformed or non-singleton status: %j', (status) => {
    expect(normalizeTicketingSchemaStatus(status)).toBeNull()
    expect(hasTicketingSchemaCapability(status, 2026082403)).toBe(false)
  })

  it('fails closed for a stale or explicitly unready capability', () => {
    expect(hasTicketingSchemaCapability({ ready: true, version: 2026082402 }, 2026082403)).toBe(
      false,
    )
    expect(hasTicketingSchemaCapability({ ready: false, version: 2026082403 }, 2026082403)).toBe(
      false,
    )
  })
})
