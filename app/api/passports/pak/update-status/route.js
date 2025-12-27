import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export async function POST(request) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )

    // FIX: Destructure the new fields passed from the frontend
    const { 
      passportId, 
      status, 
      userId, 
      newPassportNo, 
      oldPassportReturned 
    } = await request.json()

    if (!passportId || !status) {
      return NextResponse.json({ error: 'Missing passportId or status' }, { status: 400 })
    }

    // Prepare the update object
    const updateData = {
      status: status,
      employee_id: userId
    }

    // FIX: Only add these to the update if they are defined (not null/undefined)
    if (newPassportNo !== undefined) {
      updateData.new_passport_number = newPassportNo
    }
    if (oldPassportReturned !== undefined) {
      updateData.is_old_passport_returned = oldPassportReturned
    }

    // Guard: cannot mark as collected until new passport number is recorded
    // FIX: Check for lowercase 'collected'
    if (status.toLowerCase() === 'collected') {
      // If we are passing the number right now, use it. Otherwise check DB.
      const passportNumToCheck = newPassportNo || (
        await supabase
          .from('pakistani_passport_applications')
          .select('new_passport_number')
          .eq('id', passportId)
          .single()
      ).data?.new_passport_number

      if (!passportNumToCheck) {
        return NextResponse.json(
          { error: 'Cannot mark as Collected until new passport number is recorded.' },
          { status: 400 }
        )
      }
    }

    const { error } = await supabase
      .from('pakistani_passport_applications')
      .update(updateData) // FIX: Use the dynamic update object
      .eq('id', passportId)

    if (error) throw error

    // Log to history table (works whether trigger exists or not)
    const { error: historyError } = await supabase
      .from('pakistani_passport_status_history')
      .insert({
        passport_application_id: passportId,
        new_status: status,
        changed_by: userId
      })

    if (historyError) {
      console.error('[PAK Status Update] History insert failed:', historyError.message)
      // Don't fail the whole request if history logging fails
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[PAK Status Update] Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
