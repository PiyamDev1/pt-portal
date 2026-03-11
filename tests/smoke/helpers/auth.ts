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
    runBatchMutation: process.env.SMOKE_RUN_BATCH === 'true',
  }
}

export async function loginForSmoke(page: Page) {
  const config = getSmokeConfig()

  await page.goto('/login')
  await page.getByLabel('Email').fill(config.email)
  await page.getByLabel('Password').fill(config.password)
  await page.getByLabel('Branch Code').fill(config.branchCode)
  await page.getByRole('button', { name: 'Next Step' }).click()

  await page.waitForLoadState('networkidle')
  await expect(page.locator('text=Login failed')).toHaveCount(0)
  await expect(page.locator('text=Access Denied')).toHaveCount(0)
}