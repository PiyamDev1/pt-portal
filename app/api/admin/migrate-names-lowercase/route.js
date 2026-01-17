import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

/**
 * One-time migration endpoint to convert all existing applicant names to lowercase
 * This should be called once from admin dashboard or CLI
 * 
 * Call with: curl -X POST https://yourapp.com/api/admin/migrate-names-lowercase \
 *   -H "Authorization: Bearer YOUR_ADMIN_KEY" \
 *   -H "Content-Type: application/json"
 */

export async function POST(request) {
  try {
    // Get the service role key from environment
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!serviceRoleKey) {
      return NextResponse.json({ error: 'Service role key not configured' }, { status: 500 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      serviceRoleKey
    )

    // Verify authorization with a simple admin key check
    const authHeader = request.headers.get('Authorization')
    const providedKey = authHeader?.replace('Bearer ', '')
    
    // Create a simple admin key from env or use a default
    const adminKey = process.env.MIGRATION_ADMIN_KEY || 'admin-key-change-me'
    if (providedKey !== adminKey) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    console.log('Starting migration: Converting applicant names to lowercase...')

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
        } else {
          updatedCount++
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: `Migration complete. Updated ${updatedCount} applicants to lowercase names.`,
      updatedCount,
      totalProcessed: applicants.length,
      errors: errors.length > 0 ? errors : null
    })
  } catch (error) {
    console.error('Migration error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
