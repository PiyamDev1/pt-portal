import { expect, test } from '@playwright/test'

test.describe('security boundary smoke', () => {
  test('sensitive staff APIs reject an unauthenticated browser context', async ({
    baseURL,
    browser,
  }) => {
    const context = await browser.newContext({ baseURL })

    try {
      const checks = [
        {
          label: 'LMS account data',
          response: await context.request.get('/api/lms?filter=all&page=1&limit=1'),
        },
        {
          label: 'package quote inventory',
          response: await context.request.get('/api/packages'),
        },
        {
          label: 'direct document upload',
          response: await context.request.post('/api/documents/upload-direct'),
        },
        {
          label: '2FA reset',
          response: await context.request.post('/api/auth/reset-2fa', { data: {} }),
        },
      ]

      for (const { label, response } of checks) {
        expect(response.status(), `${label} should require authentication`).toBe(401)
        await expect(response.json()).resolves.toMatchObject({ error: 'Unauthorized' })
      }
    } finally {
      await context.close()
    }
  })

  test('an authenticated 2FA reset rejects an empty verification payload', async ({ request }) => {
    const response = await request.post('/api/auth/reset-2fa', { data: {} })

    expect(response.status()).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringMatching(/verification code|required|invalid/i),
    })
  })
})
