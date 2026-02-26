import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

interface VerifyResult {
  authorized: boolean
  error?: string
  status?: number
  user?: {
    id: string
    email: string
    provider: string
  }
}

/**
 * Utility to verify admin access for protected endpoints
 * Uses Google authentication - only allows users who:
 * 1. Are logged in via Google
 * 2. Have admin role in profiles table
 */
export async function verifyAdminAccess(request: Request): Promise<VerifyResult> {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    
    if (!url || !key) {
      return {
        authorized: false,
        error: 'Server configuration error',
        status: 500
      }
    }

    // Get authentication info from request
    const authHeader = request.headers.get('authorization')
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return {
        authorized: false,
        error: 'Missing or invalid authorization header. Format: "Authorization: Bearer <token>"',
        status: 401
      }
    }

    const token = authHeader.substring(7)
    
    // Verify the token with Supabase
    const supabase = createClient(url, key)
    const { data: { user }, error: userError } = await supabase.auth.getUser(token)

    if (userError || !user) {
      return {
        authorized: false,
        error: 'Invalid or expired token',
        status: 401
      }
    }

    // Verify user has admin role
    const { data: employee, error: employeeError } = await supabase
      .from('employees')
      .select('id, role_id')
      .eq('id', user.id)
      .single()

    if (employeeError || !employee) {
      console.warn(`⚠️  Access denied for ${user.email} - employee profile not found`)
      return {
        authorized: false,
        error: 'Unable to verify user role',
        status: 403
      }
    }

    // Get the role name from the roles table
    const { data: roleData, error: roleError } = await supabase
      .from('roles')
      .select('name')
      .eq('id', employee.role_id)
      .single()

    if (roleError || !roleData) {
      console.warn(`⚠️  Access denied for ${user.email} - role not found`)
      return {
        authorized: false,
        error: 'Unable to verify user role',
        status: 403
      }
    }

    // Check if user has admin or master admin role
    const isAdmin = ['Admin', 'Master Admin'].includes(roleData.name)
    
    if (!isAdmin) {
      console.warn(`⚠️  Access denied for ${user.email} - insufficient permissions (role: ${roleData.name})`)
      return {
        authorized: false,
        error: 'Forbidden - Admin access required',
        status: 403
      }
    }

    // User is authenticated and has admin role - allow access
    console.log(`✅ Admin access granted for ${user.email} (${roleData.name})`)
    
    return {
      authorized: true,
      user: {
        id: user.id,
        email: user.email || '',
        provider: user.app_metadata?.provider || 'email'
      }
    }
  } catch (error: any) {
    console.error('Error verifying admin access:', error)
    return {
      authorized: false,
      error: 'Internal server error',
      status: 500
    }
  }
}

/**
 * Helper to create an unauthorized response with guidance
 */
export function unauthorizedResponse(message: string | undefined, status: number | undefined = 401) {
  return NextResponse.json(
    { 
      error: message || 'Unauthorized',
      hint: 'Get your token: Open browser DevTools → Network tab → Find any API call → Copy Authorization header value'
    },
    { status: status || 401 }
  )
}
