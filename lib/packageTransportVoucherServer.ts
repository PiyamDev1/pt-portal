import { readFile } from 'node:fs/promises'
import path from 'node:path'

let cachedLogoDataUrl: string | null = null

export async function getTransportVoucherLogoDataUrl() {
  if (cachedLogoDataUrl) return cachedLogoDataUrl

  const logoPath = path.join(process.cwd(), 'public', 'logo.png')
  const logo = await readFile(logoPath)
  cachedLogoDataUrl = `data:image/png;base64,${logo.toString('base64')}`
  return cachedLogoDataUrl
}
