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
  GraduationCap,
  Loader2,
  Plus,
  ShieldCheck,
  UserPlus,
} from 'lucide-react'

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

const defaultNewCourse = {
  title: '',
  description: '',
  category: 'General',
  estimatedMinutes: 15,
  passingScore: 80,
  certificateValidDays: 365,
  isRequired: false,
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

export default function TrainingClient() {
  const [payload, setPayload] = useState<TrainingPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [savingAction, setSavingAction] = useState<string | null>(null)
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('')
  const [selectedCourseId, setSelectedCourseId] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [newCourse, setNewCourse] = useState(defaultNewCourse)

  const loadTraining = useCallback(async () => {
    setLoading(true)
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
      setLoading(false)
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

  async function postTraining(action: string, body: Record<string, unknown>, successMessage: string) {
    setSavingAction(action)
    try {
      const response = await fetch('/api/training', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...body }),
      })
      const json = await response.json()
      if (!response.ok) throw new Error(json.error || 'Training update failed')
      toast.success(successMessage)
      await loadTraining()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Training update failed')
    } finally {
      setSavingAction(null)
    }
  }

  async function createCourse() {
    if (!newCourse.title.trim()) {
      toast.error('Course title is required')
      return
    }

    await postTraining(
      'create-course',
      newCourse,
      'Training course created',
    )
    setNewCourse(defaultNewCourse)
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
        <section className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="flex items-center gap-2 text-lg font-black text-slate-900">
              <UserPlus className="h-5 w-5 text-[#8b1d2c]" />
              Assign training
            </h2>
            <div className="mt-4 grid gap-3">
              <select
                value={selectedEmployeeId}
                onChange={(event) => setSelectedEmployeeId(event.target.value)}
                className="min-h-11 rounded-xl border border-slate-200 px-3 text-sm"
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
                className="min-h-11 rounded-xl border border-slate-200 px-3 text-sm"
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
                className="min-h-11 rounded-xl border border-slate-200 px-3 text-sm"
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

          <div className="rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="flex items-center gap-2 text-lg font-black text-slate-900">
              <Plus className="h-5 w-5 text-[#8b1d2c]" />
              Add course
            </h2>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <input
                value={newCourse.title}
                onChange={(event) => setNewCourse((current) => ({ ...current, title: event.target.value }))}
                placeholder="Course title"
                className="min-h-11 rounded-xl border border-slate-200 px-3 text-sm md:col-span-2"
              />
              <input
                value={newCourse.category}
                onChange={(event) => setNewCourse((current) => ({ ...current, category: event.target.value }))}
                placeholder="Category"
                className="min-h-11 rounded-xl border border-slate-200 px-3 text-sm"
              />
              <input
                type="number"
                min={1}
                value={newCourse.estimatedMinutes}
                onChange={(event) => setNewCourse((current) => ({ ...current, estimatedMinutes: Number(event.target.value) }))}
                placeholder="Minutes"
                className="min-h-11 rounded-xl border border-slate-200 px-3 text-sm"
              />
              <textarea
                value={newCourse.description}
                onChange={(event) => setNewCourse((current) => ({ ...current, description: event.target.value }))}
                placeholder="What this course covers"
                rows={3}
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm md:col-span-2"
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
                Create
              </button>
            </div>
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
                    onClick={() =>
                      postTraining(
                        enrollment?.status === 'in_progress' ? 'complete' : 'start',
                        { courseId: course.id, score: 100 },
                        enrollment?.status === 'in_progress' ? 'Training completed' : 'Training started',
                      )
                    }
                    disabled={savingAction === 'start' || savingAction === 'complete'}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#8b1d2c] px-4 text-sm font-black text-white disabled:opacity-50"
                  >
                    {savingAction ? <Loader2 className="h-4 w-4 animate-spin" /> : <BookOpenCheck className="h-4 w-4" />}
                    {enrollment?.status === 'in_progress' ? 'Mark complete' : 'Start training'}
                  </button>
                )}
              </div>
            </article>
          )
        })}
      </section>
    </div>
  )
}
