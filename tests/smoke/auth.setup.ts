import { mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import { expect, test as setup } from '@playwright/test'
import { loginForSmoke } from './helpers/auth'

export const SMOKE_AUTH_STATE = '.playwright/smoke-auth.json'

setup('authenticate smoke user once', async ({ page }) => {
  await loginForSmoke(page)
  await expect(page).toHaveURL(/\/dashboard(?:\/|$|\?)/)

  await mkdir(dirname(SMOKE_AUTH_STATE), { recursive: true })
  await page.context().storageState({ path: SMOKE_AUTH_STATE })
})
