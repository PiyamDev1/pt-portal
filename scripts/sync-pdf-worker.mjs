import { copyFile, mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const currentDir = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(currentDir, '..')
const source = resolve(projectRoot, 'node_modules/pdfjs-dist/build/pdf.worker.min.mjs')
const destination = resolve(projectRoot, 'public/pdf.worker.min.mjs')

async function main() {
  await mkdir(dirname(destination), { recursive: true })
  await copyFile(source, destination)
  console.log(`Synced pdf worker: ${destination}`)
}

main().catch((error) => {
  console.error('Failed to sync pdf worker:', error)
  process.exit(1)
})