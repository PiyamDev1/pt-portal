/**
 * Training dashboard client.
 *
 * Staff use this page to start and complete training. Managers/admins get the
 * extra tools to create courses and assign them to staff without leaving IMS.
 */
'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  Award,
  BookOpenCheck,
  CheckCircle2,
  Clock3,
  FileQuestion,
  GraduationCap,
  Image as ImageIcon,
  Loader2,
  ListChecks,
  Plus,
  ShieldCheck,
  UserPlus,
} from 'lucide-react'

type TrainingQuestionType = 'single_choice' | 'multi_select' | 'true_false' | 'image_choice'

type TrainingQuestionOption = {
  id: string
  label: string
  imageUrl?: string | null
}

type TrainingLesson = {
  id: string
  title: string
  body: string
  sort_order: number
}

type TrainingQuizQuestion = {
  id: string
  prompt: string
  options: Array<string | TrainingQuestionOption>
  correct_option_index: number
  question_type?: TrainingQuestionType | null
  correct_answer?: string[] | number[] | string | null
  explanation: string | null
  image_url?: string | null
  points?: number | null
  sort_order: number
}

type TrainingCourse = {
  id: string
  title: string
  description: string
  category: string
  estimated_minutes: number
  passing_score: number
  certificate_valid_days: number | null
  is_required: boolean
  is_active: boolean
  training_lessons?: TrainingLesson[]
  training_quiz_questions?: TrainingQuizQuestion[]
}

type TrainingEnrollment = {
  id: string
  course_id: string
  employee_id: string
  status: 'assigned' | 'in_progress' | 'completed' | 'expired'
  due_date: string | null
  started_at: string | null
  completed_at: string | null
  score: number | null
  certificate_expires_at: string | null
  training_courses?: TrainingCourse | null
  training_certificates?: Array<{
    certificate_number: string
    issued_at: string
    expires_at: string | null
  }>
}

type TrainingEmployee = {
  id: string
  full_name: string
  email: string | null
  roles?: { name?: string } | { name?: string }[] | null
  locations?: { name?: string; branch_code?: string | null } | { name?: string; branch_code?: string | null }[] | null
}

type TrainingPayload = {
  currentEmployee: {
    id: string
    full_name: string
    role_name: string
  }
  isAdmin: boolean
  courses: TrainingCourse[]
  enrollments: TrainingEnrollment[]
  employees: TrainingEmployee[]
}

const defaultNewCourse: {
  title: string
  description: string
  category: string
  estimatedMinutes: number
  passingScore: number
  certificateValidDays: number | null
  isRequired: boolean
} = {
  title: '',
  description: '',
  category: 'General',
  estimatedMinutes: 15,
  passingScore: 80,
  certificateValidDays: 365,
  isRequired: false,
}

const defaultLessonForm = {
  lessonTitle: '',
  lessonBody: '',
  sortOrder: 0,
}

type QuestionFormState = {
  questionPrompt: string
  questionType: TrainingQuestionType
  questionOptions: TrainingQuestionOption[]
  correctAnswerIds: string[]
  explanation: string
  imageUrl: string
  points: number
  sortOrder: number
}

const trainingQuestionTypes: Array<{
  value: TrainingQuestionType
  label: string
  description: string
}> = [
  {
    value: 'single_choice',
    label: 'Single choice',
    description: 'Radio buttons. One answer is correct.',
  },
  {
    value: 'multi_select',
    label: 'Multiple select',
    description: 'Checkboxes. Staff must select every correct answer.',
  },
  {
    value: 'true_false',
    label: 'True / false',
    description: 'Two fixed answers with one correct option.',
  },
  {
    value: 'image_choice',
    label: 'Image choice',
    description: 'Staff click the correct visual answer.',
  },
]

function createDefaultQuestionOptions(): TrainingQuestionOption[] {
  return [
    { id: 'a', label: '' },
    { id: 'b', label: '' },
    { id: 'c', label: '' },
    { id: 'd', label: '' },
  ]
}

function createDefaultQuestionForm(): QuestionFormState {
  return {
    questionPrompt: '',
    questionType: 'single_choice',
    questionOptions: createDefaultQuestionOptions(),
    correctAnswerIds: ['a'],
    explanation: '',
    imageUrl: '',
    points: 1,
    sortOrder: 0,
  }
}

function statusLabel(status: TrainingEnrollment['status']) {
  if (status === 'in_progress') return 'In progress'
  return status.charAt(0).toUpperCase() + status.slice(1)
}

function formatDate(value: string | null | undefined) {
  if (!value) return 'No date set'
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value))
}

function getRoleName(employee: TrainingEmployee) {
  const role = Array.isArray(employee.roles) ? employee.roles[0] : employee.roles
  return role?.name || 'Staff'
}

function getQuestionType(question: TrainingQuizQuestion): TrainingQuestionType {
  return question.question_type || 'single_choice'
}

