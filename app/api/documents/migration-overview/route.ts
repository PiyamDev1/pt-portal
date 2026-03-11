import { createServerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { getDocumentMigrationMetrics } from '@/lib/documentMigrationMetrics'
import { getDocumentStorageConstants, getDocumentStorageStatus } from '@/lib/documentStorageStatus'
import { migrateFallbackBatch } from '@/lib/r2Migration'
import { getSupabaseClient } from '@/lib/supabaseClient'

function normalizeRoleName(value: unknown) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
}

async function requireAdminAccess() {
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
      authorized: false,
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
  const isAdmin = normalizedRoles.some((role) => ['admin', 'master admin', 'super admin'].includes(role))

  if (!isAdmin) {
    return {
      authorized: false,
      response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    }
  }

  return { authorized: true, user }
}

async function getOverview() {
  const { MINIO_BUCKET, R2_BUCKET } = getDocumentStorageConstants()
  const supabase = getSupabaseClient()
  const [
    totalActiveResult,
    primaryResult,
    fallbackResult,
    deletedResult,
    recentFallbackResult,
    oldestFallbackResult,
    health,
  ] = await Promise.all([
    (supabase.from('documents') as any).select('id', { count: 'exact', head: true }).eq('deleted', false),
    (supabase.from('documents') as any)
      .select('id', { count: 'exact', head: true })
      .eq('deleted', false)
      .eq('minio_bucket', MINIO_BUCKET),
    (supabase.from('documents') as any)
      .select('id', { count: 'exact', head: true })
      .eq('deleted', false)
      .eq('minio_bucket', R2_BUCKET),
    (supabase.from('documents') as any).select('id', { count: 'exact', head: true }).eq('deleted', true),
    (supabase.from('documents') as any)
      .select('id, file_name, file_size, category, uploaded_at, family_head_id, minio_key')
      .eq('deleted', false)
      .eq('minio_bucket', R2_BUCKET)
      .order('uploaded_at', { ascending: false })
      .limit(10),
    (supabase.from('documents') as any)
      .select('uploaded_at')
      .eq('deleted', false)
      .eq('minio_bucket', R2_BUCKET)
      .order('uploaded_at', { ascending: true })
      .limit(1)
      .maybeSingle(),
    getDocumentStorageStatus({ runMaintenance: false }),
  ])

  const oldestFallbackAt = oldestFallbackResult?.data?.uploaded_at || null
  const backlogAgeHours = oldestFallbackAt
    ? Math.round(((Date.now() - new Date(oldestFallbackAt).getTime()) / 36e5) * 10) / 10
    : 0

  return {
    summary: {
      totalActiveDocuments: totalActiveResult.count || 0,
      primaryDocuments: primaryResult.count || 0,
      fallbackDocuments: fallbackResult.count || 0,
      deletedDocuments: deletedResult.count || 0,
      oldestFallbackAt,
      backlogAgeHours,
    },
    health,
    metrics: getDocumentMigrationMetrics(),
    recentFallbackDocuments: recentFallbackResult.data || [],
  }
}

export async function GET() {
  const access = await requireAdminAccess()
  if (!access.authorized) {
    return access.response
  }

  try {
    const overview = await getOverview()
    return NextResponse.json({ success: true, data: overview })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to load overview' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  const access = await requireAdminAccess()
  if (!access.authorized) {
    return access.response
  }

  try {
    const body = await request.json().catch(() => ({}))
    const limit = Math.max(1, Math.min(50, Number(body?.limit) || 20))
    const health = await getDocumentStorageStatus({ runMaintenance: false })

    if (!health.connected) {
      return NextResponse.json(
        { success: false, error: 'Primary storage is offline. Batch migration is unavailable.' },
        { status: 409 }
      )
    }

    const result = await migrateFallbackBatch(limit)
    const overview = await getOverview()
    return NextResponse.json({ success: true, data: { result, overview } })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Batch migration failed' },
      { status: 500 }
    )
  }
}