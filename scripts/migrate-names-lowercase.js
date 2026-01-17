#!/usr/bin/env node

/**
 * Migration script to convert all existing applicant names to lowercase
 * Run this once: node scripts/migrate-names-lowercase.js
 */

const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function migrateNames() {
  console.log('Starting migration: Converting applicant names to lowercase...')

  try {
    // Fetch all applicants
    const { data: applicants, error: fetchError } = await supabase
      .from('applicants')
      .select('id, first_name, last_name')

    if (fetchError) {
      throw new Error(`Failed to fetch applicants: ${fetchError.message}`)
    }

    console.log(`Found ${applicants.length} applicants to process`)

    let updatedCount = 0
    const errors = []

    // Update each applicant with lowercase names
    for (const applicant of applicants) {
      const updatedFirstName = applicant.first_name ? applicant.first_name.toLowerCase() : applicant.first_name
      const updatedLastName = applicant.last_name ? applicant.last_name.toLowerCase() : applicant.last_name

      // Only update if there's a difference
      if (updatedFirstName !== applicant.first_name || updatedLastName !== applicant.last_name) {
        const { error: updateError } = await supabase
          .from('applicants')
          .update({
            first_name: updatedFirstName,
            last_name: updatedLastName
          })
          .eq('id', applicant.id)

        if (updateError) {
          errors.push({
            applicantId: applicant.id,
            name: `${applicant.first_name} ${applicant.last_name}`,
            error: updateError.message
          })
          console.log(`❌ Failed to update: ${applicant.first_name} ${applicant.last_name}`)
        } else {
          updatedCount++
          console.log(`✓ Updated: ${applicant.first_name} ${applicant.last_name} → ${updatedFirstName} ${updatedLastName}`)
        }
      }
    }

    console.log(`\n✅ Migration complete!`)
    console.log(`Total updated: ${updatedCount}/${applicants.length}`)
    
    if (errors.length > 0) {
      console.log(`\n⚠️  Errors encountered: ${errors.length}`)
      errors.forEach(e => console.log(`  - ${e.name}: ${e.error}`))
    }
  } catch (error) {
    console.error('Migration error:', error)
    process.exit(1)
  }
}

migrateNames()
