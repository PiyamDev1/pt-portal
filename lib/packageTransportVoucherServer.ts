import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'

let cachedLogoDataUrl: string | null = null

export async function getTransportVoucherLogoDataUrl() {
  if (cachedLogoDataUrl) return cachedLogoDataUrl

  const logoPath = path.join(process.cwd(), 'public', 'logo.png')
  const logo = await readFile(logoPath)
  cachedLogoDataUrl = `data:image/png;base64,${logo.toString('base64')}`
  return cachedLogoDataUrl
}

export async function renderTransportVoucherPdf(html: string) {
  const executablePath =
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || process.env.CHROMIUM_EXECUTABLE_PATH
  const browser = await chromium.launch({
    headless: true,
    executablePath: executablePath || undefined,
    chromiumSandbox: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  })

  try {
    const page = await browser.newPage({
      viewport: { width: 416, height: 832 },
      deviceScaleFactor: 2,
    })
    await page.setContent(html, { waitUntil: 'networkidle' })
    await page.emulateMedia({ media: 'print' })
    const pdf = await page.pdf({
      width: '110mm',
      height: '220mm',
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
    })
    await page.close()
    return Buffer.from(pdf)
  } finally {
    await browser.close()
  }
}

export async function renderTransportVoucherDocument(html: string) {
  try {
    const pdf = await renderTransportVoucherPdf(html)
    return {
      body: pdf,
      extension: 'pdf',
      contentType: 'application/pdf',
      renderWarning: null,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'PDF generation failed'
    return {
      body: Buffer.from(html, 'utf8'),
      extension: 'html',
      contentType: 'text/html; charset=utf-8',
      renderWarning: `PDF generation failed; saved HTML fallback instead. ${message}`,
    }
  }
}
