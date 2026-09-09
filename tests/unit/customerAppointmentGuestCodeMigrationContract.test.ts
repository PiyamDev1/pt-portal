import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const sql = readFileSync(
  resolve(
    process.cwd(),
    'supabase/migrations/20260909212744_customer_appointment_contact_sync.sql',
  ),
  'utf8',
)

describe('customer appointment guest-code migration contract', () => {
  it('backfills an opaque unique code for old and new appointments', () => {
    expect(sql).toContain("select 'VISIT-' || upper(")
    expect(sql).toContain('where customer_guest_code is null')
    expect(sql).toContain('alter column customer_guest_code set not null')
    expect(sql).toContain('create unique index if not exists bookings_customer_guest_code_uq')
  })

  it('does not expose the code generator to browser roles', () => {
    expect(sql).toContain('from public, anon, authenticated, service_role')
  })
})
