import { apiError, apiOk } from '@/lib/api/http'
import { getRouteSupabaseClient } from '@/lib/api/serverSupabase'

export const dynamic = 'force-dynamic'

function startOfTodayIso() {
  const date = new Date()
  date.setHours(0, 0, 0, 0)
  return date.toISOString()
}

export async function GET() {
  const supabase = await getRouteSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return apiError('Unauthorized', 401)

  const { data: employee, error: employeeError } = await supabase
    .from('employees')
    .select('department_id, location_id, roles(name)')
    .eq('id', user.id)
    .single()

  if (employeeError) return apiError(employeeError.message, 500)

  const role = Array.isArray(employee?.roles) ? employee.roles[0] : employee?.roles
  const roleName = role?.name || null

  const { data: dismissedRows, error: dismissedError } = await supabase
    .from('notice_board_slide_reads')
    .select('slide_id')
    .eq('user_id', user.id)
    .gte('dismissed_at', startOfTodayIso())

  if (dismissedError) return apiError(dismissedError.message, 500)

  const dismissedToday = new Set((dismissedRows || []).map((row) => row.slide_id))

  const { data, error } = await supabase
    .from('notice_board_slides')
    .select(
      'id, title, body, image_url, hyperlink_url, display_seconds, sort_order, target_role, target_department_id, target_location_id',
    )
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false })

  if (error) return apiError(error.message, 500)

  const slides = (data || []).filter((slide) => {
    if (dismissedToday.has(slide.id)) return false
    if (slide.target_role && slide.target_role !== roleName) return false
    if (slide.target_department_id && slide.target_department_id !== employee?.department_id) {
      return false
    }
    if (slide.target_location_id && slide.target_location_id !== employee?.location_id) return false
    return true
  })

  return apiOk({ slides })
}
