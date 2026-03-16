import { NextResponse } from 'next/server'
import { verifyMasterAdminSession } from '@/lib/issueReportAuth'
import { getSupabaseClient } from '@/lib/supabaseClient'

export async function GET(request: Request) {
  const auth = await verifyMasterAdminSession()
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status')
  const moduleKey = searchParams.get('module')
  const search = searchParams.get('search')

  const supabase = getSupabaseClient()
  let query = supabase
    .from('issue_reports')
    .select('id, created_at, updated_at, reporter_name, reporter_email, page_url, route_path, module_key, notes, severity, status, has_screenshot, has_console_log, solved_at')
    .order('created_at', { ascending: false })
    .limit(100)

  if (status && status !== 'all') {
    query = query.eq('status', status)
  }

  if (moduleKey && moduleKey !== 'all') {
    query = query.eq('module_key', moduleKey)
  }

  if (search) {
    query = query.or(`notes.ilike.%${search}%,page_url.ilike.%${search}%,reporter_name.ilike.%${search}%`)
  }

  const { data, error } = await query
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ reports: data || [] })
}
