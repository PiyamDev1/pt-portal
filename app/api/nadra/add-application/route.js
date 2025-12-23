import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

// Force dynamic rendering
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request) {
  try {
    console.log('[NADRA API] Request received')
    
    // Validate environment variables
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.error('[NADRA API] Missing SUPABASE credentials')
      return NextResponse.json({ 
        error: 'Server configuration error',
        details: 'Missing Supabase credentials'
      }, { status: 500 })
    }

    // Create Supabase client with service role
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )
    console.log('[NADRA API] Supabase client created')

    // Check authentication via cookies
    const cookieHeader = request.headers.get('cookie') || ''
    console.log('[NADRA API] Cookie header length:', cookieHeader.length)
    console.log('[NADRA API] Cookie header preview:', cookieHeader.substring(0, 100))
    
    const supabaseAuth = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      {
        global: {
          headers: { cookie: cookieHeader }
        }
      }
    )

    let user
    try {
      const { data: { user: authUser }, error: userError } = await supabaseAuth.auth.getUser()
      
      if (userError) {
        console.error('[NADRA API] Auth getUser error:', userError.message)
      }
      
      user = authUser
      
      if (!user) {
        console.warn('[NADRA API] No authenticated user found after auth.getUser()')
        console.warn('[NADRA API] Cookies might not be sent with credentials')
        return NextResponse.json({ 
          error: 'Unauthorized: no user session',
          hint: 'Make sure request includes credentials'
        }, { status: 401 })
      }
      
      console.log('[NADRA API] Auth check complete. User:', user.id)
    } catch (authError) {
      console.error('[NADRA API] Auth error:', authError?.message)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Parse request body
    let body
    try {
      body = await request.json()
      console.log('[NADRA API] Request body parsed:', JSON.stringify(body, null, 2))
    } catch (parseError) {
      console.error('[NADRA API] Body parse error:', parseError)
      return NextResponse.json({ 
        error: 'Invalid request body',
        details: parseError.message
      }, { status: 400 })
    }

    const { 
      applicantCnic,
      serviceType,
      trackingNumber,
      pin
    } = body

    // Validate required fields
    if (!applicantCnic || !serviceType || !trackingNumber) {
      return NextResponse.json({ 
        error: 'Missing required fields: applicantCnic, serviceType, trackingNumber' 
      }, { status: 400 })
    }

    // Look up applicant by CNIC
    console.log('[NADRA API] Looking up applicant with CNIC:', applicantCnic)
    const { data: applicant, error: applicantError } = await supabase
      .from('applicants')
      .select('id, email')
      .eq('citizen_number', applicantCnic)
      .single()

    if (applicantError) {
      console.error('[NADRA API] Applicant lookup error:', JSON.stringify(applicantError, null, 2))
      return NextResponse.json({ 
        error: 'Applicant not found',
        details: applicantError.message
      }, { status: 404 })
    }

    if (!applicant) {
      console.error('[NADRA API] No applicant found for CNIC:', applicantCnic)
      return NextResponse.json({ 
        error: 'Applicant not found'
      }, { status: 404 })
    }

    console.log('[NADRA API] Applicant found:', applicant.id)

    // Build payload for insert
    const payload = {
      applicant_id: applicant.id,
      service_type: serviceType,
      tracking_number: trackingNumber,
      application_pin: pin || null,
      status: 'pending',
    }

    console.log('[NADRA API] Attempting insert with payload:', JSON.stringify(payload, null, 2))

    // Insert the record
    const { data: nadraService, error: insertError } = await supabase
      .from('nadra_services')
      .insert(payload)
      .select()
      .single()

    if (insertError) {
      console.error('[NADRA API] Insert error:', JSON.stringify(insertError, null, 2))
      return NextResponse.json({ 
        error: 'Failed to save application',
        details: insertError.message,
        code: insertError.code
      }, { status: 500 })
    }

    console.log('[NADRA API] Successfully inserted:', nadraService?.id)

    // Fetch full record with relations
    const { data: fullRecord, error: selectError } = await supabase
      .from('nadra_services')
      .select(`
        *,
        applicants ( first_name, last_name, citizen_number, email )
      `)
      .eq('id', nadraService.id)
      .single()

    if (selectError) {
      console.error('[NADRA API] Fetch error:', selectError)
    }

    return NextResponse.json({ 
      success: true, 
      data: fullRecord || nadraService
    })

  } catch (error) {
    console.error('[NADRA API] Unexpected error:', error)
    console.error('[NADRA API] Error stack:', error.stack)
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    }, { status: 500 })
  }
}
