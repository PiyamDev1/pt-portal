import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import nextEnv from '@next/env'
import tzlookup from 'tz-lookup'

const { loadEnvConfig } = nextEnv
loadEnvConfig(process.cwd())

function parseCsv(text) {
  const rows = []
  let row = []
  let value = ''
  let quoted = false
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        value += '"'
        index += 1
      } else if (character === '"') quoted = false
      else value += character
    } else if (character === '"') quoted = true
    else if (character === ',') {
      row.push(value)
      value = ''
    } else if (character === '\n') {
      row.push(value.replace(/\r$/, ''))
      if (row.some(Boolean)) rows.push(row)
      row = []
      value = ''
    } else value += character
  }
  if (value || row.length > 0) {
    row.push(value.replace(/\r$/, ''))
    rows.push(row)
  }
  const [headers = [], ...values] = rows
  return values.map((columns) =>
    Object.fromEntries(headers.map((header, index) => [header, columns[index] || ''])),
  )
}

async function rows(path) {
  return parseCsv(await readFile(resolve(process.cwd(), path), 'utf8'))
}

const argumentsList = process.argv.slice(2)
const dryRun = argumentsList.includes('--dry-run')
const sourcePaths = argumentsList.filter((argument) => argument !== '--dry-run')
const [airports, countries, regions] = await Promise.all([
  rows(sourcePaths[0] || 'airports.csv'),
  rows(sourcePaths[1] || 'countries.csv'),
  rows(sourcePaths[2] || 'regions.csv'),
])

const countryNames = new Map(countries.map((country) => [country.code, country.name]))
const regionNames = new Map(regions.map((region) => [region.code, region.name]))
const typePriority = new Map([
  ['large_airport', 0],
  ['medium_airport', 1],
  ['small_airport', 2],
  ['seaplane_base', 3],
  ['heliport', 4],
])
const byIata = new Map()
for (const airport of airports) {
  const iataCode = airport.iata_code.trim().toUpperCase()
  const latitudeDeg = Number(airport.latitude_deg)
  const longitudeDeg = Number(airport.longitude_deg)
  if (
    airport.scheduled_service !== 'yes' ||
    !/^[A-Z]{3}$/.test(iataCode) ||
    !Number.isFinite(latitudeDeg) ||
    !Number.isFinite(longitudeDeg) ||
    !airport.name.trim() ||
    airport.name.trim().length > 200 ||
    !airport.iso_country.trim()
  )
    continue
  const candidate = {
    iataCode,
    name: airport.name.trim(),
    city: (airport.municipality.trim() || airport.name.trim()).slice(0, 100),
    countryCode: airport.iso_country.trim().toUpperCase(),
    timezone: tzlookup(latitudeDeg, longitudeDeg),
    icaoCode: airport.icao_code.trim().toUpperCase(),
    airportType: airport.type.trim(),
    countryName: countryNames.get(airport.iso_country) || '',
    regionCode: airport.iso_region.trim(),
    regionName: regionNames.get(airport.iso_region) || '',
    latitudeDeg,
    longitudeDeg,
  }
  const current = byIata.get(iataCode)
  if (
    !current ||
    (typePriority.get(candidate.airportType) ?? 99) < (typePriority.get(current.airportType) ?? 99)
  )
    byIata.set(iataCode, candidate)
}

const values = [...byIata.values()].sort((left, right) =>
  left.iataCode.localeCompare(right.iataCode),
)
if (dryRun) {
  process.stdout.write(`Validated ${values.length} scheduled airports; no rows imported.\n`)
  process.exit(0)
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key)
  throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
})
// The existing ticket_airports IANA-timezone check resolves PostgreSQL's
// timezone catalogue once per row. Small transactions stay below Supabase's
// service-role statement timeout without weakening that shared constraint.
const batchSize = 10
let imported = 0
for (let index = 0; index < values.length; index += batchSize) {
  const batch = values.slice(index, index + batchSize)
  const { data, error } = await supabase.rpc('ticketing_import_airport_reference_2026082802', {
    p_rows: batch,
  })
  if (error) throw new Error(`Airport import failed at row ${index + 1}: ${error.message}`)
  imported += Number(data || 0)
}
process.stdout.write(
  `Imported ${imported} scheduled airports from ${values.length} validated rows.\n`,
)
