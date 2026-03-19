import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const from = vi.fn()
  const createClient = vi.fn(() => ({ from }))
  return { from, createClient }
})

vi.mock('@supabase/supabase-js', () => ({
  createClient: mocks.createClient,
}))

import { POST } from '@/app/api/lms/delete-installment-plan/route'

describe('/api/lms/delete-installment-plan route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 400 when transactionId is missing', async () => {
    const request = new Request('http://localhost/api/lms/delete-installment-plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })

    const response = await POST(request)
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload).toEqual({ error: 'Transaction ID is required' })
    expect(mocks.from).not.toHaveBeenCalled()
  })

  it('returns 500 when transaction is not found', async () => {
    const single = vi.fn(async () => ({ data: null, error: { message: 'not found' } }))
    const eq = vi.fn(() => ({ single }))
    const select = vi.fn(() => ({ eq }))

    mocks.from.mockImplementation((table: string) => {
      if (table !== 'loan_transactions') {
        throw new Error(`Unexpected table in transaction lookup: ${table}`)
      }
      return { select }
    })

    const request = new Request('http://localhost/api/lms/delete-installment-plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transactionId: 'tx-404' }),
    })

    const response = await POST(request)
    const payload = await response.json()

    expect(response.status).toBe(500)
    expect(payload.error).toBe('Transaction not found')
  })

  it('deletes plan records and updates loan balance successfully', async () => {
    const loanUpdateEq = vi.fn(async () => ({ error: null }))
    const loanUpdate = vi.fn(() => ({ eq: loanUpdateEq }))
    const loanSingle = vi.fn(async () => ({
      data: { current_balance: '1000', total_debt_amount: '1200', status: 'Active' },
      error: null,
    }))
    const loanEq = vi.fn(() => ({ single: loanSingle }))
    const loanSelect = vi.fn(() => ({ eq: loanEq }))

    const transactionDeleteEq = vi.fn(async () => ({ error: null }))
    const transactionDelete = vi.fn(() => ({ eq: transactionDeleteEq }))

    const transactionSingle = vi.fn(async () => ({
      data: { loan_id: 'loan-1', amount: '300' },
      error: null,
    }))
    const transactionEq = vi.fn(() => ({ single: transactionSingle }))
    const transactionSelect = vi.fn(() => ({ eq: transactionEq }))

    const installmentsDeleteEq = vi.fn(async () => ({ error: null }))
    const installmentsDelete = vi.fn(() => ({ eq: installmentsDeleteEq }))

    const linksDeleteEq = vi.fn(async () => ({ error: null }))
    const linksDelete = vi.fn(() => ({ eq: linksDeleteEq }))

    mocks.from.mockImplementation((table: string) => {
      if (table === 'loan_transactions') {
        return {
          select: transactionSelect,
          delete: transactionDelete,
        }
      }
      if (table === 'loan_installments') {
        return { delete: installmentsDelete }
      }
      if (table === 'loan_package_links') {
        return { delete: linksDelete }
      }
      if (table === 'loans') {
        return {
          select: loanSelect,
          update: loanUpdate,
        }
      }
      throw new Error(`Unexpected table: ${table}`)
    })

    const request = new Request('http://localhost/api/lms/delete-installment-plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transactionId: 'tx-1' }),
    })

    const response = await POST(request)
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toEqual({ deletedTransactionId: 'tx-1' })

    expect(installmentsDeleteEq).toHaveBeenCalledWith('loan_transaction_id', 'tx-1')
    expect(linksDeleteEq).toHaveBeenCalledWith('loan_transaction_id', 'tx-1')
    expect(transactionDeleteEq).toHaveBeenCalledWith('id', 'tx-1')
    expect(loanEq).toHaveBeenCalledWith('id', 'loan-1')
    expect(loanUpdate).toHaveBeenCalledWith({
      current_balance: 700,
      total_debt_amount: 900,
      status: 'Active',
    })
    expect(loanUpdateEq).toHaveBeenCalledWith('id', 'loan-1')
  })
})
