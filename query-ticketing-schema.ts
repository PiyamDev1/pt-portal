import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'

const envPath = path.join(process.cwd(), '.env.local')
const envFile = fs.readFileSync(envPath, 'utf8')
const envVars: Record<string, string> = {}
for (const line of envFile.split('\n')) {
  const [key, ...rest] = line.split('=')
  if (key && rest.length) envVars[key.trim()] = rest.join('=').trim()
}

const supabase = createClient(
  envVars.NEXT_PUBLIC_SUPABASE_URL,
  envVars.SUPABASE_SERVICE_ROLE_KEY
)

async function main() {
  const { data: tables, error } = await supabase.rpc('exec_sql', {
    sql: "SELECT row_to_json(t) FROM (SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name) t;"
  })

  if (error) {
    console.error('Failed to list tables:', error)
    return
  }

  const allTables = (tables || [])
    .map((row: any) => row?.row_to_json?.table_name || row?.table_name)
    .filter(Boolean)
  const ticketTables = allTables.filter((name: string) => /ticket|ledger|issue|case|support/i.test(name))

  console.log('Ticketing-related tables:', ticketTables)

  for (const table of ticketTables) {
    const { data: columns, error: colErr } = await supabase.rpc('exec_sql', {
      sql: `SELECT row_to_json(c) FROM (SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = '${table}' ORDER BY ordinal_position) c;`
    })

    if (colErr) {
      console.error(`Failed to list columns for ${table}:`, colErr)
      continue
    }

    console.log(`\n${table} columns:`)
    for (const col of columns || []) {
      const columnName = col?.row_to_json?.column_name || col?.column_name
      const columnType = col?.row_to_json?.data_type || col?.data_type
      console.log(`- ${columnName}: ${columnType}`)
    }
  }
}

main().catch(console.error)
