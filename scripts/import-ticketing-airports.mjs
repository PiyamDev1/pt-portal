import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import nextEnv from '@next/env'

const { loadEnvConfig } = nextEnv
loadEnvConfig(process.cwd())

function hasValidTimezone(timezone) {
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: timezone }).format()
    return true
  } catch {
    return false
  }
}

const argumentsList = process.argv.slice(2)
const dryRun = argumentsList.includes('--dry-run')
const sourcePath = argumentsList.find((argument) => argument !== '--dry-run') || 'airports.json'
const source = JSON.parse(await readFile(resolve(process.cwd(), sourcePath), 'utf8'))
const airports = Array.isArray(source)
  ? source
  : source && typeof source === 'object'
    ? Object.values(source)
    : null
if (!airports) throw new Error('The airport source must be a JSON array or object')

const byIata = new Map()
for (const airport of airports) {
  const iataCode = String(airport?.iata || airport?.iataCode || '')
    .trim()
    .toUpperCase()
  const name = String(airport?.name || '').trim()
  const city = String(airport?.city || '').trim()
  const countryCode = String(airport?.country || airport?.countryCode || '')
    .trim()
    .toUpperCase()
  const timezone = String(airport?.tz || airport?.timezone || '').trim()
  const latitudeDeg = Number(airport?.lat ?? airport?.latitudeDeg)
  const longitudeDeg = Number(airport?.lon ?? airport?.longitudeDeg)
  if (
    !/^[A-Z]{3}$/.test(iataCode) ||
    !Number.isFinite(latitudeDeg) ||
    latitudeDeg < -90 ||
    latitudeDeg > 90 ||
    !Number.isFinite(longitudeDeg) ||
    longitudeDeg < -180 ||
    longitudeDeg > 180 ||
    !name ||
    name.length > 200 ||
    !/^[A-Z]{2}$/.test(countryCode) ||
    !hasValidTimezone(timezone)
  )
    continue

  byIata.set(iataCode, {
    iataCode,
    name,
    city: (city || name).slice(0, 100),
    countryCode,
    timezone,
    icaoCode: String(airport?.icao || airport?.icaoCode || '')
      .trim()
      .toUpperCase(),
    airportType: String(airport?.type || airport?.airportType || '').trim(),
    countryName: String(airport?.countryName || '').trim(),
    regionCode: String(airport?.regionCode || '').trim(),
    regionName: String(airport?.state || airport?.regionName || '').trim(),
    latitudeDeg,
    longitudeDeg,
  })
}

const values = [...byIata.values()].sort((left, right) =>
  left.iataCode.localeCompare(right.iataCode),
)
if (dryRun) {
  process.stdout.write(
    `Validated ${values.length} airports from ${airports.length} source rows; no rows imported.\n`,
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
  if ((index + batchSize) % 1000 === 0 && index + batchSize < values.length) {
    process.stdout.write(`Imported ${imported} of ${values.length} airports...\n`)
  }
}
process.stdout.write(`Imported ${imported} airports from ${values.length} validated rows.\n`)
