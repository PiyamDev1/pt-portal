import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function main() {
  // Check if pk_passport_pages table exists
  const { data: pages } = await supabase
    .from('pk_passport_pages')
    .select('*')
  
  console.log('PK Passport Pages table:', pages)
}

main()
