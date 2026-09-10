import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260910190000_pos_loyalty_voucher_settlement.sql'),
  'utf8',
)

describe('POS loyalty voucher settlement migration', () => {
  it('redeems a locked voucher atomically with the POS transaction', () => {
    expect(sql).toContain('create or replace function public.pos_post_transaction_v5')
    expect(sql).toContain('for update;')
    expect(sql).toContain("set status = 'redeemed'")
    expect(sql).toContain('redeemed_transaction_id = transaction_id_value')
    expect(sql).toContain("'loyalty.voucher_redeemed'")
  })

  it('reserves OTHER tenders for server-created vouchers and protects refunds', () => {
    expect(sql).toContain('POS_VOUCHER_TENDER_FORBIDDEN')
    expect(sql).toContain('create or replace function public.pos_record_refund_v2')
    expect(sql).toContain("tender.external_reference ~ '^PYV-[A-F0-9]{20}$'")
    expect(sql).toContain('revoke all on function public.pos_post_transaction_v4')
    expect(sql).toContain('grant execute on function public.pos_post_transaction_v5')
  })

  it('records the no-refund forfeiture when face value exceeds the sale', () => {
    expect(sql).toContain('least(voucher_row.value_pence, total_pence_value)')
    expect(sql).toContain("'loyaltyVoucherForfeitedPence'")
    expect(sql).toContain("'voucherForfeitedPence'")
  })
})
