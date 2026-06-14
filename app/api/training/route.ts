/**
 * Training and Certification API.
 *
 * This route keeps the training module state in Supabase instead of browser storage:
 * - GET returns courses, current-user enrolments, and admin assignment context.
 * - POST handles course creation, enrolment, starting training, and completion.
 */

import { apiError, apiOk } from '@/lib/api/http'
import { getRouteSupabaseClient } from '@/lib/api/serverSupabase'
import { toErrorMessage } from '@/lib/api/error'

export const dynamic = 'force-dynamic'

const TRAINING_ADMIN_ROLES = new Set(['Admin', 'Master Admin', 'Maintenance Admin', 'Manager'])

type TrainingAction = 'create-course' | 'enroll' | 'start' | 'complete'

type TrainingRequestBody = {
  action?: TrainingAction
  courseId?: string
  employeeId?: string
  dueDate?: string | null
  score?: number
  notes?: string
  title?: string
  description?: string
  category?: string
  estimatedMinutes?: number
  passingScore?: number
  certificateValidDays?: number | null
  isRequired?: boolean
}

async function getCurrentEmployee(supabase: Awaited<ReturnType<typeof getRouteSupabaseClient>>, userId: string) {
  const { data, error } = await supabase
    .from('employees')
    .select('id, full_name, email, roles(name), locations(name, branch_code)')
    .eq('id', userId)
    .maybeSingle()

  if (error) throw error

  const role = Array.isArray(data?.roles) ? data?.roles[0] : data?.roles
  const location = Array.isArray(data?.locations) ? data?.locations[0] : data?.locations

  return {
    id: data?.id || userId,
    full_name: data?.full_name || 'Staff member',
    email: data?.email || null,
    role_name: role?.name || 'Employee',
    location,
  }
}

function isTrainingAdmin(roleName: string | null | undefined) {
  return TRAINING_ADMIN_ROLES.has(roleName || '')
}

function normaliseScore(score: unknown) {
  const value = Number(score)
  if (!Number.isFinite(value)) return 100
  return Math.max(0, Math.min(100, Math.round(value)))
}

