import { expect, test } from '@playwright/test'

type PackageListPayload = {
  packages?: unknown[]
  setupRequired?: boolean
}

type PublicPackagePayload = {
  quote?: {
    id?: string
    title?: string
    payload?: unknown
  }
}

test.describe('package workflow smoke', () => {
  test('staff can open package operations and list quotations', async ({ page, request }) => {
    const response = await request.get('/api/packages')
    expect(response.status()).toBe(200)

    const payload = (await response.json()) as PackageListPayload
    expect(Array.isArray(payload.packages)).toBeTruthy()
    expect(typeof payload.setupRequired).toBe('boolean')

    await page.goto('/dashboard/packages')
    await expect(page.getByRole('heading', { name: 'Package operations' })).toBeVisible()
    await expect(page).not.toHaveURL(/\/login(?:\/|$|\?)/)
  })

  test('configured customer share works without a staff session', async ({ baseURL, browser }) => {
    const token = process.env.SMOKE_PACKAGE_SHARE_TOKEN || ''
    test.skip(!token, 'Set SMOKE_PACKAGE_SHARE_TOKEN to exercise a live customer package link.')

    const context = await browser.newContext({ baseURL })

    try {
      const response = await context.request.get(`/api/packages/share/${encodeURIComponent(token)}`)
      expect(response.status()).toBe(200)

      const payload = (await response.json()) as PublicPackagePayload
      expect(payload.quote?.id).toEqual(expect.any(String))
      expect(payload.quote?.title).toEqual(expect.any(String))
      expect(payload.quote?.payload).toBeTruthy()

      const page = await context.newPage()
      await page.goto(`/packages/${encodeURIComponent(token)}`)
      await expect(page.getByText('Piyam Travel package quote')).toBeVisible()
      await expect(page.getByRole('heading', { name: payload.quote?.title })).toBeVisible()
      await expect(page.getByText('Package quote unavailable')).toHaveCount(0)
      await expect(page).not.toHaveURL(/\/login(?:\/|$|\?)/)
    } finally {
      await context.close()
    }
  })
})
