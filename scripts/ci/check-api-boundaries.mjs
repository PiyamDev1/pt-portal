import { readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

// This is an exact ratchet rather than a repository-wide ban because legacy routes
// still parse request bodies directly. Any route-by-route reduction must lower the
// reviewed baseline, which prevents a later change from silently reintroducing it.
const apiRoot = path.resolve('app/api')
const baselinePath = path.resolve('scripts/ci/api-body-validation-baseline.json')
const routeFilenamePattern = /^route\.(?:js|jsx|ts|tsx)$/
const incomingJsonPattern = /\b(?:request|req)\s*\.\s*json\s*\(/g
const sharedParserName = 'parseBodyWithSchema'

async function collectRouteFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const nestedFiles = await Promise.all(
    entries.map(async (entry) => {
      const absolutePath = path.join(directory, entry.name)
      if (entry.isDirectory()) return collectRouteFiles(absolutePath)
      return routeFilenamePattern.test(entry.name) ? [absolutePath] : []
    }),
  )

  return nestedFiles.flat()
}

function relativePath(absolutePath) {
  return path.relative(process.cwd(), absolutePath).split(path.sep).join('/')
}

function sumCalls(routes) {
  return Object.values(routes).reduce((total, count) => total + count, 0)
}

function sortedRoutes(routes) {
  return Object.fromEntries(
    Object.entries(routes).sort(([left], [right]) => left.localeCompare(right)),
  )
}

async function buildInventory() {
  const routeFiles = await collectRouteFiles(apiRoot)
  const routes = {}
  let sharedParserRouteCount = 0

  await Promise.all(
    routeFiles.map(async (routeFile) => {
      const source = await readFile(routeFile, 'utf8')
      const directJsonCalls = source.match(incomingJsonPattern)?.length ?? 0

      if (source.includes(sharedParserName)) sharedParserRouteCount += 1
      if (directJsonCalls > 0) routes[relativePath(routeFile)] = directJsonCalls
    }),
  )

  return {
    routeFileCount: routeFiles.length,
    sharedParserRouteCount,
    routes: sortedRoutes(routes),
  }
}

function validateBaseline(baseline) {
  if (baseline?.version !== 1 || typeof baseline.routes !== 'object' || baseline.routes === null) {
    throw new Error('API body-validation baseline must have version 1 and a routes object')
  }

  for (const [route, count] of Object.entries(baseline.routes)) {
    if (!route.startsWith('app/api/') || !Number.isInteger(count) || count < 1) {
      throw new Error(`Invalid API body-validation baseline entry: ${route} = ${count}`)
    }
  }
}

async function readBaseline() {
  const baseline = JSON.parse(await readFile(baselinePath, 'utf8'))
  validateBaseline(baseline)
  return baseline
}

function describeDrift(currentRoutes, baselineRoutes) {
  const growth = []
  const improvements = []
  const allRoutes = new Set([...Object.keys(currentRoutes), ...Object.keys(baselineRoutes)])

  for (const route of [...allRoutes].sort()) {
    const current = currentRoutes[route] ?? 0
    const baseline = baselineRoutes[route] ?? 0
    if (current > baseline) growth.push(`${route}: ${baseline} -> ${current}`)
    if (current < baseline) improvements.push(`${route}: ${baseline} -> ${current}`)
  }

  return { growth, improvements }
}

function printInventory(inventory) {
  console.log(
    `API body inventory: ${inventory.routeFileCount} route files, ` +
      `${Object.keys(inventory.routes).length} legacy direct-JSON routes, ` +
      `${sumCalls(inventory.routes)} direct request.json()/req.json() calls, ` +
      `${inventory.sharedParserRouteCount} routes using ${sharedParserName}.`,
  )
}

const inventory = await buildInventory()
const shouldUpdate = process.argv.includes('--update')

if (shouldUpdate) {
  try {
    const existingBaseline = await readBaseline()
    const { growth } = describeDrift(inventory.routes, existingBaseline.routes)

    if (growth.length > 0) {
      console.error('Refusing to raise the API body-validation baseline:')
      for (const entry of growth) console.error(`  + ${entry}`)
      console.error(`Migrate these calls to ${sharedParserName} before updating the baseline.`)
      process.exit(1)
    }
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.error(`Unable to read ${relativePath(baselinePath)}: ${error.message}`)
      process.exit(1)
    }
  }

  const baseline = {
    version: 1,
    description:
      'Legacy API routes that still parse incoming JSON without parseBodyWithSchema. Lower this baseline as routes are migrated; do not add entries for new code.',
    routes: inventory.routes,
  }

  await writeFile(baselinePath, `${JSON.stringify(baseline, null, 2)}\n`)
  printInventory(inventory)
  console.log(
    `Updated ${relativePath(baselinePath)}. Review the baseline diff before committing it.`,
  )
  process.exit(0)
}

let baseline
try {
  baseline = await readBaseline()
} catch (error) {
  console.error(`Unable to read ${relativePath(baselinePath)}: ${error.message}`)
  console.error('Run npm run api:update-boundary-baseline and review the generated inventory.')
  process.exit(1)
}

printInventory(inventory)
const { growth, improvements } = describeDrift(inventory.routes, baseline.routes)

if (growth.length > 0) {
  console.error('\nUnvalidated API body parsing grew beyond the reviewed baseline:')
  for (const entry of growth) console.error(`  + ${entry}`)
  console.error(`Migrate new request bodies to ${sharedParserName}; do not raise the baseline.`)
}

if (improvements.length > 0) {
  console.error('\nThe API body boundary improved, but the baseline was not lowered:')
  for (const entry of improvements) console.error(`  - ${entry}`)
  if (growth.length === 0) {
    console.error(
      '\nRun npm run api:update-boundary-baseline and review the generated baseline diff.',
    )
  }
}

if (growth.length > 0 || improvements.length > 0) process.exit(1)

console.log('API body-validation boundary matches the reviewed baseline.')