export async function GET() {
  try {
    const supabase = await getRouteSupabaseClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) return apiError('Unauthorized', 401)

    const currentEmployee = await getCurrentEmployee(supabase, user.id)
    const admin = isTrainingAdmin(currentEmployee.role_name)

    const enrollmentQuery = supabase
      .from('training_enrollments')
      .select('*, training_courses(*), training_certificates(*)')
      .order('updated_at', { ascending: false })

    const [coursesResult, enrollmentsResult, employeesResult] = await Promise.all([
      supabase
        .from('training_courses')
        .select('*')
        .order('is_required', { ascending: false })
        .order('title'),
      admin ? enrollmentQuery : enrollmentQuery.eq('employee_id', user.id),
      admin
        ? supabase
            .from('employees')
            .select('id, full_name, email, roles(name), locations(name, branch_code), is_active')
            .eq('is_active', true)
            .order('full_name')
        : Promise.resolve({ data: [], error: null }),
    ])

    if (coursesResult.error) throw coursesResult.error
    if (enrollmentsResult.error) throw enrollmentsResult.error
    if (employeesResult.error) throw employeesResult.error

    return apiOk({
      currentEmployee,
      isAdmin: admin,
      courses: coursesResult.data || [],
      enrollments: enrollmentsResult.data || [],
      employees: employeesResult.data || [],
    })
  } catch (error) {
    return apiError(toErrorMessage(error, 'Failed to load training module'), 500)
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await getRouteSupabaseClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) return apiError('Unauthorized', 401)

    const currentEmployee = await getCurrentEmployee(supabase, user.id)
    const admin = isTrainingAdmin(currentEmployee.role_name)
    const body = (await request.json().catch(() => ({}))) as TrainingRequestBody

    if (!body.action) return apiError('Training action is required', 400)

    if (body.action === 'create-course') {
      if (!admin) return apiError('Only managers or admins can create training courses', 403)
      if (!body.title?.trim()) return apiError('Course title is required', 400)

      const { data, error } = await supabase
        .from('training_courses')
        .insert({
          title: body.title.trim(),
          description: body.description?.trim() || '',
          category: body.category?.trim() || 'General',
          estimated_minutes: Math.max(1, Number(body.estimatedMinutes || 15)),
          passing_score: Math.max(0, Math.min(100, Number(body.passingScore || 80))),
          certificate_valid_days: body.certificateValidDays || null,
          is_required: Boolean(body.isRequired),
          created_by: user.id,
        })
        .select('*')
        .single()

      if (error) throw error
      return apiOk({ course: data })
    }

    if (!body.courseId) return apiError('courseId is required', 400)

    const targetEmployeeId = body.employeeId || user.id
    if (targetEmployeeId !== user.id && !admin) {
      return apiError('Only managers or admins can assign training to other staff', 403)
    }

    const { data: course, error: courseError } = await supabase
      .from('training_courses')
      .select('*')
      .eq('id', body.courseId)
      .single()

    if (courseError) throw courseError
    if (!course?.is_active) return apiError('Training course is not active', 400)

    const now = new Date().toISOString()
    const enrollmentBase = {
      course_id: body.courseId,
      employee_id: targetEmployeeId,
      assigned_by: user.id,
      due_date: body.dueDate || null,
      updated_at: now,
    }

    if (body.action === 'enroll') {
      const { data, error } = await supabase
        .from('training_enrollments')
        .upsert(
          {
            ...enrollmentBase,
            status: 'assigned',
          },
          { onConflict: 'course_id,employee_id' },
        )
        .select('*, training_courses(*)')
        .single()

      if (error) throw error
      return apiOk({ enrollment: data })
    }

    if (body.action === 'start') {
      const { data, error } = await supabase
        .from('training_enrollments')
        .upsert(
          {
            ...enrollmentBase,
            status: 'in_progress',
            started_at: now,
          },
          { onConflict: 'course_id,employee_id' },
        )
        .select('*, training_courses(*)')
        .single()

      if (error) throw error
      return apiOk({ enrollment: data })
    }

    if (body.action === 'complete') {
      const score = normaliseScore(body.score)
      const passed = score >= Number(course.passing_score || 80)
      const certificateExpiresAt = course.certificate_valid_days
        ? new Date(Date.now() + Number(course.certificate_valid_days) * 24 * 60 * 60 * 1000).toISOString()
        : null

      const { data: enrollment, error: enrollmentError } = await supabase
        .from('training_enrollments')
        .upsert(
          {
            ...enrollmentBase,
            status: passed ? 'completed' : 'in_progress',
            started_at: now,
            completed_at: passed ? now : null,
            score,
            certificate_expires_at: passed ? certificateExpiresAt : null,
          },
          { onConflict: 'course_id,employee_id' },
        )
        .select('id, *, training_courses(*)')
        .single()

      if (enrollmentError) throw enrollmentError

      const { error: attemptError } = await supabase.from('training_attempts').insert({
        course_id: body.courseId,
        employee_id: targetEmployeeId,
        score,
        passed,
        notes: body.notes?.trim() || null,
      })

      if (attemptError) throw attemptError

      if (passed) {
        const certificateNumber = `PT-${new Date().getUTCFullYear()}-${String(enrollment.id).slice(0, 8).toUpperCase()}`
        const { error: certificateError } = await supabase
          .from('training_certificates')
          .upsert(
            {
              enrollment_id: enrollment.id,
              certificate_number: certificateNumber,
              expires_at: certificateExpiresAt,
            },
            { onConflict: 'enrollment_id' },
          )

        if (certificateError) throw certificateError
      }

      return apiOk({ enrollment, passed })
    }

    return apiError('Unsupported training action', 400)
  } catch (error) {
    return apiError(toErrorMessage(error, 'Failed to update training module'), 500)
  }
}
