import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

// MAPPING UI LABELS TO DATABASE ENUM VALUES
// Edit the values on the RIGHT to match your exact Database Enum strings
const DB_STATUS_MAP = {
  'Pending Submission': 'pending',
  'Biometrics Taken': 'biometrics_taken',
  'Processing': 'processing',
  'Passport Arrived': 'arrived',
  'Collected': 'collected'
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

    // 1. Convert UI Status to DB Status
    // If the map has a value, use it. Otherwise, try using the status as-is.
    let dbStatus = DB_STATUS_MAP[status] || status

    // 2. Prepare Update Object
    const updateData = {
      status: dbStatus,
      employee_id: userId
    }

    // Add optional fields if they exist
    if (newPassportNo !== undefined) updateData.new_passport_number = newPassportNo
    if (oldPassportReturned !== undefined) updateData.is_old_passport_returned = oldPassportReturned
    
    // 3. Collection Validation
    if (status === 'Collected' || dbStatus === 'collected') {
      // Ensure we have a passport number either in this request or already in DB
      let hasNumber = !!newPassportNo
      if (!hasNumber) {
         const { data } = await supabase.from('pakistani_passport_applications').select('new_passport_number').eq('id', passportId).single()
         if (data?.new_passport_number) hasNumber = true
      }
      
      if (!hasNumber) {
        return NextResponse.json({ error: 'Cannot mark Collected without Passport Number' }, { status: 400 })
      }
    }

    // 4. Update Application
    const { error } = await supabase
      .from('pakistani_passport_applications')
      .update(updateData)
      .eq('id', passportId)

    if (error) throw error

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
