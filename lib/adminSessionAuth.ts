/**
 * Admin Session Verification Utilities
 * Validates user session and checks for admin/maintenance permissions
 * Used to protect sensitive admin endpoints and features
 * 
 * @module lib/adminSessionAuth
 */

import { createServerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { getSupabaseClient } from '@/lib/supabaseClient'

/**
 * Common role prefixes that denote admin or maintenance access
 */
const ORG_ADMIN_ROLES = ['admin', 'master admin', 'super admin']
const MAINTENANCE_ROLES = ['maintenance admin', ...ORG_ADMIN_ROLES]

type EmployeeRolesRow = {
  roles?: { name?: string | null } | Array<{ name?: string | null }> | null
}

type ProfileRoleRow = {
  role?: string | null
}

/**
 * Normalize role name for consistent comparison
 * Converts to lowercase, trims whitespace, replaces underscores/hyphens with spaces
 */
function normalizeRoleName(value: unknown) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
}

/**
 * Verify user has an active admin session
 * Checks authentication and validates admin/maintenance role from database
 * Returns 401 if not authenticated, 403 if not authorized
 * @returns Object with authorized flag and NextResponse for error cases
 */
export async function requireAdminSession() {
  const cookieStore = await cookies()
  const authClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll() {},
      },
    },
  )

  const {
    data: { user },
    error: authError,
  } = await authClient.auth.getUser()

  if (authError || !user) {
    return {
      authorized: false as const,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    }
  }

  const supabase = getSupabaseClient()
  const [{ data: employeeData }, { data: profileData }] = await Promise.all([
    supabase
      .from('employees')
      .select('roles(name)')
      .eq('id', user.id)
      .maybeSingle<EmployeeRolesRow>(),
    supabase.from('profiles').select('role').eq('id', user.id).maybeSingle<ProfileRoleRow>(),
  ])

  const employeeRole = Array.isArray(employeeData?.roles)
    ? employeeData.roles[0]?.name
    : employeeData?.roles?.name
  const profileRole = profileData?.role
  const normalizedRoles = [employeeRole, profileRole].map(normalizeRoleName)
  const isAdmin = normalizedRoles.some((role) => ORG_ADMIN_ROLES.includes(role))

  if (!isAdmin) {
    return {
      authorized: false as const,
      response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    }
  }

  return { authorized: true as const, user }
}

export async function requireMaintenanceSession() {
  const cookieStore = await cookies()
  const authClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll() {},
      },
    },
  )

  const {
    data: { user },
    error: authError,
  } = await authClient.auth.getUser()

  if (authError || !user) {
    return {
      authorized: false as const,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    }
  }

  const supabase = getSupabaseClient()
  const [{ data: employeeData }, { data: profileData }] = await Promise.all([
    supabase
      .from('employees')
      .select('roles(name)')
      .eq('id', user.id)
      .maybeSingle<EmployeeRolesRow>(),
    supabase.from('profiles').select('role').eq('id', user.id).maybeSingle<ProfileRoleRow>(),
  ])

  const employeeRole = Array.isArray(employeeData?.roles)
    ? employeeData.roles[0]?.name
    : employeeData?.roles?.name
  const profileRole = profileData?.role
  const normalizedRoles = [employeeRole, profileRole].map(normalizeRoleName)
  const canAccessMaintenance = normalizedRoles.some((role) => MAINTENANCE_ROLES.includes(role))

  if (!canAccessMaintenance) {
    return {
      authorized: false as const,
      response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    }
  }

  return { authorized: true as const, user }
}
