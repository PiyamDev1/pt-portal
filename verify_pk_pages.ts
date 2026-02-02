import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function main() {
  console.log('✅ Verifying PK Passport pages setup...\n')

  // Check pk_passport_pages table
  const { data: pages, error: pagesError } = await supabase
    .from('pk_passport_pages')
    .select('option_label')
    .order('option_label')
  
  if (pagesError) {
    console.log('❌ pk_passport_pages table error:', pagesError.message)
  } else {
    console.log('✅ pk_passport_pages lookup table:')
    console.table(pages)
  }

  // Check pk_passport_pricing has pages column
  const { data: pricing, error: pricingError } = await supabase
    .from('pk_passport_pricing')
    .select('id, category, speed, application_type, pages, cost_price, sale_price')
    .limit(3)
  
  if (pricingError) {
    console.log('\n❌ pk_passport_pricing pages column error:', pricingError.message)
  } else {
    console.log('\n✅ pk_passport_pricing sample records:')
    console.table(pricing)
  }

  // Check metadata API will work
  const { data: metadataPages, error: metaError } = await supabase
    .from('pk_passport_pages')
    .select('option_label')
    .eq('is_active', true)
    .order('option_label')
  
  if (metaError) {
    console.log('\n❌ Metadata API pages query error:', metaError.message)
  } else {
    console.log('\n✅ Metadata API will return pageCounts:')
    console.log(metadataPages?.map(p => p.option_label))
  }
}

main().catch(console.error)
