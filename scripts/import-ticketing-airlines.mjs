import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import nextEnv from '@next/env'

const { loadEnvConfig } = nextEnv
loadEnvConfig(process.cwd())

const argumentsList = process.argv.slice(2)
const dryRun = argumentsList.includes('--dry-run')
const sourcePath =
  argumentsList.find((argument) => argument !== '--dry-run') || 'airline_routes.json'
const source = JSON.parse(await readFile(resolve(process.cwd(), sourcePath), 'utf8'))
const sourceRows = Array.isArray(source)
  ? source
  : source && typeof source === 'object'
    ? Object.values(source)
    : null
if (!sourceRows) throw new Error('The airline source must be a JSON array or object')

const unique = new Map()
let carrierReferences = 0
function addAirline(airline) {
  carrierReferences += 1
  const iataCode = String(airline?.iata || airline?.iataCode || '')
    .trim()
    .toUpperCase()
  const name = String(airline?.name || '').trim()
  if (/^[A-Z0-9]{2}$/.test(iataCode) && name && name.length <= 200) {
    unique.set(iataCode, { iataCode, name })
  }
}

for (const sourceRow of sourceRows) {
  if (!Array.isArray(sourceRow?.routes)) {
    addAirline(sourceRow)
    continue
  }
  for (const route of sourceRow.routes) {
    if (!Array.isArray(route?.carriers)) continue
    for (const carrier of route.carriers) addAirline(carrier)
  }
}

const values = [...unique.values()].sort((left, right) =>
  left.iataCode.localeCompare(right.iataCode),
)
if (dryRun) {
  process.stdout.write(
    `Validated ${values.length} airlines from ${carrierReferences} carrier references; no rows imported.\n`,
  )
  process.exit(0)
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key)
  throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
})
const batchSize = 100
let imported = 0
for (let index = 0; index < values.length; index += batchSize) {
  const { data, error } = await supabase.rpc('ticketing_import_airline_reference_2026082802', {
    p_rows: values.slice(index, index + batchSize),
  })
  if (error) throw new Error(`Airline import failed at row ${index + 1}: ${error.message}`)
  imported += Number(data || 0)
}
process.stdout.write(`Imported ${imported} airlines from ${values.length} validated rows.\n`)
