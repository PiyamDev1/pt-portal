import { expect, Page } from '@playwright/test'
import { generateSmokeTotp } from './totp'

function requireEnv(name: string) {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing required smoke env var: ${name}`)
  }
  return value
}

export function getSmokeConfig() {
  return {
    ...getSmokeAuthConfig(),
    familyHeadId: requireEnv('SMOKE_FAMILY_HEAD_ID'),
    runBatchMutation: process.env.SMOKE_RUN_BATCH === 'true',
  }
}

export function getSmokeAuthConfig() {
  return {
    email: requireEnv('SMOKE_USER_EMAIL'),
    password: requireEnv('SMOKE_USER_PASSWORD'),
    branchCode: requireEnv('SMOKE_USER_BRANCH_CODE'),
    totpSecret: process.env.SMOKE_2FA_TOTP_SECRET || '',
    backupCode: process.env.SMOKE_2FA_BACKUP_CODE || '',
  }
}

function loginPath(page: Page) {
  return new URL(page.url()).pathname
}

async function completeTwoFactorLogin(page: Page, totpSecret: string, backupCode: string) {
  if (totpSecret) {
    await page.locator('input[placeholder="000 000"]').first().fill(generateSmokeTotp(totpSecret))
    await page.getByRole('button', { name: 'Verify identity' }).click()
    await expect(page).toHaveURL(/\/dashboard(?:\/|$|\?)/)
    return
  }

  if (!backupCode) {
    throw new Error(
      '2FA verification is enabled for the smoke user. Set SMOKE_2FA_BACKUP_CODE to an unused backup code.',
    )
  }

  await page.getByRole('button', { name: 'Use a backup code' }).click()
  await page.locator('input[placeholder="Backup code"]').first().fill(backupCode)
  await page.getByRole('button', { name: 'Verify with backup code' }).click()
  await expect(page).toHaveURL(/\/dashboard(?:\/|$|\?)/)
}

export async function loginForSmoke(page: Page) {
  const config = getSmokeAuthConfig()

  // Every normal smoke-test project loads the session produced by auth.setup.ts.
  // Checking the dashboard first keeps individual tests from consuming another
  // single-use backup code, while still allowing this helper to recover from an
  // expired or missing storage state when it is called directly.
  await page.goto('/dashboard')

  if (!loginPath(page).startsWith('/login')) {
    await expect(page.getByText('Access Denied', { exact: false })).toHaveCount(0)
    return
  }

  if (loginPath(page) === '/login/verify-2fa') {
    await completeTwoFactorLogin(page, config.totpSecret, config.backupCode)
    return
  }

  if (loginPath(page) === '/login/setup-2fa') {
    throw new Error(
      'The smoke user has not completed 2FA enrollment. Finish enrollment before running the smoke suite.',
    )
  }

  await expect(page.locator('input[type="email"]').first()).toBeEnabled()
  await page.locator('input[type="email"]').first().fill(config.email)
  await page.locator('input[type="password"]').first().fill(config.password)
  await page.locator('input[placeholder="e.g. HQ-001"]').first().fill(config.branchCode)
  await page.getByRole('button', { name: 'Continue securely' }).click()

  await expect(page).toHaveURL(
    /\/(?:dashboard(?:\/|$|\?)|login\/(?:verify-2fa|setup-2fa)|auth\/new-password)/,
  )

  if (loginPath(page) === '/login/verify-2fa') {
    await completeTwoFactorLogin(page, config.totpSecret, config.backupCode)
  } else if (loginPath(page) === '/login/setup-2fa') {
    throw new Error(
      'The smoke user has not completed 2FA enrollment. Finish enrollment before running the smoke suite.',
    )
  } else if (loginPath(page) === '/auth/new-password') {
    throw new Error(
      'The smoke user still has a temporary password. Complete the password change before running the smoke suite.',
    )
  }

  await expect(page).toHaveURL(/\/dashboard(?:\/|$|\?)/)
  await expect(page.getByText('Login failed', { exact: false })).toHaveCount(0)
  await expect(page.getByText('Access Denied', { exact: false })).toHaveCount(0)
}
