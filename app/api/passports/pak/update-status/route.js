import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

// CONFIG: Map UI Status -> Database Status
// If your DB fails on "Processing", change the right side to "In Progress"
const DB_STATUS_MAP = {
  'Pending Submission': 'Pending Submission',
  'Biometrics Taken': 'Biometrics Taken',
  'Processing': 'Processing', // If DB error persists, change this to: 'In Progress'
  'Passport Arrived': 'Passport Arrived',
  'Collected': 'Collected'
}

export async function POST(request) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )

    const body = await request.json()
    const { passportId, status, userId, newPassportNo, isCollected, oldPassportReturned } = body

    if (!passportId || !status) {
      return NextResponse.json({ error: 'Missing passportId or status' }, { status: 400 })
    }

    // 1. Resolve DB Status (fallback to provided status)
    const dbStatus = DB_STATUS_MAP[status] || status

    // 2. Prepare Update Object
    const updateData = {
      status: dbStatus,
      employee_id: userId
    }

    // Add optional fields if they exist
    if (newPassportNo !== undefined) updateData.new_passport_number = newPassportNo
    if (oldPassportReturned !== undefined) updateData.is_old_passport_returned = oldPassportReturned
    
    // 3. Validation for Collection
    if (status === 'Collected') {
      let hasNumber = !!newPassportNo
      
      // If number not provided in this request, check if it exists in DB
      if (!hasNumber) {
         const { data } = await supabase
            .from('pakistani_passport_applications')
            .select('new_passport_number')
            .eq('id', passportId)
            .single()
         if (data?.new_passport_number) hasNumber = true
      }
      
      if (!hasNumber) {
        return NextResponse.json({ error: 'Cannot mark Collected without Passport Number' }, { status: 400 })
      }
    }

    // 4. Perform Update
    const { error } = await supabase
      .from('pakistani_passport_applications')
      .update(updateData)
      .eq('id', passportId)

    if (error) {
        // Return the actual DB error to the UI so you can see it in the console
        console.error('DB Update Error:', error)
        return NextResponse.json({ error: `Database Error: ${error.message}` }, { status: 500 })
    }

    // 5. Log History
    await supabase.from('pakistani_passport_status_history').insert({
        passport_application_id: passportId,
        new_status: status, // Log the readable UI status
        changed_by: userId
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Update Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
