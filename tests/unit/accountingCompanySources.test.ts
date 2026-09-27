import { describe, expect, it, vi } from 'vitest'
import {
  loadCompanyLmsLiveSummary,
  loadCompanySupplierLiveSummary,
} from '@/lib/accounting/companySources'

describe('Accounting company-wide live sources', () => {
  it('reads global LMS totals without turning them into branch values', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        accounts: [],
        stats: {
          totalOutstanding: '1450.50',
          activeAccounts: 9,
          overdueAccounts: 2,
          dueSoonAccounts: 3,
          totalAccounts: 12,
        },
        pagination: { page: 1, limit: 1, total: 12, pages: 12 },
      },
      error: null,
    })

    const summary = await loadCompanyLmsLiveSummary({ rpc } as never)

    expect(rpc).toHaveBeenCalledWith('lms_list_accounts', {
      p_filter: 'all',
      p_account_id: null,
      p_page: 1,
      p_limit: 1,
    })
    expect(summary).toMatchObject({
      available: true,
      totalOutstanding: 1450.5,
      activeAccounts: 9,
      overdueAccounts: 2,
      dueSoonAccounts: 3,
      totalAccounts: 12,
      sourcePath: '/dashboard/lms',
    })
  })

  it('keeps the ledger available when LMS totals cannot be loaded', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: '42883' } })

    const summary = await loadCompanyLmsLiveSummary({ rpc } as never)

    expect(summary).toMatchObject({
      available: false,
      totalOutstanding: 0,
      warning: 'The live LMS company summary could not be loaded.',
    })
  })

  it('aggregates supplier deposit positions across branches without copying them into a branch', async () => {
    const tableData: Record<string, { data: unknown[] | null; error: unknown }> = {
      pos_supplier_profiles: {
        data: [
          {
            supplier_vendor_id: 'supplier-1',
            is_active: true,
            settlement_mode: 'DEPOSIT_ACCOUNT',
            supplier_vendors: { name: 'Supplier One' },
          },
          {
            supplier_vendor_id: 'supplier-2',
            is_active: true,
            settlement_mode: 'PAY_ON_DEMAND',
            supplier_vendors: { name: 'Supplier Two' },
          },
        ],
        error: null,
      },
      pos_supplier_balance_entries: {
        data: [
          {
            supplier_vendor_id: 'supplier-1',
            location_id: 'branch-a',
            balance_delta: '1000.00',
            supplier_vendors: { name: 'Supplier One' },
          },
          {
            supplier_vendor_id: 'supplier-1',
            location_id: 'branch-b',
            balance_delta: 500,
            supplier_vendors: { name: 'Supplier One' },
          },
          {
            supplier_vendor_id: 'supplier-1',
            location_id: 'branch-a',
            balance_delta: -200,
            supplier_vendors: { name: 'Supplier One' },
          },
          {
            supplier_vendor_id: 'supplier-2',
            location_id: 'branch-b',
            balance_delta: -50,
            supplier_vendors: { name: 'Supplier Two' },
          },
        ],
        error: null,
      },
    }
    const from = vi.fn((table: string) => ({
      select: vi.fn(() => {
        const query = {
          order: vi.fn(() => query),
          range: vi.fn(() => Promise.resolve(tableData[table])),
        }
        return query
      }),
    }))

    const summary = await loadCompanySupplierLiveSummary(
      { from } as never,
      '2026-09-28T10:00:00.000Z',
    )

    expect(from).toHaveBeenCalledWith('pos_supplier_profiles')
    expect(from).toHaveBeenCalledWith('pos_supplier_balance_entries')
    expect(summary).toMatchObject({
      available: true,
      netBalance: 1250,
      heldBalance: 1300,
      amountDue: 50,
      suppliersWithBalance: 2,
      depositAccountCount: 1,
      locationsWithActivity: 2,
      sourcePath: '/dashboard/pos',
    })
    expect(summary.suppliers).toEqual([
      expect.objectContaining({
        id: 'supplier-1',
        name: 'Supplier One',
        balance: 1300,
        locationCount: 2,
      }),
      expect.objectContaining({
        id: 'supplier-2',
        name: 'Supplier Two',
        balance: -50,
        locationCount: 1,
      }),
    ])
  })

  it('keeps the manual company controls available when live supplier data fails', async () => {
    const from = vi.fn((table: string) => ({
      select: vi.fn(() => {
        const query = {
          order: vi.fn(() => query),
          range: vi.fn(() =>
            Promise.resolve(
              table === 'pos_supplier_profiles'
                ? { data: null, error: { code: '42P01' } }
                : { data: [], error: null },
            ),
          ),
        }
        return query
      }),
    }))

    const summary = await loadCompanySupplierLiveSummary({ from } as never)

    expect(summary).toMatchObject({
      available: false,
      netBalance: 0,
      suppliers: [],
      warning: 'The live company-wide supplier balance summary could not be loaded.',
    })
  })
})
