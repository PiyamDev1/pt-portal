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
    .select('age_group, pages, service_type, cost_price, sale_price')
    .order('age_group')
    .order('pages')
    .order('service_type')

  const matches = (data || []).filter(d => d.age_group === 'Adult' && d.pages === '34')
  console.log('Adult + 34 combos:', matches)
}

main().catch(console.error)
