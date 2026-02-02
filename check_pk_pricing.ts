import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function main() {
  // Check if pk_passport_pages table exists
  const { data: tables } = await supabase.rpc('exec_sql', {
    sql: "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name LIKE 'pk_passport%' ORDER BY table_name"
  }).single()
  
  console.log('PK Passport tables:', tables)
  
  // Check pk_passport_pricing columns
  const { data: pricing } = await supabase
    .from('pk_passport_pricing')
    .select('*')
    .limit(3)
  
  console.log('\nSample pricing records:', pricing)
}

main()
