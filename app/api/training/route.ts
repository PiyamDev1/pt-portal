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

type TrainingAction =
  | 'create-course'
  | 'create-lesson'
  | 'create-question'
  | 'enroll'
  | 'start'
  | 'complete'

type TrainingQuestionType = 'single_choice' | 'multi_select' | 'true_false' | 'image_choice'

type TrainingQuestionOption = {
  id: string
  label: string
  imageUrl?: string | null
}

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
  lessonTitle?: string
  lessonBody?: string
  questionPrompt?: string
  questionType?: TrainingQuestionType
  questionOptions?: Array<string | TrainingQuestionOption>
  correctAnswerIds?: string[]
  correctOptionIndex?: number
  explanation?: string
  imageUrl?: string
  points?: number
  sortOrder?: number
  answers?: Record<string, string | string[] | number | number[]>
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

function normaliseQuestionType(type: unknown): TrainingQuestionType {
  if (type === 'multi_select' || type === 'true_false' || type === 'image_choice') return type
  return 'single_choice'
}

function normaliseOptions(options: unknown, questionType: TrainingQuestionType): TrainingQuestionOption[] {
  const source =
    questionType === 'true_false'
      ? [
          { id: 'true', label: 'True' },
          { id: 'false', label: 'False' },
        ]
      : Array.isArray(options)
        ? options
        : []

  return source
    .map((option, index) => {
      if (typeof option === 'string') {
        return {
          id: String(index),
          label: option.trim(),
          imageUrl: null,
        }
      }

      const typedOption = option as Partial<TrainingQuestionOption>
      return {
        id: String(typedOption.id || String.fromCharCode(97 + index)).trim(),
        label: String(typedOption.label || '').trim(),
        imageUrl: typedOption.imageUrl ? String(typedOption.imageUrl).trim() : null,
      }
    })
    .filter((option) => option.id && option.label)
    .slice(0, 8)
}

function normaliseCorrectAnswerIds(
  correctAnswerIds: unknown,
  options: TrainingQuestionOption[],
  questionType: TrainingQuestionType,
  fallbackIndex = 0,
) {
  const validIds = new Set(options.map((option) => option.id))
  const fallback = options[Math.max(0, Math.min(options.length - 1, fallbackIndex))]?.id
  const raw = Array.isArray(correctAnswerIds) ? correctAnswerIds : fallback ? [fallback] : []
  const selected = [...new Set(raw.map(String).filter((id) => validIds.has(id)))]

  return questionType === 'multi_select' ? selected : selected.slice(0, 1)
}

function normaliseStoredOptions(options: unknown): TrainingQuestionOption[] {
  if (!Array.isArray(options)) return []
  return options
    .map((option, index) => {
      if (typeof option === 'string') {
        return {
          id: String(index),
          label: option,
          imageUrl: null,
        }
      }

      const typedOption = option as Partial<TrainingQuestionOption>
      return {
        id: String(typedOption.id || String(index)),
        label: String(typedOption.label || ''),
        imageUrl: typedOption.imageUrl ? String(typedOption.imageUrl) : null,
      }
    })
    .filter((option) => option.id && option.label)
}

function getQuestionCorrectIds(question: Record<string, unknown>) {
  const options = normaliseStoredOptions(question.options)
  const storedAnswer = question.correct_answer
  if (Array.isArray(storedAnswer) && storedAnswer.length > 0) {
    return storedAnswer.map(String)
  }

  const legacyIndex = Number(question.correct_option_index || 0)
  const fallback = options[Math.max(0, Math.min(options.length - 1, legacyIndex))]
  return fallback ? [fallback.id] : []
}

