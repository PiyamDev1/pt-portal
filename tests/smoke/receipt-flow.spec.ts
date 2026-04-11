import { expect, test } from '@playwright/test'
import { loginForSmoke } from './helpers/auth'

test.describe('receipt flow smoke', () => {
  test('nadra receipt generate/share/verify/list roundtrip', async ({ page }) => {
    const nadraId = process.env.SMOKE_RECEIPT_NADRA_ID || ''
    const runMutation = process.env.SMOKE_RUN_RECEIPT_MUTATION === 'true'

    test.skip(!runMutation, 'Set SMOKE_RUN_RECEIPT_MUTATION=true to allow this mutating smoke test.')
    test.skip(!nadraId, 'Set SMOKE_RECEIPT_NADRA_ID for receipt smoke flow.')

    await loginForSmoke(page)

    const generateResponse = await page.request.post('/api/receipts/generate', {
      data: {
        serviceType: 'nadra',
        serviceRecordId: nadraId,
        receiptType: 'submission',
      },
    })

    expect(generateResponse.ok()).toBeTruthy()
    const generatePayload = await generateResponse.json()
    expect(generatePayload?.receipt?.id).toBeTruthy()
    expect(generatePayload?.receipt?.trackingNumber).toBeTruthy()
    expect(generatePayload?.receipt?.receiptPin).toBeTruthy()

    const shareResponse = await page.request.post('/api/receipts/share', {
      data: {
        receiptId: generatePayload.receipt.id,
        channel: 'smoke-test',
      },
    })

    expect(shareResponse.ok()).toBeTruthy()

    const verifyResponse = await page.request.post('/api/receipts/verify', {
      data: {
        trackingNumber: generatePayload.receipt.trackingNumber,
        receiptPin: generatePayload.receipt.receiptPin,
      },
    })

    expect(verifyResponse.ok()).toBeTruthy()
    const verifyPayload = await verifyResponse.json()
    expect(verifyPayload.valid).toBeTruthy()

    const listResponse = await page.request.get(
      `/api/receipts/list?applicantId=${encodeURIComponent(generatePayload.receipt.applicantId)}&serviceType=nadra`,
    )

    expect(listResponse.ok()).toBeTruthy()
    const listPayload = await listResponse.json()
    expect(Array.isArray(listPayload.receipts)).toBeTruthy()
    expect(listPayload.receipts.length).toBeGreaterThan(0)
  })
})
