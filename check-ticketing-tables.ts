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
  const { data, error } = await supabase.rpc('exec_sql', {
    sql: "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;"
  })

  if (error) {
    console.error('exec_sql not available:', error.message)
    return
  }

  const tables = (data as any[]).map(row => row.table_name)
  const ticketTables = tables.filter(name => /ticket|ledger|issue|case|support/i.test(name))

  console.log('Ticketing-related tables:')
  console.log(ticketTables.length ? ticketTables.join('\n') : 'None found')
}

main().catch(console.error)
