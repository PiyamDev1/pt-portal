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
  const { data } = await supabase
    .from('gb_passport_pricing')
    .select('pages')

  const unique = Array.from(new Set((data || []).map(d => d.pages))).sort()
  console.log('GB pricing pages:', unique)
}

main().catch(console.error)
