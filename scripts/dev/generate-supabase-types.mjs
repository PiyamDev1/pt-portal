import { mkdir, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const projectRoot = resolve(import.meta.dirname, '../..')
const outputPath = resolve(projectRoot, 'types/supabase.generated.ts')
const temporaryPath = `${outputPath}.tmp`
const npxCommand = process.platform === 'win32' ? 'npx.cmd' : 'npx'

const result = spawnSync(
  npxCommand,
  ['--yes', 'supabase@latest', 'gen', 'types', 'typescript', '--linked', '--schema', 'public'],
  {
    cwd: projectRoot,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'inherit'],
  },
)

if (result.error) throw result.error
if (result.status !== 0) process.exit(result.status ?? 1)

const generatedTypes = result.stdout.trim()
if (!generatedTypes.includes('export type Database')) {
  throw new Error(
    'Supabase CLI output did not contain a Database type; existing types were preserved.',
  )
}

await mkdir(dirname(outputPath), { recursive: true })
try {
  await writeFile(temporaryPath, `${generatedTypes}\n`, 'utf8')
  await rename(temporaryPath, outputPath)
} finally {
  await rm(temporaryPath, { force: true })
}

console.log(`Updated ${outputPath}`)
