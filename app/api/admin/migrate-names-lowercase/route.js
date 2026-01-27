import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { verifyAdminAccess, unauthorizedResponse } from '@/lib/adminAuth'

/**
 * One-time migration endpoint to convert all existing applicant names to lowercase
 * Requires Google authentication and admin role
 */

export async function POST(request) {
  try {
    // Verify admin access via Google auth
    const authResult = await verifyAdminAccess(request)
    if (!authResult.authorized) {
      return unauthorizedResponse(authResult.error, authResult.status)
    }

    const user = authResult.user
    console.log(`🔐 Migration request from ${user.email} (admin, Google auth)`)

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )

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
