import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

// Force dynamic rendering
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// Health/diagnostic GET to confirm route is reachable
export async function GET(request) {
  const origin = request.headers.get('origin') || '*'
  return NextResponse.json({ ok: true, route: 'nadra/add-application', method: 'GET' }, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': origin,
      'Vary': 'Origin'
    }
  })
}

// Handle CORS preflight
export async function OPTIONS(request) {
  const origin = request.headers.get('origin') || '*'
  return NextResponse.json({ ok: true }, {
    status: 200,
    headers: {
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Credentials': 'true',
      'Vary': 'Origin'
    }
  })
}

export async function POST(request) {
  const origin = request.headers.get('origin') || 'unknown'
  
  try {
    console.log('[NADRA API] Request received from', origin)
    
    // Validate environment variables
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.error('[NADRA API] Missing SUPABASE credentials')
      return NextResponse.json({ 
        error: 'Server configuration error',
        details: 'Missing Supabase credentials'
      }, { status: 500, headers: { 'Access-Control-Allow-Origin': origin, 'Vary': 'Origin' } })
    }

    // Create Supabase client with service role
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )
    console.log('[NADRA API] Supabase client created')

    // Check authentication via cookies (informational, not blocking)
    const cookieHeader = request.headers.get('cookie') || ''
    console.log('[NADRA API] Cookie header length:', cookieHeader.length)
    
    // Try to get user from cookies, but don't block if unavailable
    // (service role has full access anyway)
    let user = null
    if (cookieHeader) {
      try {
        const supabaseAuth = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL,
          process.env.SUPABASE_SERVICE_ROLE_KEY,
          {
            global: {
              headers: { cookie: cookieHeader }
            }
          }
        )
        const { data: { user: authUser } } = await supabaseAuth.auth.getUser()
        user = authUser
        if (user) {
          console.log('[NADRA API] Authenticated user:', user.id)
        }
      } catch (authError) {
        console.warn('[NADRA API] Auth check skipped:', authError?.message)
      }
    }
    
    if (!user) {
      console.warn('[NADRA API] Proceeding without user session (service role enabled)')
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
      applicantName,
      serviceType,
      trackingNumber,
      pin
    } = body

    // Validate required fields
    if (!applicantCnic || !serviceType || !trackingNumber) {
      return NextResponse.json({ 
        error: 'Missing required fields: applicantCnic, serviceType, trackingNumber' 
      }, { status: 400, headers: { 'Access-Control-Allow-Origin': origin, 'Vary': 'Origin' } })
    }

    // Look up applicant by CNIC
    console.log('[NADRA API] Looking up applicant with CNIC:', applicantCnic)
    let { data: applicant, error: applicantError } = await supabase
      .from('applicants')
      .select('id, email, first_name, last_name')
      .eq('citizen_number', applicantCnic)
      .single()

    if (applicantError) {
      console.error('[NADRA API] Applicant lookup error:', applicantError.code, applicantError.message)
      
      // If applicant not found and we have applicant name, try to create them
      if (applicantError.code === 'PGRST116' && applicantName) {
        console.log('[NADRA API] Creating new applicant:', applicantName, applicantCnic)
        
        const [firstName, ...lastNameParts] = applicantName.split(' ')
        const lastName = lastNameParts.join(' ') || 'N/A'
        
        const { data: newApplicant, error: createError } = await supabase
          .from('applicants')
          .insert({
            first_name: firstName || 'Unknown',
            last_name: lastName,
            citizen_number: applicantCnic,
            email: null
          })
          .select('id, email, first_name, last_name')
          .single()
        
        if (createError) {
          console.error('[NADRA API] Failed to create applicant:', createError.message)
          return NextResponse.json({ 
            error: 'Applicant not found and could not be created',
            details: createError.message
          }, { status: 404, headers: { 'Access-Control-Allow-Origin': origin, 'Vary': 'Origin' } })
        }
        
        applicant = newApplicant
        console.log('[NADRA API] Applicant created successfully:', applicant.id)
      } else {
        return NextResponse.json({ 
          error: 'Applicant not found',
          details: applicantError.message,
          hint: 'CNIC does not exist in system'
        }, { status: 404, headers: { 'Access-Control-Allow-Origin': origin, 'Vary': 'Origin' } })
      }
    }

    if (!applicant) {
      console.error('[NADRA API] No applicant found for CNIC:', applicantCnic)
      return NextResponse.json({ 
        error: 'Applicant not found'
      }, { status: 404, headers: { 'Access-Control-Allow-Origin': origin, 'Vary': 'Origin' } })
    }

    console.log('[NADRA API] Applicant found/created:', applicant.id)

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
    let { data: nadraService, error: insertError } = await supabase
      .from('nadra_services')
      .insert(payload)
      .select()
      .single()

    // If insert fails, log full error details and try simpler payload
    if (insertError) {
      console.error('[NADRA API] Insert error details:', {
        message: insertError.message,
        code: insertError.code,
        details: insertError.details,
        hint: insertError.hint
      })
      
      // Try with even simpler payload if status field is problematic
      console.log('[NADRA API] Retrying with minimal payload (no status)...')
      const minimalPayload = {
        applicant_id: applicant.id,
        service_type: serviceType,
        tracking_number: trackingNumber,
        application_pin: pin || null,
      }
      
      const retry = await supabase
        .from('nadra_services')
        .insert(minimalPayload)
        .select()
        .single()
      
      if (retry.error) {
        console.error('[NADRA API] Retry also failed:', retry.error)
        return NextResponse.json({ 
          error: 'Failed to save application',
          details: insertError.message,
          code: insertError.code,
          hint: insertError.hint
        }, { status: 500, headers: { 'Access-Control-Allow-Origin': origin, 'Vary': 'Origin' } })
      }
      
      nadraService = retry.data
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
    }, {
      status: 200,
      headers: { 'Access-Control-Allow-Origin': origin, 'Vary': 'Origin' }
    })

  } catch (error) {
    console.error('[NADRA API] Unexpected error:', error)
    console.error('[NADRA API] Error stack:', error.stack)
    const origin = request.headers.get('origin') || 'unknown'
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    }, { status: 500, headers: { 'Access-Control-Allow-Origin': origin, 'Vary': 'Origin' } })
  }
}