function getSubmittedAnswerIds(answer: unknown, question: Record<string, unknown>) {
  const options = normaliseStoredOptions(question.options)
  const optionByIndex = new Map(options.map((option, index) => [index, option.id]))
  const values = Array.isArray(answer) ? answer : typeof answer !== 'undefined' ? [answer] : []

  return [...new Set(values
    .map((value) => {
      if (typeof value === 'number') return optionByIndex.get(value) || String(value)
      const asNumber = Number(value)
      if (Number.isInteger(asNumber) && optionByIndex.has(asNumber)) return optionByIndex.get(asNumber)!
      return String(value)
    })
    .filter(Boolean))]
}

function answersMatch(expected: string[], actual: string[]) {
  if (expected.length !== actual.length) return false
  const actualSet = new Set(actual)
  return expected.every((id) => actualSet.has(id))
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
      .select('*, training_courses(*, training_lessons(*), training_quiz_questions(*)), training_certificates(*)')
      .order('updated_at', { ascending: false })

    const [coursesResult, enrollmentsResult, employeesResult] = await Promise.all([
      supabase
        .from('training_courses')
        .select('*, training_lessons(*), training_quiz_questions(*)')
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

    if (body.action === 'create-lesson') {
      if (!admin) return apiError('Only managers or admins can add training lessons', 403)
      if (!body.lessonTitle?.trim()) return apiError('Lesson title is required', 400)

      const { data, error } = await supabase
        .from('training_lessons')
        .insert({
          course_id: body.courseId,
          title: body.lessonTitle.trim(),
          body: body.lessonBody?.trim() || '',
          sort_order: Number(body.sortOrder || 0),
        })
        .select('*')
        .single()

      if (error) throw error
      return apiOk({ lesson: data })
    }

    if (body.action === 'create-question') {
      if (!admin) return apiError('Only managers or admins can add quiz questions', 403)
      if (!body.questionPrompt?.trim()) return apiError('Question prompt is required', 400)
      const questionType = normaliseQuestionType(body.questionType)
      const options = normaliseOptions(body.questionOptions, questionType)
      if (options.length < 2) return apiError('Add at least two answer options', 400)
      const correctAnswerIds = normaliseCorrectAnswerIds(
        body.correctAnswerIds,
        options,
        questionType,
        Number(body.correctOptionIndex || 0),
      )
      if (correctAnswerIds.length === 0) return apiError('Select at least one correct answer', 400)
      const correctIndex = Math.max(0, options.findIndex((option) => option.id === correctAnswerIds[0]))

      const { data, error } = await supabase
        .from('training_quiz_questions')
        .insert({
          course_id: body.courseId,
          prompt: body.questionPrompt.trim(),
          options,
          correct_option_index: correctIndex,
          question_type: questionType,
          correct_answer: correctAnswerIds,
          explanation: body.explanation?.trim() || null,
          image_url: body.imageUrl?.trim() || null,
          points: Math.max(1, Math.min(20, Number(body.points || 1))),
          sort_order: Number(body.sortOrder || 0),
        })
        .select('*')
        .single()

      if (error) throw error
      return apiOk({ question: data })
    }

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
      const { data: questions, error: questionsError } = await supabase
        .from('training_quiz_questions')
        .select('*')
        .eq('course_id', body.courseId)

      if (questionsError) throw questionsError

      const answers = body.answers || {}
      const hasQuiz = Boolean(questions?.length)
      const totalPoints = (questions || []).reduce(
        (total, question) => total + Math.max(1, Number(question.points || 1)),
        0,
      )
      const earnedPoints = (questions || []).reduce((total, question) => {
        const expected = getQuestionCorrectIds(question)
        const actual = getSubmittedAnswerIds(answers[question.id], question)
        return answersMatch(expected, actual) ? total + Math.max(1, Number(question.points || 1)) : total
      }, 0)
      const score = hasQuiz
        ? normaliseScore((earnedPoints / Math.max(1, totalPoints)) * 100)
        : normaliseScore(body.score)
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
        answers,
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

      return apiOk({ enrollment, passed, score })
    }

    return apiError('Unsupported training action', 400)
  } catch (error) {
    return apiError(toErrorMessage(error, 'Failed to update training module'), 500)
  }
}
