import { expect, test } from '@playwright/test'

type LmsListPayload = {
  accounts?: Array<{ id?: string }>
  stats?: Record<string, unknown>
  pagination?: {
    page?: number
    limit?: number
    total?: number
    pages?: number
  }
}

test.describe('LMS workflow smoke', () => {
  test('staff can open LMS and retrieve a bounded account page', async ({ page, request }) => {
    await page.goto('/dashboard/lms')
    await expect(page.getByRole('heading', { name: 'Loan Management' })).toBeVisible()

    const response = await request.get('/api/lms?filter=all&page=1&limit=5')
    expect(response.status()).toBe(200)

    const payload = (await response.json()) as LmsListPayload
    expect(Array.isArray(payload.accounts)).toBeTruthy()
    expect(payload.accounts?.length ?? 0).toBeLessThanOrEqual(5)
    expect(payload.stats).toEqual(expect.any(Object))
    expect(payload.pagination).toMatchObject({ page: 1, limit: 5 })
    expect(payload.pagination?.total).toEqual(expect.any(Number))
    expect(payload.pagination?.pages).toEqual(expect.any(Number))
  })

  test('LMS rejects an unknown action without mutating data', async ({ request }) => {
    const response = await request.post('/api/lms', {
      data: { action: 'smoke_test_invalid_action' },
    })

    expect(response.status()).toBe(400)
    await expect(response.json()).resolves.toMatchObject({ error: 'Invalid action' })
  })

  test('configured LMS account can be read directly', async ({ request }) => {
    const accountId = process.env.SMOKE_LMS_ACCOUNT_ID || ''
    test.skip(!accountId, 'Set SMOKE_LMS_ACCOUNT_ID to exercise direct account lookup.')

    const response = await request.get(
      `/api/lms?filter=all&accountId=${encodeURIComponent(accountId)}&page=1&limit=1`,
    )
    expect(response.status()).toBe(200)

    const payload = (await response.json()) as LmsListPayload
    expect(payload.accounts).toHaveLength(1)
    expect(payload.accounts?.[0]?.id).toBe(accountId)
  })
})
