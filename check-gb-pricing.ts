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
  const combo = { age_group: 'Adult', pages: '34 pages', service_type: 'Standard' }
  const { data: pricing, error } = await supabase
    .from('gb_passport_pricing')
    .select('id, age_group, pages, service_type, cost_price, sale_price')
    .match(combo)

  console.log('Pricing match:', pricing, error)

  const { data: pages } = await supabase.from('gb_passport_pages').select('option_label').order('option_label')
  console.log('GB pages options:', pages?.map(p => p.option_label))

  const { data: ages } = await supabase.from('gb_passport_ages').select('name').order('name')
  console.log('GB ages:', ages?.map(a => a.name))

  const { data: services } = await supabase.from('gb_passport_services').select('name').order('name')
  console.log('GB services:', services?.map(s => s.name))
}

main().catch(console.error)
