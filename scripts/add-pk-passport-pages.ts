import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function main() {
  console.log('🚀 Adding pages support to PK Passport pricing...\n')

  // Step 1: Create pk_passport_pages lookup table
  console.log('1. Creating pk_passport_pages lookup table...')
  const { error: createTableError } = await supabase.rpc('exec_sql', {
    sql: `
      CREATE TABLE IF NOT EXISTS pk_passport_pages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        option_label TEXT NOT NULL UNIQUE,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `
  })
  
  if (createTableError) {
    console.error('❌ Error creating table:', createTableError)
  } else {
    console.log('✅ pk_passport_pages table created')
  }

  // Step 2: Insert page options
  console.log('\n2. Inserting page options...')
  const pageOptions = ['34 pages', '50 pages', '72 pages', '100 pages']
  
  for (const option of pageOptions) {
    const { error } = await supabase
      .from('pk_passport_pages')
      .upsert({ option_label: option }, { onConflict: 'option_label' })
    
    if (error) {
      console.error(`  ❌ Error inserting "${option}":`, error.message)
    } else {
      console.log(`  ✅ Inserted "${option}"`)
    }
  }

  // Step 3: Add pages column to pk_passport_pricing
  console.log('\n3. Adding pages column to pk_passport_pricing...')
  const { error: addColumnError } = await supabase.rpc('exec_sql', {
    sql: `
      ALTER TABLE pk_passport_pricing 
      ADD COLUMN IF NOT EXISTS pages TEXT DEFAULT '34 pages';
    `
  })
  
  if (addColumnError) {
    console.error('❌ Error adding column:', addColumnError)
  } else {
    console.log('✅ Pages column added to pk_passport_pricing')
  }

  // Step 4: Verify the changes
  console.log('\n4. Verifying changes...')
  const { data: pricing, error: verifyError } = await supabase
    .from('pk_passport_pricing')
    .select('id, category, pages')
    .limit(3)
  
  if (verifyError) {
    console.error('❌ Error verifying:', verifyError)
  } else {
    console.log('✅ Sample pricing records with pages:')
    console.table(pricing)
  }

  console.log('\n✨ Migration complete!')
}

main().catch(console.error)
