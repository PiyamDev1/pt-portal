import { createServerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { getSupabaseClient } from '@/lib/supabaseClient'

const ORG_ADMIN_ROLES = ['admin', 'master admin', 'super admin']
const MAINTENANCE_ROLES = ['maintenance admin', ...ORG_ADMIN_ROLES]

function normalizeRoleName(value: unknown) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
}

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
    }
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
    (supabase.from('employees') as any).select('roles(name)').eq('id', user.id).maybeSingle(),
    (supabase.from('profiles') as any).select('role').eq('id', user.id).maybeSingle(),
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
    }
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
    (supabase.from('employees') as any).select('roles(name)').eq('id', user.id).maybeSingle(),
    (supabase.from('profiles') as any).select('role').eq('id', user.id).maybeSingle(),
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