function normaliseQuestionOptions(options: TrainingQuizQuestion['options']): TrainingQuestionOption[] {
  return (Array.isArray(options) ? options : [])
    .map((option, index) => {
      if (typeof option === 'string') {
        return {
          id: String(index),
          label: option,
          imageUrl: null,
        }
      }

      return {
        id: String(option.id || index),
        label: option.label || '',
        imageUrl: option.imageUrl || null,
      }
    })
    .filter((option) => option.id && option.label)
}

function isQuestionAnswered(question: TrainingQuizQuestion, answer: string | string[] | undefined) {
  if (getQuestionType(question) === 'multi_select') {
    return Array.isArray(answer) && answer.length > 0
  }
  return typeof answer === 'string' && answer.length > 0
}

export default function TrainingClient() {
  const [payload, setPayload] = useState<TrainingPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [adminTab, setAdminTab] = useState<'assign' | 'course' | 'builder'>('assign')
  const [savingAction, setSavingAction] = useState<string | null>(null)
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('')
  const [selectedCourseId, setSelectedCourseId] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [newCourse, setNewCourse] = useState(defaultNewCourse)
  const [lessonForm, setLessonForm] = useState(defaultLessonForm)
  const [questionForm, setQuestionForm] = useState<QuestionFormState>(createDefaultQuestionForm)
  const [activeCourseId, setActiveCourseId] = useState<string | null>(null)
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({})

  const loadTraining = useCallback(async (showPageLoader = true) => {
    if (showPageLoader) setLoading(true)
    try {
      const response = await fetch('/api/training', { cache: 'no-store' })
      const json = await response.json()
      if (!response.ok) throw new Error(json.error || 'Failed to load training')
      setPayload(json)
      setSelectedEmployeeId((current) => current || json.currentEmployee?.id || '')
      setSelectedCourseId((current) => current || json.courses?.[0]?.id || '')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load training')
    } finally {
      if (showPageLoader) setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadTraining()
  }, [loadTraining])

  const enrollmentByCourse = useMemo(() => {
    const map = new Map<string, TrainingEnrollment>()
    for (const enrollment of payload?.enrollments || []) {
      if (enrollment.employee_id === payload?.currentEmployee.id) {
        map.set(enrollment.course_id, enrollment)
      }
    }
    return map
  }, [payload])

  const activeCourse = useMemo(
    () => payload?.courses.find((course) => course.id === activeCourseId) || null,
    [activeCourseId, payload?.courses],
  )

  const activeEnrollment = activeCourse ? enrollmentByCourse.get(activeCourse.id) : undefined

  const stats = useMemo(() => {
    const ownEnrollments = (payload?.enrollments || []).filter(
      (enrollment) => enrollment.employee_id === payload?.currentEmployee.id,
    )
    return {
      assigned: ownEnrollments.filter((item) => item.status === 'assigned').length,
      inProgress: ownEnrollments.filter((item) => item.status === 'in_progress').length,
      completed: ownEnrollments.filter((item) => item.status === 'completed').length,
      required: (payload?.courses || []).filter((course) => course.is_required).length,
    }
  }, [payload])

  async function postTraining(action: string, body: Record<string, unknown>, successMessage?: string) {
    setSavingAction(action)
    try {
      const response = await fetch('/api/training', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...body }),
      })
      const json = await response.json()
      if (!response.ok) throw new Error(json.error || 'Training update failed')
      if (successMessage) toast.success(successMessage)
      await loadTraining(false)
      return json
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Training update failed')
      return null
    } finally {
      setSavingAction(null)
    }
  }

  async function createCourse() {
    if (!newCourse.title.trim()) {
      toast.error('Course title is required')
      return
    }

    const result = await postTraining(
      'create-course',
      newCourse,
      'Training course created',
    )
    if (result) setNewCourse(defaultNewCourse)
  }

  async function createLesson() {
    if (!selectedCourseId) return toast.error('Select a course first')
    if (!lessonForm.lessonTitle.trim()) return toast.error('Lesson title is required')

    const result = await postTraining(
      'create-lesson',
      {
        courseId: selectedCourseId,
        ...lessonForm,
      },
      'Lesson added',
    )
    if (result) setLessonForm(defaultLessonForm)
  }

  async function createQuestion() {
    if (!selectedCourseId) return toast.error('Select a course first')
    if (!questionForm.questionPrompt.trim()) return toast.error('Question prompt is required')
    const options = questionForm.questionOptions
      .map((option) => ({
        ...option,
        label: option.label.trim(),
        imageUrl: option.imageUrl?.trim() || null,
      }))
      .filter((option) => option.label)
    if (options.length < 2) return toast.error('Add at least two answer options')
    const validOptionIds = new Set(options.map((option) => option.id))
    const correctAnswerIds = questionForm.correctAnswerIds.filter((id) => validOptionIds.has(id))
    if (correctAnswerIds.length === 0) return toast.error('Select at least one correct answer')
    if (questionForm.questionType !== 'multi_select' && correctAnswerIds.length > 1) {
      return toast.error('This question type can only have one correct answer')
    }

    const result = await postTraining(
      'create-question',
      {
        courseId: selectedCourseId,
        questionPrompt: questionForm.questionPrompt,
        questionType: questionForm.questionType,
        questionOptions: options,
        correctAnswerIds,
        explanation: questionForm.explanation,
        imageUrl: questionForm.imageUrl,
        points: questionForm.points,
        sortOrder: questionForm.sortOrder,
      },
      'Quiz question added',
    )
    if (result) setQuestionForm(createDefaultQuestionForm())
  }

  function openCourse(course: TrainingCourse) {
    setActiveCourseId(course.id)
    setAnswers({})
    const enrollment = enrollmentByCourse.get(course.id)
    if (!enrollment || enrollment.status === 'assigned') {
      void postTraining('start', { courseId: course.id }, 'Training started')
    }
  }

  async function submitQuiz(course: TrainingCourse) {
    const questions = [...(course.training_quiz_questions || [])].sort(
      (a, b) => a.sort_order - b.sort_order,
    )
    const missing = questions.some((question) => !isQuestionAnswered(question, answers[question.id]))
    if (missing) return toast.error('Answer all quiz questions before submitting')

    const result = await postTraining(
      'complete',
      {
        courseId: course.id,
        answers,
      },
    )
    if (!result) return

    if (result.passed) {
      toast.success(`Passed with ${result.score}%`)
      setActiveCourseId(null)
      setAnswers({})
      return
    }

    toast.error(`Score ${result.score}%. You need ${course.passing_score}% to pass. Review the lessons and try again.`)
  }

  function downloadCertificate(course: TrainingCourse, enrollment: TrainingEnrollment) {
    const certificate = enrollment.training_certificates?.[0]
    const certificateText = [
      'Piyam Travel LTD',
      'Training Certificate',
      '',
      `Course: ${course.title}`,
      `Employee: ${payload?.currentEmployee.full_name || 'Staff member'}`,
      `Score: ${enrollment.score ?? '-'}%`,
      `Completed: ${formatDate(enrollment.completed_at)}`,
      `Certificate: ${certificate?.certificate_number || enrollment.id}`,
      `Expires: ${formatDate(enrollment.certificate_expires_at)}`,
    ].join('\n')
    const blob = new Blob([certificateText], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${course.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-certificate.txt`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  function setQuestionType(questionType: TrainingQuestionType) {
    setQuestionForm((current) => {
      const nextOptions =
        questionType === 'true_false'
          ? [
              { id: 'true', label: 'True' },
              { id: 'false', label: 'False' },
            ]
          : current.questionType === 'true_false'
            ? createDefaultQuestionOptions()
            : current.questionOptions
      const nextValidIds = new Set(nextOptions.map((option) => option.id))
      const nextCorrectAnswerIds = current.correctAnswerIds.filter((id) => nextValidIds.has(id))
      const fallbackCorrectAnswerIds = nextCorrectAnswerIds.length ? nextCorrectAnswerIds : [nextOptions[0]?.id || 'a']

      return {
        ...current,
        questionType,
        questionOptions: nextOptions,
        correctAnswerIds: questionType === 'multi_select'
          ? fallbackCorrectAnswerIds
          : fallbackCorrectAnswerIds.slice(0, 1),
      }
    })
  }

  function updateQuestionOption(index: number, updates: Partial<TrainingQuestionOption>) {
    setQuestionForm((current) => ({
      ...current,
      questionOptions: current.questionOptions.map((option, optionIndex) =>
        optionIndex === index ? { ...option, ...updates } : option,
      ),
    }))
  }

  function addQuestionOption() {
    setQuestionForm((current) => {
      if (current.questionOptions.length >= 8) return current
      const id = String.fromCharCode(97 + current.questionOptions.length)
      return {
        ...current,
        questionOptions: [...current.questionOptions, { id, label: '' }],
      }
    })
  }

  function removeQuestionOption(id: string) {
    setQuestionForm((current) => {
      if (current.questionType === 'true_false' || current.questionOptions.length <= 2) return current
      const nextOptions = current.questionOptions.filter((option) => option.id !== id)
      const nextCorrectAnswerIds = current.correctAnswerIds.filter((answerId) => answerId !== id)
      return {
        ...current,
        questionOptions: nextOptions,
        correctAnswerIds: nextCorrectAnswerIds.length ? nextCorrectAnswerIds : [nextOptions[0].id],
      }
    })
  }

  function toggleCorrectAnswer(id: string) {
    setQuestionForm((current) => {
      if (current.questionType !== 'multi_select') {
        return { ...current, correctAnswerIds: [id] }
      }

      const nextAnswers = current.correctAnswerIds.includes(id)
        ? current.correctAnswerIds.filter((answerId) => answerId !== id)
        : [...current.correctAnswerIds, id]

      return {
        ...current,
        correctAnswerIds: nextAnswers.length ? nextAnswers : [id],
      }
    })
  }

  function chooseAnswer(question: TrainingQuizQuestion, optionId: string) {
    if (getQuestionType(question) !== 'multi_select') {
      setAnswers((current) => ({ ...current, [question.id]: optionId }))
      return
    }

    setAnswers((current) => {
      const existing = Array.isArray(current[question.id]) ? current[question.id] as string[] : []
      const next = existing.includes(optionId)
        ? existing.filter((id) => id !== optionId)
        : [...existing, optionId]

      return { ...current, [question.id]: next }
    })
  }

  if (loading) {
    return (
      <div className="flex min-h-[22rem] items-center justify-center rounded-[2rem] bg-white">
        <div className="text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-[#8b1d2c]" />
          <p className="mt-3 text-sm font-semibold text-slate-600">Loading training module...</p>
        </div>
      </div>
    )
  }

  if (!payload) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
        Training data could not be loaded. Try refreshing the page.
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[2rem] bg-gradient-to-br from-[#4b0f16] via-[#8b1d2c] to-[#2f3033] p-5 text-white shadow-xl shadow-red-950/15 md:p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-red-100">
              <GraduationCap className="h-4 w-4" />
              Training & Certification
            </p>
            <h1 className="mt-4 text-3xl font-black tracking-tight">Staff training hub</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-200">
              Assign internal training, track completion, and keep certificates attached to staff
              records inside IMS.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-center md:min-w-72">
            <div className="rounded-2xl bg-white/10 p-3 ring-1 ring-white/15">
              <p className="text-2xl font-black">{stats.completed}</p>
              <p className="text-[11px] uppercase tracking-wide text-red-100">Completed</p>
            </div>
            <div className="rounded-2xl bg-white/10 p-3 ring-1 ring-white/15">
              <p className="text-2xl font-black">{stats.inProgress + stats.assigned}</p>
              <p className="text-[11px] uppercase tracking-wide text-red-100">Open</p>
            </div>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { label: 'Assigned', value: stats.assigned, icon: BookOpenCheck, tone: 'bg-amber-50 text-amber-700 border-amber-200' },
          { label: 'In progress', value: stats.inProgress, icon: Clock3, tone: 'bg-sky-50 text-sky-700 border-sky-200' },
          { label: 'Certified', value: stats.completed, icon: Award, tone: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
          { label: 'Required courses', value: stats.required, icon: ShieldCheck, tone: 'bg-red-50 text-red-700 border-red-200' },
        ].map((item) => {
          const Icon = item.icon
          return (
            <div key={item.label} className={`rounded-2xl border p-4 shadow-sm ${item.tone}`}>
              <Icon className="h-5 w-5" />
              <p className="mt-3 text-2xl font-black">{item.value}</p>
              <p className="text-xs font-bold uppercase tracking-wide">{item.label}</p>
            </div>
          )
        })}
      </section>

      {payload.isAdmin && (
        <section className="overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="flex items-center gap-2 text-lg font-black text-slate-900">
                  <GraduationCap className="h-5 w-5 text-[#8b1d2c]" />
                  Training admin workspace
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Assign courses, create programmes, and build lesson/quiz content from one place.
                </p>
              </div>
              <div className="grid grid-cols-3 rounded-2xl bg-slate-100 p-1 text-xs font-black uppercase tracking-wide text-slate-500">
                {[
                  { id: 'assign', label: 'Assign', icon: UserPlus },
                  { id: 'course', label: 'Courses', icon: Plus },
                  { id: 'builder', label: 'Builder', icon: FileQuestion },
                ].map((tab) => {
                  const Icon = tab.icon
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setAdminTab(tab.id as typeof adminTab)}
                      className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-3 transition ${
                        adminTab === tab.id
                          ? 'bg-white text-[#8b1d2c] shadow-sm'
                          : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      {tab.label}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          <div className="p-4">
            {adminTab === 'assign' && (
              <div className="grid gap-4 lg:grid-cols-[1fr_0.8fr]">
                <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                  <h3 className="text-sm font-black uppercase tracking-[0.16em] text-slate-500">
                    Assign staff training
                  </h3>
                  <div className="mt-4 grid gap-3">
                    <select
                      value={selectedEmployeeId}
                      onChange={(event) => setSelectedEmployeeId(event.target.value)}
                      className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm"
                    >
                      {payload.employees.map((employee) => (
                        <option key={employee.id} value={employee.id}>
                          {employee.full_name} - {getRoleName(employee)}
                        </option>
                      ))}
                    </select>
                    <select
                      value={selectedCourseId}
                      onChange={(event) => setSelectedCourseId(event.target.value)}
                      className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm"
                    >
                      {payload.courses.map((course) => (
                        <option key={course.id} value={course.id}>
                          {course.title}
                        </option>
                      ))}
                    </select>
                    <input
                      type="date"
                      value={dueDate}
                      onChange={(event) => setDueDate(event.target.value)}
                      className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm"
                    />
                    <button
                      onClick={() =>
                        postTraining(
                          'enroll',
                          { courseId: selectedCourseId, employeeId: selectedEmployeeId, dueDate: dueDate || null },
                          'Training assigned',
                        )
                      }
                      disabled={!selectedCourseId || !selectedEmployeeId || savingAction === 'enroll'}
                      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#8b1d2c] px-4 text-sm font-black text-white disabled:opacity-50"
                    >
                      {savingAction === 'enroll' ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                      Assign course
                    </button>
                  </div>
                </div>

                <div className="rounded-2xl border border-red-100 bg-red-50 p-4 text-sm text-red-900">
                  <ShieldCheck className="h-5 w-5" />
                  <h3 className="mt-3 font-black">Assignment behaviour</h3>
                  <p className="mt-2 leading-6">
                    Staff can start assigned training from their course cards. Completion attempts are
                    stored in the database, and certificates are only created after the server marks a
                    passing score.
                  </p>
                </div>
              </div>
            )}

            {adminTab === 'course' && (
              <div className="grid gap-4 lg:grid-cols-[1fr_0.8fr]">
                <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                  <h3 className="text-sm font-black uppercase tracking-[0.16em] text-slate-500">
                    Add course
                  </h3>
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <input
                      value={newCourse.title}
                      onChange={(event) => setNewCourse((current) => ({ ...current, title: event.target.value }))}
                      placeholder="Course title"
                      className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm md:col-span-2"
                    />
                    <input
                      value={newCourse.category}
                      onChange={(event) => setNewCourse((current) => ({ ...current, category: event.target.value }))}
                      placeholder="Category"
                      className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm"
                    />
                    <input
                      type="number"
                      min={1}
                      value={newCourse.estimatedMinutes}
                      onChange={(event) => setNewCourse((current) => ({ ...current, estimatedMinutes: Number(event.target.value) }))}
                      placeholder="Minutes"
                      className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm"
                    />
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={newCourse.passingScore}
                      onChange={(event) => setNewCourse((current) => ({ ...current, passingScore: Number(event.target.value) }))}
                      placeholder="Passing score"
                      className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm"
                    />
                    <input
                      type="number"
                      min={1}
                      value={newCourse.certificateValidDays || ''}
                      onChange={(event) => setNewCourse((current) => ({
                        ...current,
                        certificateValidDays: event.target.value ? Number(event.target.value) : null,
                      }))}
                      placeholder="Certificate valid days"
                      className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm"
                    />
                    <textarea
                      value={newCourse.description}
                      onChange={(event) => setNewCourse((current) => ({ ...current, description: event.target.value }))}
                      placeholder="What this course covers"
                      rows={3}
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm md:col-span-2"
                    />
                    <label className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700">
                      <input
                        type="checkbox"
                        checked={newCourse.isRequired}
                        onChange={(event) => setNewCourse((current) => ({ ...current, isRequired: event.target.checked }))}
                        className="h-4 w-4 rounded border-slate-300 text-[#8b1d2c]"
                      />
                      Required training
                    </label>
                    <button
                      onClick={() => void createCourse()}
                      disabled={savingAction === 'create-course'}
                      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-black text-white disabled:opacity-50"
                    >
                      {savingAction === 'create-course' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                      Create course
                    </button>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-100 bg-white p-4">
                  <h3 className="text-sm font-black uppercase tracking-[0.16em] text-slate-500">
                    Existing programmes
                  </h3>
                  <div className="mt-3 space-y-2">
                    {payload.courses.slice(0, 6).map((course) => (
                      <div key={course.id} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                        <p className="font-black text-slate-900">{course.title}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {course.training_lessons?.length || 0} lessons, {course.training_quiz_questions?.length || 0} questions, pass {course.passing_score}%
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {adminTab === 'builder' && (
              <div className="grid gap-4 xl:grid-cols-[0.85fr_1.15fr]">
                <div className="space-y-4">
                  <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                    <h3 className="flex items-center gap-2 text-sm font-black uppercase tracking-[0.16em] text-slate-500">
                      <BookOpenCheck className="h-4 w-4" />
                      Course and lesson content
                    </h3>
                    <select
                      value={selectedCourseId}
                      onChange={(event) => setSelectedCourseId(event.target.value)}
                      className="mt-4 min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"
                    >
                      {payload.courses.map((course) => (
                        <option key={course.id} value={course.id}>
                          {course.title}
                        </option>
                      ))}
                    </select>
                    <input
                      value={lessonForm.lessonTitle}
                      onChange={(event) => setLessonForm((current) => ({ ...current, lessonTitle: event.target.value }))}
                      placeholder="Lesson title"
                      className="mt-3 min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"
                    />
                    <textarea
                      value={lessonForm.lessonBody}
                      onChange={(event) => setLessonForm((current) => ({ ...current, lessonBody: event.target.value }))}
                      placeholder="Lesson content. Use short paragraphs and bullets so it reads well on mobile."
                      rows={8}
                      className="mt-3 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                    />
                    <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
                      <input
                        type="number"
                        value={lessonForm.sortOrder}
                        onChange={(event) => setLessonForm((current) => ({ ...current, sortOrder: Number(event.target.value) }))}
                        placeholder="Sort order"
                        className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm"
                      />
                      <button
                        onClick={() => void createLesson()}
                        disabled={savingAction === 'create-lesson'}
                        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#8b1d2c] px-4 text-sm font-black text-white disabled:opacity-50"
                      >
                        {savingAction === 'create-lesson' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                        Add lesson
                      </button>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-sm text-emerald-900">
                    <ListChecks className="h-5 w-5" />
                    <h3 className="mt-3 font-black">How marking works</h3>
                    <p className="mt-2 leading-6">
                      IMS stores the correct answer in the database and marks answers on the API.
                      Multi-select questions require every correct option and no extra wrong options.
                      Points let important questions carry more weight.
                    </p>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-100 bg-white p-4">
                  <h3 className="flex items-center gap-2 text-sm font-black uppercase tracking-[0.16em] text-slate-500">
                    <FileQuestion className="h-4 w-4" />
                    Question and answer builder
                  </h3>
                  <div className="mt-4 grid gap-3">
                    <input
                      value={questionForm.questionPrompt}
                      onChange={(event) => setQuestionForm((current) => ({ ...current, questionPrompt: event.target.value }))}
                      placeholder="Question prompt"
                      className="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"
                    />
                    <div className="grid gap-2 md:grid-cols-3">
                      <select
                        value={questionForm.questionType}
                        onChange={(event) => setQuestionType(event.target.value as TrainingQuestionType)}
                        className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm md:col-span-2"
                      >
                        {trainingQuestionTypes.map((type) => (
                          <option key={type.value} value={type.value}>
                            {type.label}
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        min={1}
                        max={20}
                        value={questionForm.points}
                        onChange={(event) => setQuestionForm((current) => ({ ...current, points: Number(event.target.value) }))}
                        placeholder="Points"
                        className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm"
                      />
                    </div>
                    <p className="rounded-xl bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-500">
                      {trainingQuestionTypes.find((type) => type.value === questionForm.questionType)?.description}
                    </p>
                    {questionForm.questionType === 'image_choice' && (
                      <input
                        value={questionForm.imageUrl}
                        onChange={(event) => setQuestionForm((current) => ({ ...current, imageUrl: event.target.value }))}
                        placeholder="Optional question image URL"
                        className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm"
                      />
                    )}

                    <div className="space-y-2">
                      {questionForm.questionOptions.map((option, index) => (
                        <div key={option.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                          <div className="grid gap-2 md:grid-cols-[1fr_auto_auto] md:items-center">
                            <input
                              value={option.label}
                              onChange={(event) => updateQuestionOption(index, { label: event.target.value })}
                              disabled={questionForm.questionType === 'true_false'}
                              placeholder={`Option ${option.id.toUpperCase()}`}
                              className="min-h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm disabled:bg-slate-100"
                            />
                            <label className="inline-flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm font-bold text-slate-700">
                              <input
                                type={questionForm.questionType === 'multi_select' ? 'checkbox' : 'radio'}
                                checked={questionForm.correctAnswerIds.includes(option.id)}
                                onChange={() => toggleCorrectAnswer(option.id)}
                                className="h-4 w-4 text-[#8b1d2c]"
                              />
                              Correct
                            </label>
                            <button
                              onClick={() => removeQuestionOption(option.id)}
                              disabled={questionForm.questionType === 'true_false' || questionForm.questionOptions.length <= 2}
                              className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-500 disabled:opacity-40"
                            >
                              Remove
                            </button>
                          </div>
                          {questionForm.questionType === 'image_choice' && (
                            <div className="mt-2 grid gap-2 md:grid-cols-[1fr_8rem] md:items-center">
                              <input
                                value={option.imageUrl || ''}
                                onChange={(event) => updateQuestionOption(index, { imageUrl: event.target.value })}
                                placeholder="Option image URL"
                                className="min-h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm"
                              />
                              <div className="flex h-20 items-center justify-center overflow-hidden rounded-xl bg-white">
                                {option.imageUrl ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img src={option.imageUrl} alt="" className="h-full w-full object-cover" />
                                ) : (
                                  <ImageIcon className="h-6 w-6 text-slate-300" />
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>

                    {questionForm.questionType !== 'true_false' && (
                      <button
                        onClick={addQuestionOption}
                        type="button"
                        className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700"
                      >
                        <Plus className="h-4 w-4" />
                        Add answer option
                      </button>
                    )}

                    <div className="grid gap-2 md:grid-cols-2">
                      <input
                        type="number"
                        value={questionForm.sortOrder}
                        onChange={(event) => setQuestionForm((current) => ({ ...current, sortOrder: Number(event.target.value) }))}
                        placeholder="Sort order"
                        className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm"
                      />
                      <textarea
                        value={questionForm.explanation}
                        onChange={(event) => setQuestionForm((current) => ({ ...current, explanation: event.target.value }))}
                        placeholder="Explanation shown after review"
                        rows={2}
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                      />
                    </div>
                    <button
                      onClick={() => void createQuestion()}
                      disabled={savingAction === 'create-question'}
                      className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-black text-white disabled:opacity-50"
                    >
                      {savingAction === 'create-question' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                      Add question
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      <section className="grid gap-4 lg:grid-cols-3">
        {payload.courses.map((course) => {
          const enrollment = enrollmentByCourse.get(course.id)
          const complete = enrollment?.status === 'completed'
          return (
            <article
              key={course.id}
              className="flex flex-col rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-black uppercase tracking-wide text-slate-500">
                    {course.category}
                  </span>
                  {course.is_required && (
                    <span className="ml-2 rounded-full bg-red-50 px-2.5 py-1 text-[11px] font-black uppercase tracking-wide text-red-700">
                      Required
                    </span>
                  )}
                </div>
                {complete && <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />}
              </div>
              <h3 className="mt-4 text-lg font-black text-slate-950">{course.title}</h3>
              <p className="mt-2 flex-1 text-sm leading-6 text-slate-600">{course.description}</p>
              <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-bold uppercase tracking-wide">
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">
                  {course.training_lessons?.length || 0} lessons
                </span>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">
                  {course.training_quiz_questions?.length || 0} questions
                </span>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-2xl bg-slate-50 p-3 text-slate-600">
                  <Clock3 className="h-4 w-4" />
                  <p className="mt-1 font-bold">{course.estimated_minutes} min</p>
                </div>
                <div className="rounded-2xl bg-slate-50 p-3 text-slate-600">
                  <ShieldCheck className="h-4 w-4" />
                  <p className="mt-1 font-bold">Pass {course.passing_score}%</p>
                </div>
              </div>
              {enrollment && (
                <div className="mt-4 rounded-2xl border border-slate-100 bg-slate-50 p-3 text-xs text-slate-600">
                  <p>Status: <span className="font-black text-slate-800">{statusLabel(enrollment.status)}</span></p>
                  <p className="mt-1">Due: {formatDate(enrollment.due_date)}</p>
                  {enrollment.score !== null && <p className="mt-1">Score: {enrollment.score}%</p>}
                  {complete && (
                    <p className="mt-1 text-emerald-700">
                      Certificate valid until {formatDate(enrollment.certificate_expires_at)}
                    </p>
                  )}
                </div>
              )}
              <div className="mt-4 grid gap-2">
                {!complete && (
                  <button
                    onClick={() => openCourse(course)}
                    disabled={savingAction === 'start' || savingAction === 'complete'}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#8b1d2c] px-4 text-sm font-black text-white disabled:opacity-50"
                  >
                    {savingAction ? <Loader2 className="h-4 w-4 animate-spin" /> : <BookOpenCheck className="h-4 w-4" />}
                    {enrollment?.status === 'in_progress' ? 'Continue training' : 'Start training'}
                  </button>
                )}
                {complete && enrollment && (
                  <button
                    onClick={() => downloadCertificate(course, enrollment)}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 text-sm font-black text-emerald-700"
                  >
                    <Award className="h-4 w-4" />
                    Download certificate
                  </button>
                )}
              </div>
            </article>
          )
        })}
      </section>

      {activeCourse && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 p-0 backdrop-blur-sm md:items-center md:p-4">
          <div className="max-h-[94vh] w-full max-w-4xl overflow-y-auto rounded-b-none rounded-t-[1.75rem] bg-white p-4 shadow-2xl md:rounded-[2rem] md:p-6">
            <div className="sticky top-0 z-10 -mx-4 -mt-4 flex items-start justify-between gap-4 border-b border-slate-100 bg-white/95 px-4 py-4 backdrop-blur md:static md:m-0 md:p-0 md:pb-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-[#8b1d2c]">
                  Training session
                </p>
                <h2 className="mt-1 text-2xl font-black text-slate-950">{activeCourse.title}</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Status: {statusLabel(activeEnrollment?.status || 'assigned')}
                </p>
              </div>
              <button
                onClick={() => setActiveCourseId(null)}
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600"
              >
                Close
              </button>
            </div>

            <div className="mt-5 grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="space-y-3">
                <h3 className="text-sm font-black uppercase tracking-[0.16em] text-slate-500">
                  Lessons
                </h3>
                {[...(activeCourse.training_lessons || [])]
                  .sort((a, b) => a.sort_order - b.sort_order)
                  .map((lesson, index) => (
                    <article key={lesson.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <p className="text-xs font-black uppercase tracking-wide text-[#8b1d2c]">
                        Lesson {index + 1}
                      </p>
                      <h4 className="mt-1 text-lg font-black text-slate-900">{lesson.title}</h4>
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">
                        {lesson.body || 'No lesson content has been added yet.'}
                      </p>
                    </article>
                  ))}
                {(activeCourse.training_lessons || []).length === 0 && (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                    No lesson content has been added. Staff can still complete this course if no quiz
                    questions are configured.
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <h3 className="text-sm font-black uppercase tracking-[0.16em] text-slate-500">
                  Quiz
                </h3>
                {[...(activeCourse.training_quiz_questions || [])]
                  .sort((a, b) => a.sort_order - b.sort_order)
                  .map((question, index) => {
                    const questionType = getQuestionType(question)
                    const options = normaliseQuestionOptions(question.options)
                    const selected = answers[question.id]
                    const selectedIds = Array.isArray(selected) ? selected : selected ? [selected] : []
                    const inputType = questionType === 'multi_select' ? 'checkbox' : 'radio'

                    return (
                      <fieldset key={question.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                        <legend className="text-sm font-black text-slate-900">
                          {index + 1}. {question.prompt}
                        </legend>
                        <div className="mt-2 flex flex-wrap gap-2 text-[11px] font-black uppercase tracking-wide">
                          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">
                            {trainingQuestionTypes.find((type) => type.value === questionType)?.label || 'Question'}
                          </span>
                          <span className="rounded-full bg-red-50 px-2.5 py-1 text-[#8b1d2c]">
                            {question.points || 1} point{Number(question.points || 1) === 1 ? '' : 's'}
                          </span>
                        </div>
                        {question.image_url && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={question.image_url}
                            alt=""
                            className="mt-3 max-h-48 w-full rounded-2xl object-cover"
                          />
                        )}
                        <div className={questionType === 'image_choice' ? 'mt-3 grid gap-3 sm:grid-cols-2' : 'mt-3 space-y-2'}>
                          {options.map((option) => {
                            const isSelected = selectedIds.includes(option.id)
                            return (
                              <label
                                key={`${question.id}-${option.id}`}
                                className={`cursor-pointer rounded-xl border text-sm transition ${
                                  isSelected
                                    ? 'border-[#8b1d2c] bg-red-50 text-[#8b1d2c]'
                                    : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300'
                                } ${questionType === 'image_choice' ? 'block overflow-hidden' : 'flex items-center gap-3 px-3 py-2'}`}
                              >
                                {questionType === 'image_choice' && (
                                  <div className="flex h-32 items-center justify-center bg-white">
                                    {option.imageUrl ? (
                                      // eslint-disable-next-line @next/next/no-img-element
                                      <img src={option.imageUrl} alt="" className="h-full w-full object-cover" />
                                    ) : (
                                      <ImageIcon className="h-8 w-8 text-slate-300" />
                                    )}
                                  </div>
                                )}
                                <span className={questionType === 'image_choice' ? 'flex items-center gap-3 px-3 py-3' : 'contents'}>
                                  <input
                                    type={inputType}
                                    name={question.id}
                                    checked={isSelected}
                                    onChange={() => chooseAnswer(question, option.id)}
                                    className="h-4 w-4 text-[#8b1d2c]"
                                  />
                                  <span className="font-semibold">{option.label}</span>
                                </span>
                              </label>
                            )
                          })}
                        </div>
                        {questionType === 'multi_select' && (
                          <p className="mt-2 text-xs font-semibold text-slate-500">
                            Select every correct answer. Extra wrong answers will make this question incorrect.
                          </p>
                        )}
                      </fieldset>
                    )
                  })}
                {(activeCourse.training_quiz_questions || []).length === 0 && (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                    No quiz questions configured. Completing this course will award a full score.
                  </div>
                )}
              </div>
            </div>

            <div className="sticky bottom-0 -mx-4 -mb-4 mt-5 border-t border-slate-100 bg-white/95 px-4 py-4 backdrop-blur md:static md:m-0 md:bg-transparent md:p-0 md:pt-5">
              <button
                onClick={() => void submitQuiz(activeCourse)}
                disabled={savingAction === 'complete'}
                className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#8b1d2c] px-4 text-sm font-black text-white disabled:opacity-50 md:w-auto"
              >
                {savingAction === 'complete' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Submit training
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
