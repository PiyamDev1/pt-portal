import { spawnSync } from 'node:child_process'

const prettierExtensions = new Set([
  '.css',
  '.graphql',
  '.html',
  '.js',
  '.json',
  '.jsx',
  '.md',
  '.mjs',
  '.scss',
  '.ts',
  '.tsx',
  '.yaml',
  '.yml',
])

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    stdio: options.capture ? ['ignore', 'pipe', 'inherit'] : 'inherit',
  })

  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
  return result.stdout || ''
}

function resolveBaseReference() {
  const configuredBase = process.env.FORMAT_BASE_SHA?.trim()
  if (configuredBase && !/^0+$/.test(configuredBase)) return configuredBase

  const head = spawnSync('git', ['rev-parse', '--verify', 'HEAD'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  })
  return head.status === 0 ? head.stdout.trim() : null
}

const baseReference = resolveBaseReference()
if (!baseReference) {
  console.log('No base commit is available; checking the repository formatting instead.')
  run('npx', ['prettier', '--check', '.'])
  process.exit(0)
}

const changedOutputs = [
  run('git', ['diff', '--name-only', '--diff-filter=ACMR', '-z', `${baseReference}...HEAD`], {
    capture: true,
  }),
  run('git', ['diff', '--name-only', '--diff-filter=ACMR', '-z'], { capture: true }),
  run('git', ['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z'], { capture: true }),
  run('git', ['ls-files', '--others', '--exclude-standard', '-z'], { capture: true }),
]
const changedFiles = [...new Set(changedOutputs.flatMap((output) => output.split('\0')))]
  .filter(Boolean)
  .filter((file) => {
    const extensionIndex = file.lastIndexOf('.')
    return extensionIndex >= 0 && prettierExtensions.has(file.slice(extensionIndex))
  })

if (changedFiles.length === 0) {
  console.log('No changed Prettier-supported files to check.')
  process.exit(0)
}

console.log(`Checking formatting for ${changedFiles.length} changed file(s).`)
run('npx', ['prettier', '--check', ...changedFiles])
