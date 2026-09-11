import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260911020000_connect_loyalty_campaign_hooks.sql'),
  'utf8',
)

describe('loyalty campaign award hooks', () => {
  it('connects campaigns to POS and customer-safe source awards', () => {
    expect(sql).toContain('customer_loyalty_apply_sale_campaigns_v1')
    expect(sql).toContain(
      "campaign.event_type in ('double_points','fixed_bonus','welcome_bonus','off_peak_bonus')",
    )
    expect(sql).toContain('campaign.minimum_spend_pence <= coalesce(p_spend_pence, 0)')
    expect(sql).toContain('member_awards >= campaign_row.max_awards_per_customer')
    expect(sql).toContain('campaign_points + bonus_points_value > campaign_row.total_points_budget')
    expect(sql).toContain('customer_loyalty_manage_program_v3')
    expect(sql).toContain('pos_post_transaction_v6')
  })

  it('keeps awards idempotent, reversible and private', () => {
    expect(sql).toContain('customer_loyalty_sale_campaign_awards')
    expect(sql).toContain('customer_loyalty_reverse_sale_campaigns_v1')
    expect(sql).toContain('tracked.qualifying_source_reference = new.source_reference')
    expect(sql).toContain('from public, anon, authenticated, service_role;')
    expect(sql).toContain('grant execute on function public.pos_post_transaction_v6')
  })
})
