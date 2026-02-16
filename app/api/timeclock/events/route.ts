import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

type EmployeeRow = {
  id: string
  full_name: string
  manager_id: string | null
  roles?: { name?: string } | { name?: string }[] | null
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const adminSupabase = createClient(supabaseUrl, serviceKey)

const collectReports = (managerId: string, employees: EmployeeRow[]) => {
  const reports: string[] = []
  const stack = [managerId]

  while (stack.length > 0) {
    const current = stack.pop()
    if (!current) continue
    employees.forEach((emp) => {
      if (emp.manager_id === current) {
        reports.push(emp.id)
        stack.push(emp.id)
      }
    })
  }

  return reports
}

const getRoleName = (employee?: EmployeeRow | null) => {
  if (!employee?.roles) return null
  return Array.isArray(employee.roles) ? employee.roles[0]?.name : employee.roles?.name
}

export async function GET(request: Request) {
  try {
    if (!supabaseUrl || !serviceKey) {
      return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 })
    }

    const cookieStore = await cookies()
    const supabase = createServerClient(
      supabaseUrl,
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

    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const scope = (searchParams.get('scope') || 'self').toLowerCase()
    const employeeId = searchParams.get('employeeId') || null
    const pageSizeParam = parseInt(searchParams.get('pageSize') || '25', 10)
    const exportMode = searchParams.get('export') === '1'
    const maxPageSize = exportMode ? 5000 : 200
    const limit = Math.min(Math.max(pageSizeParam, 1), maxPageSize)
    const page = Math.max(parseInt(searchParams.get('page') || '1', 10), 1)
    const offset = (page - 1) * limit
    const from = searchParams.get('from')
    const to = searchParams.get('to')

    const { data: employees, error: employeesError } = await adminSupabase
      .from('employees')
      .select('id, full_name, manager_id, roles ( name )')

    if (employeesError) throw employeesError

    const employeeRows = (employees || []) as EmployeeRow[]
    const currentUser = employeeRows.find((emp) => emp.id === session.user.id) || null
    const roleName = getRoleName(currentUser)
    const isMasterAdmin = roleName === 'Master Admin'

    if (scope === 'self') {
      let query = adminSupabase
        .from('timeclock_events')
        .select(
          `
          id,
          employee_id,
          event_type,
          punch_type,
          device_ts,
          scanned_at,
          geo,
          device_id,
          timeclock_devices ( name )
        `,
          { count: 'exact' }
        )
        .eq('employee_id', session.user.id)

      if (from) {
        query = query.gte('scanned_at', from)
      }

      if (to) {
        query = query.lte('scanned_at', to)
      }

      const { data: events, error, count } = await query
        .order('scanned_at', { ascending: false })
        .range(offset, offset + limit - 1)

      if (error) throw error

      return NextResponse.json({
        events: events || [],
        total: count || 0,
        page,
        pageSize: limit,
        role: roleName || null,
      })
    }

    if (scope === 'team') {
      const subtreeIds = collectReports(session.user.id, employeeRows)
      const allowedIds = new Set(
        isMasterAdmin ? employeeRows.map((emp) => emp.id) : [session.user.id, ...subtreeIds]
      )

      if (!isMasterAdmin && subtreeIds.length === 0) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }

      if (employeeId && !allowedIds.has(employeeId)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }

      const idsToQuery = employeeId ? [employeeId] : Array.from(allowedIds)

      let query = adminSupabase
        .from('timeclock_events')
        .select(
          `
          id,
          employee_id,
          event_type,
          punch_type,
          device_ts,
          scanned_at,
          geo,
          device_id,
          employees ( full_name ),
          timeclock_devices ( name )
        `,
          { count: 'exact' }
        )
        .in('employee_id', idsToQuery)

      if (from) {
        query = query.gte('scanned_at', from)
      }

      if (to) {
        query = query.lte('scanned_at', to)
      }

      const { data: events, error, count } = await query
        .order('scanned_at', { ascending: false })
        .range(offset, offset + limit - 1)

      if (error) throw error

      const employeeOptions = Array.from(allowedIds)
        .map((id) => {
          const match = employeeRows.find((emp) => emp.id === id)
          return match ? { id: match.id, name: match.full_name } : null
        })
        .filter(Boolean)
        .sort((a: any, b: any) => a.name.localeCompare(b.name))

      return NextResponse.json({
        events: events || [],
        total: count || 0,
        page,
        pageSize: limit,
        employees: employeeOptions,
        role: roleName || null,
      })
    }

    return NextResponse.json({ error: 'Invalid scope' }, { status: 400 })
  } catch (error: any) {
    console.error('[TIMECLOCK EVENTS] Error:', error)
    return NextResponse.json({ error: error?.message || 'Server error' }, { status: 500 })
  }
}
