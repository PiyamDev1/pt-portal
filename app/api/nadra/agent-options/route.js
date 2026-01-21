import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const createSupabase = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const collectReports = (managerId, employees) => {
  const reports = []
  const stack = [managerId]
  while (stack.length > 0) {
    const current = stack.pop()
    employees.forEach((emp) => {
      if (emp.manager_id === current) {
        reports.push(emp.id)
        stack.push(emp.id)
      }
    })
  }
  return reports
}

export async function GET(request) {
  try {
    const supabase = createSupabase()
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')

    if (!userId) {
      return NextResponse.json({ error: 'Missing userId' }, { status: 400 })
    }

    const { data: employees, error: employeesError } = await supabase
      .from('employees')
      .select('id, full_name, manager_id, roles ( name )')

    if (employeesError) throw employeesError

    const currentUser = employees?.find((emp) => emp.id === userId)
    if (!currentUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const roleName = Array.isArray(currentUser.roles)
      ? currentUser.roles[0]?.name
      : currentUser.roles?.name

    const isMasterAdmin = roleName === 'Master Admin'

  const subtreeIds = collectReports(userId, employees || [])
    const allowedIds = new Set(isMasterAdmin ? employees.map((e) => e.id) : [userId, ...subtreeIds])

    const agentOptions = (employees || [])
      .filter((emp) => allowedIds.has(emp.id))
      .map((emp) => ({ id: emp.id, name: emp.full_name }))
      .sort((a, b) => a.name.localeCompare(b.name))

    const canChangeAgent = isMasterAdmin || subtreeIds.length > 0

    return NextResponse.json({
      canChangeAgent,
      agentOptions,
      role: roleName || null
    })
  } catch (error) {
    console.error('[NADRA] Agent options error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
