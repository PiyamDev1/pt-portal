import { expect, Page } from '@playwright/test'

function requireEnv(name: string) {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing required smoke env var: ${name}`)
  }
  return value
}

export function getSmokeConfig() {
  return {
    email: requireEnv('SMOKE_USER_EMAIL'),
    password: requireEnv('SMOKE_USER_PASSWORD'),
    branchCode: requireEnv('SMOKE_USER_BRANCH_CODE'),
    familyHeadId: requireEnv('SMOKE_FAMILY_HEAD_ID'),
    backupCode: process.env.SMOKE_2FA_BACKUP_CODE || '',
    runBatchMutation: process.env.SMOKE_RUN_BATCH === 'true',
  }
}

export async function loginForSmoke(page: Page) {
  const config = getSmokeConfig()

  await page.goto('/login')
  await page.locator('input[type="email"]').first().fill(config.email)
  await page.locator('input[type="password"]').first().fill(config.password)
  await page.locator('input[placeholder="e.g. HQ-001"]').first().fill(config.branchCode)
  await page.getByRole('button', { name: 'Next Step' }).click()

  await page.waitForLoadState('networkidle')

  if (page.url().includes('/login/verify-2fa')) {
    if (!config.backupCode) {
      throw new Error(
        '2FA verification is enabled for smoke user. Set SMOKE_2FA_BACKUP_CODE in secrets.',
      )
    }

    await page.getByRole('button', { name: 'Use backup code' }).click()
    await page.locator('input[placeholder="Backup code"]').first().fill(config.backupCode)
    await page.getByRole('button', { name: 'Verify with Backup Code' }).click()
    await page.waitForLoadState('networkidle')
  }

  await expect(page.locator('text=Login failed')).toHaveCount(0)
  await expect(page.locator('text=Access Denied')).toHaveCount(0)
}
