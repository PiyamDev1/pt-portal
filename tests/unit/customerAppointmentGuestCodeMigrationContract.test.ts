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

const repairSql = readFileSync(
  resolve(
    process.cwd(),
    'supabase/migrations/20260910171757_repair_appointment_guest_code_default.sql',
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

  it('repairs inserts without exposing the guest-code generator as an RPC', () => {
    expect(repairSql).toContain('alter column customer_guest_code set default (')
    expect(repairSql).toContain("'VISIT-' || upper(substr(replace(gen_random_uuid()::text")
    expect(repairSql).toContain(
      'drop function if exists public.generate_customer_appointment_guest_code()',
    )
    expect(repairSql).not.toContain('grant execute')
  })
})
