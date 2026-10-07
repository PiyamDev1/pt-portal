import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

const root = process.cwd()
const scriptMigrationsPath = path.join(root, 'scripts', 'migrations')
const supabaseMigrationsPath = path.join(root, 'supabase', 'migrations')
const mirrorsManifestPath = path.join(root, 'scripts', 'ci', 'migration-tree-mirrors.json')
const scriptMigrationName = /^\d{8}(?:\d{2})?_[a-z0-9][a-z0-9_-]*\.sql$/
const supabaseMigrationName = /^\d{14}_[a-z0-9][a-z0-9_-]*\.sql$/
const errors = []

async function readMigrationFiles(directory, namePattern, treeName) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = entries.filter((entry) => entry.isFile() && entry.name.endsWith('.sql'))

  for (const file of files) {
    if (!namePattern.test(file.name)) {
      errors.push(`${treeName}/${file.name} does not follow its migration filename convention`)
    }
  }

  if (files.length === 0) errors.push(`${treeName} contains no SQL migrations`)
  return files.map((file) => file.name).sort()
}

function migrationHash(content) {
  return createHash('sha256').update(content).digest('hex')
}

const [scriptNames, supabaseNames, mirrorManifest] = await Promise.all([
  readMigrationFiles(scriptMigrationsPath, scriptMigrationName, 'scripts/migrations'),
  readMigrationFiles(supabaseMigrationsPath, supabaseMigrationName, 'supabase/migrations'),
  readFile(mirrorsManifestPath, 'utf8').then((source) => JSON.parse(source)),
])

const supabaseVersionIds = supabaseNames.map((name) => name.slice(0, 14))
if (new Set(supabaseVersionIds).size !== supabaseVersionIds.length) {
  errors.push('supabase/migrations contains duplicate 14-digit migration version IDs')
}

if (mirrorManifest.version !== 1 || !Array.isArray(mirrorManifest.mirrors)) {
  errors.push('scripts/ci/migration-tree-mirrors.json has an unsupported manifest format')
} else {
  const scriptNameSet = new Set(scriptNames)
  const supabaseNameSet = new Set(supabaseNames)
  const declaredPairs = new Set()

  for (const mirror of mirrorManifest.mirrors) {
    const pairKey = `${mirror.scripts}::${mirror.supabase}`
    if (declaredPairs.has(pairKey)) errors.push(`Duplicate migration mirror entry: ${pairKey}`)
    declaredPairs.add(pairKey)

    if (!scriptNameSet.has(mirror.scripts) || !supabaseNameSet.has(mirror.supabase)) {
      errors.push(`Migration mirror references a missing file: ${pairKey}`)
      continue
    }

    const [scriptSql, supabaseSql] = await Promise.all([
      readFile(path.join(scriptMigrationsPath, mirror.scripts)),
      readFile(path.join(supabaseMigrationsPath, mirror.supabase)),
    ])
    if (migrationHash(scriptSql) !== migrationHash(supabaseSql)) {
      errors.push(`Registered migration mirror has drifted: ${pairKey}`)
    }
  }

  const actualPairs = new Set()
  const scriptHashes = new Map()
  for (const name of scriptNames) {
    const hash = migrationHash(await readFile(path.join(scriptMigrationsPath, name)))
    const matchingNames = scriptHashes.get(hash) || []
    matchingNames.push(name)
    scriptHashes.set(hash, matchingNames)
  }

  for (const supabaseName of supabaseNames) {
    const hash = migrationHash(await readFile(path.join(supabaseMigrationsPath, supabaseName)))
    for (const scriptName of scriptHashes.get(hash) || []) {
      actualPairs.add(`${scriptName}::${supabaseName}`)
    }
  }

  for (const pair of actualPairs) {
    if (!declaredPairs.has(pair))
      errors.push(`Unregistered exact SQL copy across migration trees: ${pair}`)
  }
  for (const pair of declaredPairs) {
    if (!actualPairs.has(pair)) errors.push(`Stale migration mirror manifest entry: ${pair}`)
  }
}

if (errors.length > 0) {
  console.error('Migration inventory check failed:')
  for (const error of errors) console.error(`  - ${error}`)
  process.exit(1)
}

console.log(
  `Migration inventory is consistent (${scriptNames.length} scripts migrations, ${supabaseNames.length} Supabase CLI migrations, ${mirrorManifest.mirrors.length} registered exact mirrors).`,
)
