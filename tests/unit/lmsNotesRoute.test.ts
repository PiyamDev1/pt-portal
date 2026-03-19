import { beforeEach, describe, expect, it, vi } from 'vitest'

type QueryResult<T> = Promise<{ data: T; error: unknown }>

const mocks = vi.hoisted(() => {
  const from = vi.fn()
  const createClient = vi.fn(() => ({ from }))
  return { from, createClient }
})

vi.mock('@supabase/supabase-js', () => ({
  createClient: mocks.createClient,
}))

import { DELETE, GET, POST } from '@/app/api/lms/notes/route'

describe('/api/lms/notes route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('GET returns 400 when accountId is missing', async () => {
    const response = await GET(new Request('http://localhost/api/lms/notes'))
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload).toEqual({ error: 'Account ID required' })
    expect(mocks.from).not.toHaveBeenCalled()
  })

  it('GET returns formatted notes for valid accountId', async () => {
    const getResult: QueryResult<
      Array<{
        id: string
        note: string
        created_by: string
        created_at: string
        employees: { full_name: string }
      }>
    > = Promise.resolve({
      data: [
        {
          id: 'n1',
          note: 'First note',
          created_by: 'emp-1',
          created_at: '2026-03-17T00:00:00.000Z',
          employees: { full_name: 'Alex' },
        },
      ],
      error: null,
    })

    mocks.from.mockImplementation((table: string) => {
      if (table !== 'loan_account_notes') throw new Error('Unexpected table')
      return {
        select: () => ({
          eq: () => ({
            order: () => getResult,
          }),
        }),
      }
    })

    const response = await GET(new Request('http://localhost/api/lms/notes?accountId=acct-1'))
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toEqual({
      notes: [
        {
          id: 'n1',
          note: 'First note',
          created_by: 'emp-1',
          created_at: '2026-03-17T00:00:00.000Z',
          employee_name: 'Alex',
        },
      ],
    })
  })

  it('POST returns 400 when required fields are missing', async () => {
    const request = new Request('http://localhost/api/lms/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountId: 'acct-1', note: '' }),
    })

    const response = await POST(request)
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload).toEqual({ error: 'Missing required fields' })
    expect(mocks.from).not.toHaveBeenCalled()
  })

  it('POST creates note and returns formatted payload', async () => {
    const postResult: QueryResult<{
      id: string
      note: string
      created_by: string
      created_at: string
      employees: { full_name: string }
    }> = Promise.resolve({
      data: {
        id: 'n2',
        note: 'Created note',
        created_by: 'emp-2',
        created_at: '2026-03-17T01:00:00.000Z',
        employees: { full_name: 'Casey' },
      },
      error: null,
    })

    mocks.from.mockImplementation((table: string) => {
      if (table !== 'loan_account_notes') throw new Error('Unexpected table')
      return {
        insert: () => ({
          select: () => ({
            single: () => postResult,
          }),
        }),
      }
    })

    const request = new Request('http://localhost/api/lms/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountId: 'acct-1', note: ' Created note ', employeeId: 'emp-2' }),
    })

    const response = await POST(request)
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toEqual({
      note: {
        id: 'n2',
        note: 'Created note',
        created_by: 'emp-2',
        created_at: '2026-03-17T01:00:00.000Z',
        employee_name: 'Casey',
      },
    })
  })

  it('DELETE returns 400 when noteId is missing', async () => {
    const response = await DELETE(new Request('http://localhost/api/lms/notes'))
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload).toEqual({ error: 'Note ID required' })
    expect(mocks.from).not.toHaveBeenCalled()
  })

  it('DELETE removes note when noteId is provided', async () => {
    const deleteResult: QueryResult<null> = Promise.resolve({ data: null, error: null })

    mocks.from.mockImplementation((table: string) => {
      if (table !== 'loan_account_notes') throw new Error('Unexpected table')
      return {
        delete: () => ({
          eq: () => deleteResult,
        }),
      }
    })

    const response = await DELETE(new Request('http://localhost/api/lms/notes?noteId=n-1'))
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toEqual({ deletedNoteId: 'n-1' })
  })
})
