import { expect, test } from '@playwright/test'
import { getSmokeConfig, loginForSmoke } from './helpers/auth'

test.describe('document storage smoke', () => {
  test('admin can view document migration overview', async ({ page }) => {
    await loginForSmoke(page)

    await page.goto('/dashboard/settings')
    await page.getByRole('button', { name: 'Document Storage' }).click()

    await expect(page.getByTestId('document-migration-overview')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Document Migration Overview' })).toBeVisible()
    await expect(page.getByText('Active Documents')).toBeVisible()
    await expect(page.getByText('On Primary')).toBeVisible()
    await expect(page.getByText('Awaiting Migration')).toBeVisible()
    await expect(page.getByText('Recent Fallback Documents')).toBeVisible()
  })

  test('family document hub shows status and upload zones', async ({ page }) => {
    const config = getSmokeConfig()
    await loginForSmoke(page)

    await page.goto(`/dashboard/applications/nadra/documents/${config.familyHeadId}`)

    await expect(page.getByTestId('document-hub')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Document Management' })).toBeVisible()
    await expect(page.getByTestId('document-storage-status')).toBeVisible()
    await expect(page.getByText('Main Documents')).toBeVisible()
    await expect(page.getByText('Receipts')).toBeVisible()
    await expect(page.getByText('Application Review')).toBeVisible()
  })

  test('manual batch migration can be triggered when explicitly enabled', async ({ page }) => {
    const config = getSmokeConfig()
    test.skip(
      !config.runBatchMutation,
      'Set SMOKE_RUN_BATCH=true to allow this mutating smoke test.',
    )

    await loginForSmoke(page)
    await page.goto('/dashboard/settings')
    await page.getByRole('button', { name: 'Document Storage' }).click()

    const batchButton = page.getByRole('button', { name: 'Run Batch Migration' })
    await expect(batchButton).toBeVisible()

    if (await batchButton.isDisabled()) {
      await expect(
        page.getByText(/Primary storage is offline|Both storage paths are currently unavailable/),
      ).toBeVisible()
      return
    }

    await batchButton.click()
    await expect(page.getByText('Migration Activity')).toBeVisible()
    await expect(page.getByText('Last batch')).toBeVisible()
  })
})
