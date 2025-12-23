import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

// Force dynamic rendering
export const dynamic = 'force-dynamic'

export async function POST(request) {
  try {
    console.log('[NADRA API] Request received')
    
    // Grab cookies (must be awaited in newer Next.js versions)
    let cookieStore
    try {
      cookieStore = await cookies()
      console.log('[NADRA API] Cookies retrieved')
    } catch (cookieError) {
      console.error('[NADRA API] Cookie error:', cookieError)
      return NextResponse.json({ 
        error: 'Failed to initialize session',
        details: cookieError.message
      }, { status: 500 })
    }

    // Create Supabase client
    let supabase
    try {
      supabase = createRouteHandlerClient({ cookies: () => cookieStore })
      console.log('[NADRA API] Supabase client created')
    } catch (clientError) {
      console.error('[NADRA API] Supabase client error:', clientError)
      return NextResponse.json({ 
        error: 'Failed to initialize database client',
        details: clientError.message
      }, { status: 500 })
    }

    // Check authentication
    let session
    try {
      const { data: { session: authSession } } = await supabase.auth.getSession()
      session = authSession
      console.log('[NADRA API] Auth check complete. User:', session?.user?.id)
    } catch (authError) {
      console.error('[NADRA API] Auth error:', authError)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!session) {
      console.warn('[NADRA API] No session found')
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
