'use client'

import { Fragment, useEffect, useMemo, useState } from 'react'
import { ModalBase } from '@/components/ModalBase'
import { toast } from 'sonner'

export type QuickStats = {
  attendanceEventsLast7Days: number
  myDocumentCount: number
}

export type EmployeeSummary = {
  id: string
  full_name: string
  email: string
  is_active?: boolean
  pay_basis?: 'salaried' | 'hourly' | null
  hourly_source?: 'contracted' | 'timeclock' | null
  hourly_rate?: number | null
  annual_salary?: number | null
  working_hours_per_week?: number | null
  salary_currency?: string | null
  payroll_effective_from?: string | null
  employment_type?: string | null
  employment_start_date?: string | null
  employment_end_date?: string | null
  work_start_time?: string | null
  work_end_time?: string | null
  national_insurance_number?: string | null
  payroll_notes?: string | null
  location_name?: string | null
  branch_name?: string | null
  branch_code?: string | null
}

type EmployeePolicy = {
  sickPayMode: 'none' | 'statutory' | 'full'
  sspEligibility: 'not-assessed' | 'eligible' | 'not-eligible'
  sspWeeklyRate: string
  sspMaxWeeks: string
  sspRateMode: 'lower-of-cap-or-80pct' | 'fixed'
  paidBreakMinutesPerShift: string
  holidayEntitlementDays: string
  companyPaidHolidayDays: string
  companyUnpaidHolidayDays: string
  bankHolidaysIncluded: boolean
  pensionStatus: 'not-assessed' | 'eligible' | 'enrolled' | 'opted-out' | 'postponed'
  pensionProviderName: string
  pensionEnrolmentDate: string
  leaveAccrualMode: 'none' | 'monthly' | 'pro-rata-hours'
  leaveAccruedDays: string
  leaveAccrualAsOf: string
  overtimeMode: 'none' | 'flat' | 'tiered'
  overtimeThresholdHours: string
  overtimeRateMultiplier: string
  effectiveFrom: string
  notes: string
  policySource: 'manual' | 'uk-default'
  policyContractType: string
}

type CompanyHolidayEntry = {
  id: string
  holidayKey: string
  holidayName: string
  holidayDate: string | null
  isPaid: boolean
  countsTowardAnnualLeave: boolean
  active: boolean
  notes: string | null
}

export type EmployeeDocument = {
  id: string
  employeeId: string
  documentType: 'contract' | 'payslip' | 'other'
  fileName: string
  fileSize: number
  fileType: string
  uploadedAt: string
  minio?: {
    bucket?: string
    key?: string
    etag?: string
  }
}

type Props = {
  currentUserId: string
  roleName: string
  isHrView: boolean
  quickStats: QuickStats
  initialEmployees: EmployeeSummary[]
  initialDocuments: EmployeeDocument[]
  documentsSupported: boolean
}

type CompanyCalendarTemplate = {
  id: string
  holidayKey: string
  holidayName: string
  isPaid: boolean
  countsTowardAnnualLeave: boolean
  active: boolean
  notes: string | null
}

type CompanyCalendarEvent = {
  id: string
  companyHolidayId: string
  eventDate: string
  isPaid: boolean
  countsTowardAnnualLeave: boolean
  appliesToAllStaff: boolean
  notes: string | null
  holidayName: string
  holidayKey: string | null
}

type StaffOffEntry = {
  id: string
  fullName: string
  email: string
}

type TabKey = 'overview' | 'hr' | 'calendar' | 'documents' | 'payslips' | 'leave'

function formatCurrency(value: number | null | undefined) {
  if (typeof value !== 'number' || Number.isNaN(value)) return 'Not set'
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(value)
}

function formatDate(value?: string | null) {
  if (!value) return 'Not set'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return 'Not set'
  return parsed.toLocaleDateString('en-GB')
}

function toNumberOrNull(value: string) {
  const raw = String(value || '').trim()
  if (!raw) return null
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : null
}

function normalizePayBasis(value: string | null | undefined): 'salaried' | 'hourly' {
  const raw = String(value || '').trim().toLowerCase()
  if (['hourly', 'hours', 'timeclock'].includes(raw)) return 'hourly'
  return 'salaried'
}

function normalizeHourlySource(value: string | null | undefined): 'contracted' | 'timeclock' {
  const raw = String(value || '').trim().toLowerCase()
  if (['timeclock', 'clock', 'clocked'].includes(raw)) return 'timeclock'
  return 'contracted'
}

function getEmployeeBranchLabel(employee: EmployeeSummary) {
  const code = String(employee.branch_code || '').trim().toUpperCase()
  const name = String(employee.branch_name || employee.location_name || '').trim()

  if (code && name) return `${name} (${code})`
  if (name) return name
  if (code) return code
  return 'Unassigned branch'
}

function getMonthBounds(month: string) {
  const parsed = new Date(`${month}-01T00:00:00`)
  if (Number.isNaN(parsed.getTime())) return [] as string[]

  const year = parsed.getFullYear()
  const mon = parsed.getMonth()
  const first = new Date(year, mon, 1)
  const last = new Date(year, mon + 1, 0)
  const days = [] as string[]

  for (let day = 1; day <= last.getDate(); day += 1) {
    days.push(`${year}-${String(mon + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`)
  }

  return days
}

function formatIsoDateLocal(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function shiftIsoDate(date: string, dayDelta: number) {
  const parsed = new Date(`${date}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) return date
  parsed.setDate(parsed.getDate() + dayDelta)
  return formatIsoDateLocal(parsed)
}

function shiftMonthValue(month: string, monthDelta: number) {
  const parsed = new Date(`${month}-01T00:00:00`)
  if (Number.isNaN(parsed.getTime())) return month
  parsed.setMonth(parsed.getMonth() + monthDelta)
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}`
}

function getWeekDays(anchorDate: string) {
  const parsed = new Date(`${anchorDate}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) return [] as string[]

  const mondayOffset = (parsed.getDay() + 6) % 7
  parsed.setDate(parsed.getDate() - mondayOffset)

  const days: string[] = []
  for (let index = 0; index < 7; index += 1) {
    const current = new Date(parsed)
    current.setDate(parsed.getDate() + index)
    days.push(formatIsoDateLocal(current))
  }

  return days
}

function getMonthGridDays(month: string) {
  const parsed = new Date(`${month}-01T00:00:00`)
  if (Number.isNaN(parsed.getTime())) return [] as Array<string | null>

  const year = parsed.getFullYear()
  const monthIndex = parsed.getMonth()
  const firstDay = new Date(year, monthIndex, 1)
  const leadingEmptyDays = (firstDay.getDay() + 6) % 7
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate()
  const cells: Array<string | null> = []

  for (let index = 0; index < leadingEmptyDays; index += 1) {
    cells.push(null)
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(`${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`)
  }

  while (cells.length % 7 !== 0) {
    cells.push(null)
  }

  return cells
}

function getVisibleCalendarMonths(view: 'month' | 'week', month: string, viewDate: string) {
  if (view === 'month') return [month]

  return Array.from(new Set(getWeekDays(viewDate).map((day) => day.slice(0, 7))))
}

function normalizeHolidayName(value: string | null | undefined) {
  return String(value || '')
    .replace(/\s*-\s*day\s*\d+\s*$/i, '')
    .trim()
}

function getOrdinalSuffix(day: number) {
  if (day % 100 >= 11 && day % 100 <= 13) return 'th'
  switch (day % 10) {
    case 1:
      return 'st'
    case 2:
      return 'nd'
    case 3:
      return 'rd'
    default:
      return 'th'
  }
}

function formatReadableDate(isoDate: string) {
  const parsed = new Date(`${isoDate}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) return isoDate
  const day = parsed.getDate()
  const month = parsed.toLocaleDateString('en-GB', { month: 'long' })
  return `${day}${getOrdinalSuffix(day)} ${month}`
}

function getHolidayTheme(
  holidayKey: string | null | undefined,
  isPaid: boolean,
  countsTowardAnnualLeave: boolean,
) {
  const key = String(holidayKey || '').toLowerCase()

  if (key.includes('fitr')) {
    return {
      blockClass: 'border-emerald-200 bg-emerald-50 text-emerald-950',
      chipClass: 'bg-emerald-100 text-emerald-900',
    }
  }

  if (key.includes('adha')) {
    return {
      blockClass: 'border-sky-200 bg-sky-50 text-sky-950',
      chipClass: 'bg-sky-100 text-sky-900',
    }
  }

  if (key.includes('ashura')) {
    return {
      blockClass: 'border-amber-200 bg-amber-50 text-amber-950',
      chipClass: 'bg-amber-100 text-amber-900',
    }
  }

  if (key.includes('reallocation')) {
    return {
      blockClass: 'border-violet-200 bg-violet-50 text-violet-950',
      chipClass: 'bg-violet-100 text-violet-900',
    }
  }

  if (!isPaid) {
    return {
      blockClass: 'border-amber-200 bg-amber-50 text-amber-950',
      chipClass: 'bg-amber-100 text-amber-900',
    }
  }

  if (countsTowardAnnualLeave) {
    return {
      blockClass: 'border-emerald-200 bg-emerald-50 text-emerald-950',
      chipClass: 'bg-emerald-100 text-emerald-900',
    }
  }

  return {
    blockClass: 'border-slate-200 bg-slate-50 text-slate-900',
    chipClass: 'bg-slate-200 text-slate-800',
  }
}

export default function EmployeeRecordClient({
  currentUserId,
  roleName,
  isHrView,
  quickStats,
  initialEmployees,
  initialDocuments,
  documentsSupported,
}: Props) {
  const [activeTab, setActiveTab] = useState<TabKey>('overview')
  const [employees, setEmployees] = useState<EmployeeSummary[]>(initialEmployees)
  const [selectedBranch, setSelectedBranch] = useState<string>('all')
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>(
    initialEmployees[0]?.id || currentUserId,
  )
  const [documents, setDocuments] = useState<EmployeeDocument[]>(initialDocuments)
  const [documentType, setDocumentType] = useState<'contract' | 'payslip' | 'other'>('contract')
  const [uploading, setUploading] = useState(false)
  const [savingPayroll, setSavingPayroll] = useState(false)
  const [savingPolicy, setSavingPolicy] = useState(false)
  const [payrollError, setPayrollError] = useState<string | null>(null)
  const [policyError, setPolicyError] = useState<string | null>(null)
  const [calendarTemplates, setCalendarTemplates] = useState<CompanyCalendarTemplate[]>([])
  const [calendarEvents, setCalendarEvents] = useState<CompanyCalendarEvent[]>([])
  const [staffOffByDate, setStaffOffByDate] = useState<Record<string, StaffOffEntry[]>>({})
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })
  const [calendarView, setCalendarView] = useState<'month' | 'week'>('month')
  const [calendarViewDate, setCalendarViewDate] = useState(() => formatIsoDateLocal(new Date()))
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<string | null>(null)
  const [savingCalendar, setSavingCalendar] = useState(false)
  const [calendarSettingsOpen, setCalendarSettingsOpen] = useState(false)
  const [deletedCalendarTemplateIds, setDeletedCalendarTemplateIds] = useState<string[]>([])
  const todayIso = useMemo(() => formatIsoDateLocal(new Date()), [])

  const selectedEmployee = useMemo(
    () => employees.find((employee) => employee.id === selectedEmployeeId) || null,
    [employees, selectedEmployeeId],
  )

  const branchOptions = useMemo(() => {
    const labels = Array.from(new Set(employees.map((employee) => getEmployeeBranchLabel(employee))))
    return labels.sort((a, b) => a.localeCompare(b))
  }, [employees])

  const filteredEmployees = useMemo(() => {
    if (selectedBranch === 'all') return employees
    return employees.filter((employee) => getEmployeeBranchLabel(employee) === selectedBranch)
  }, [employees, selectedBranch])

  const [payrollForm, setPayrollForm] = useState({
    payBasis: normalizePayBasis(selectedEmployee?.pay_basis),
    hourlySource: normalizeHourlySource(selectedEmployee?.hourly_source),
    hourlyRate: selectedEmployee?.hourly_rate?.toString() || '',
    annualSalary: selectedEmployee?.annual_salary?.toString() || '',
    workingHoursPerWeek: selectedEmployee?.working_hours_per_week?.toString() || '',
    salaryCurrency: selectedEmployee?.salary_currency || 'GBP',
    payrollEffectiveFrom: selectedEmployee?.payroll_effective_from || '',
    employmentType: selectedEmployee?.employment_type || '',
    employmentStartDate: selectedEmployee?.employment_start_date || '',
    employmentEndDate: selectedEmployee?.employment_end_date || '',
    workStartTime: selectedEmployee?.work_start_time || '',
    workEndTime: selectedEmployee?.work_end_time || '',
    nationalInsuranceNumber: selectedEmployee?.national_insurance_number || '',
    payrollNotes: selectedEmployee?.payroll_notes || '',
  })

  const [policyForm, setPolicyForm] = useState<EmployeePolicy>({
    sickPayMode: 'statutory',
    sspEligibility: 'not-assessed',
    sspWeeklyRate: '',
    sspMaxWeeks: '28',
    sspRateMode: 'lower-of-cap-or-80pct',
    paidBreakMinutesPerShift: '',
    holidayEntitlementDays: '28',
    companyPaidHolidayDays: '4',
    companyUnpaidHolidayDays: '1',
    bankHolidaysIncluded: true,
    pensionStatus: 'not-assessed',
    pensionProviderName: '',
    pensionEnrolmentDate: '',
    leaveAccrualMode: 'monthly',
    leaveAccruedDays: '0',
    leaveAccrualAsOf: '',
    overtimeMode: 'none',
    overtimeThresholdHours: '',
    overtimeRateMultiplier: '1',
    effectiveFrom: '',
    notes: '',
    policySource: 'manual',
    policyContractType: '',
  })
  const [recommendedPolicy, setRecommendedPolicy] = useState<EmployeePolicy | null>(null)

  const compensationSummary = useMemo(() => {
    const hoursPerWeek = toNumberOrNull(payrollForm.workingHoursPerWeek)
    const hourlyRate = toNumberOrNull(payrollForm.hourlyRate)
    const annualSalary = toNumberOrNull(payrollForm.annualSalary)

    const weeklyFromHourly =
      hourlyRate !== null && hoursPerWeek !== null ? hourlyRate * hoursPerWeek : null
    const yearlyFromHourly = weeklyFromHourly !== null ? weeklyFromHourly * 52 : null
    const monthlyFromAnnual = annualSalary !== null ? annualSalary / 12 : null

    return {
      weeklyFromHourly,
      yearlyFromHourly,
      monthlyFromAnnual,
    }
  }, [payrollForm.annualSalary, payrollForm.hourlyRate, payrollForm.workingHoursPerWeek])

  const monthDays = useMemo(() => getMonthBounds(calendarMonth), [calendarMonth])
  const monthGridDays = useMemo(() => getMonthGridDays(calendarMonth), [calendarMonth])
  const weekDays = useMemo(() => getWeekDays(calendarViewDate), [calendarViewDate])
  const visibleCalendarMonths = useMemo(
    () => getVisibleCalendarMonths(calendarView, calendarMonth, calendarViewDate),
    [calendarMonth, calendarView, calendarViewDate],
  )
  const visibleCalendarDays = useMemo(
    () => (calendarView === 'week' ? weekDays : monthDays),
    [calendarView, monthDays, weekDays],
  )
  const activeCalendarTemplates = useMemo(
    () => calendarTemplates.filter((template) => template.active),
    [calendarTemplates],
  )
  const calendarEventsByDate = useMemo(() => {
    const map: Record<string, CompanyCalendarEvent[]> = {}
    for (const event of calendarEvents) {
      const key = event.eventDate
      if (!map[key]) map[key] = []
      map[key].push(event)
    }
    return map
  }, [calendarEvents])

  const loadCompanyCalendar = async (months: string[] = visibleCalendarMonths) => {
    if (!isHrView) return
    const mergedTemplates = new Map<string, CompanyCalendarTemplate>()
    const mergedEvents = new Map<string, CompanyCalendarEvent>()
    const mergedStaffOff: Record<string, StaffOffEntry[]> = {}

    const results = await Promise.all(
      months.map(async (month) => {
        const response = await fetch(
          `/api/employee-record/company-calendar?month=${encodeURIComponent(month)}`,
        )
        const payload = await response.json().catch(() => ({}))

        if (!response.ok) {
          throw new Error(payload?.error || 'Failed to load company calendar')
        }

        return payload
      }),
    )

    for (const payload of results) {
      for (const template of payload?.templates || []) {
        if (!mergedTemplates.has(template.id)) {
          mergedTemplates.set(template.id, {
            ...template,
            holidayName: normalizeHolidayName(template.holidayName),
          })
        }
      }

      for (const event of payload?.events || []) {
        mergedEvents.set(event.id, event)
      }

      for (const [date, staffEntries] of Object.entries(payload?.staffOffByDate || {})) {
        const current = mergedStaffOff[date] || []
        const seen = new Set(current.map((entry) => entry.id))
        for (const staff of (staffEntries as StaffOffEntry[]) || []) {
          if (!seen.has(staff.id)) {
            current.push(staff)
            seen.add(staff.id)
          }
        }
        mergedStaffOff[date] = current
      }
    }

    setCalendarTemplates(Array.from(mergedTemplates.values()))
    setDeletedCalendarTemplateIds([])
    setCalendarEvents(
      Array.from(mergedEvents.values()).sort((left, right) => left.eventDate.localeCompare(right.eventDate)),
    )
    setStaffOffByDate(mergedStaffOff)
  }

  const createCalendarEvent = async (templateId: string, eventDate: string) => {
    const response = await fetch('/api/employee-record/company-calendar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ companyHolidayId: templateId, eventDate, appliesToAllStaff: true }),
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(payload?.error || 'Failed to create calendar event')
    await loadCompanyCalendar(visibleCalendarMonths)
  }

  const moveCalendarEvent = async (eventId: string, eventDate: string) => {
    const response = await fetch('/api/employee-record/company-calendar', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events: [{ id: eventId, eventDate }] }),
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(payload?.error || 'Failed to move calendar event')
    await loadCompanyCalendar(visibleCalendarMonths)
  }

  const deleteCalendarEvent = async (eventId: string) => {
    const response = await fetch(`/api/employee-record/company-calendar?eventId=${encodeURIComponent(eventId)}`, {
      method: 'DELETE',
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(payload?.error || 'Failed to delete calendar event')
    await loadCompanyCalendar(visibleCalendarMonths)
  }

  const handleCalendarDrop = (event: React.DragEvent<HTMLElement>, day: string) => {
    event.preventDefault()
    const raw = event.dataTransfer.getData('text/plain')
    if (!raw) return

    try {
      const parsed = JSON.parse(raw) as
        | { type: 'template'; templateId: string }
        | { type: 'event'; eventId: string }

      if (parsed.type === 'template') {
        void createCalendarEvent(parsed.templateId, day).catch((error) => {
          toast.error(error instanceof Error ? error.message : 'Failed to create calendar event')
        })
      } else if (parsed.type === 'event') {
        void moveCalendarEvent(parsed.eventId, day).catch((error) => {
          toast.error(error instanceof Error ? error.message : 'Failed to move calendar event')
        })
      }
    } catch {
      toast.error('Invalid drag data')
    }
  }

  const weekHourSlots = useMemo(
    () => Array.from({ length: 12 }, (_, index) => 10 + index),
    [],
  )

  const saveCalendarTemplateSettings = async () => {
    setSavingCalendar(true)
    try {
      const existingTemplates = calendarTemplates.filter((template) => !template.id.startsWith('new-'))
      const newTemplates = calendarTemplates.filter((template) => template.id.startsWith('new-'))

      const response = await fetch('/api/employee-record/company-calendar', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templates: existingTemplates.map((template) => ({
            id: template.id,
            holidayName: normalizeHolidayName(template.holidayName),
            isPaid: template.isPaid,
            countsTowardAnnualLeave: template.countsTowardAnnualLeave,
            active: template.active,
            notes: template.notes,
          })),
          createTemplates: newTemplates
            .map((template) => ({
              holidayName: normalizeHolidayName(template.holidayName),
              isPaid: template.isPaid,
              countsTowardAnnualLeave: template.countsTowardAnnualLeave,
              active: template.active,
              notes: template.notes,
            }))
            .filter((template) => template.holidayName),
          deleteTemplateIds: deletedCalendarTemplateIds,
        }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload?.error || 'Failed to save calendar settings')
      toast.success('Company calendar settings updated')
      await loadCompanyCalendar(visibleCalendarMonths)
      return true
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save calendar settings')
      return false
    } finally {
      setSavingCalendar(false)
    }
  }

  const addCalendarTemplateDraft = () => {
    const draftId = `new-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
    setCalendarTemplates((current) => [
      ...current,
      {
        id: draftId,
        holidayKey: draftId,
        holidayName: 'New Holiday',
        isPaid: true,
        countsTowardAnnualLeave: true,
        active: true,
        notes: null,
      },
    ])
  }

  const removeCalendarTemplate = (templateId: string) => {
    setCalendarTemplates((current) => current.filter((template) => template.id !== templateId))
    if (templateId.startsWith('new-')) return
    setDeletedCalendarTemplateIds((current) => (current.includes(templateId) ? current : [...current, templateId]))
  }

  const refreshDocuments = async (employeeId = selectedEmployeeId) => {
    const params = new URLSearchParams({ employeeId })
    const response = await fetch(`/api/employee-record/documents?${params.toString()}`)
    const payload = await response.json().catch(() => ({}))

    if (!response.ok) {
      throw new Error(payload?.error || 'Failed to load employee documents')
    }

    if (payload?.supported === false) {
      toast.error(payload?.message || 'Employee documents are not available yet')
      setDocuments([])
      return
    }

    setDocuments(payload?.documents || [])
  }

  const handleSelectEmployee = async (employeeId: string) => {
    setSelectedEmployeeId(employeeId)
    const nextEmployee = employees.find((employee) => employee.id === employeeId)
    setPayrollForm({
      payBasis: normalizePayBasis(nextEmployee?.pay_basis),
      hourlySource: normalizeHourlySource(nextEmployee?.hourly_source),
      hourlyRate: nextEmployee?.hourly_rate?.toString() || '',
      annualSalary: nextEmployee?.annual_salary?.toString() || '',
      workingHoursPerWeek: nextEmployee?.working_hours_per_week?.toString() || '',
      salaryCurrency: nextEmployee?.salary_currency || 'GBP',
      payrollEffectiveFrom: nextEmployee?.payroll_effective_from || '',
      employmentType: nextEmployee?.employment_type || '',
      employmentStartDate: nextEmployee?.employment_start_date || '',
      employmentEndDate: nextEmployee?.employment_end_date || '',
      workStartTime: nextEmployee?.work_start_time || '',
      workEndTime: nextEmployee?.work_end_time || '',
      nationalInsuranceNumber: nextEmployee?.national_insurance_number || '',
      payrollNotes: nextEmployee?.payroll_notes || '',
    })

    try {
      await refreshDocuments(employeeId)
      if (isHrView) {
        await loadPolicy(employeeId)
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load employee documents')
    }
  }

  const loadPolicy = async (employeeId = selectedEmployeeId) => {
    if (!isHrView) return

    const response = await fetch(`/api/employee-record/policy/${employeeId}`)
    const payload = await response.json().catch(() => ({}))

    if (!response.ok) {
      throw new Error(payload?.error || 'Failed to load policy settings')
    }

    const recommended: EmployeePolicy | null = payload?.recommendedPolicy
      ? {
          sickPayMode:
            payload.recommendedPolicy.sickPayMode === 'none' ||
            payload.recommendedPolicy.sickPayMode === 'full'
              ? payload.recommendedPolicy.sickPayMode
              : 'statutory',
          sspEligibility:
            payload.recommendedPolicy.sspEligibility === 'eligible' ||
            payload.recommendedPolicy.sspEligibility === 'not-eligible'
              ? payload.recommendedPolicy.sspEligibility
              : 'not-assessed',
          sspWeeklyRate:
            typeof payload.recommendedPolicy.sspWeeklyRate === 'number'
              ? String(payload.recommendedPolicy.sspWeeklyRate)
              : '',
          sspMaxWeeks:
            typeof payload.recommendedPolicy.sspMaxWeeks === 'number'
              ? String(payload.recommendedPolicy.sspMaxWeeks)
              : '28',
          sspRateMode:
            payload.recommendedPolicy.sspRateMode === 'fixed'
              ? 'fixed'
              : 'lower-of-cap-or-80pct',
          paidBreakMinutesPerShift:
            typeof payload.recommendedPolicy.paidBreakMinutesPerShift === 'number'
              ? String(payload.recommendedPolicy.paidBreakMinutesPerShift)
              : '',
          holidayEntitlementDays:
            typeof payload.recommendedPolicy.holidayEntitlementDays === 'number'
              ? String(payload.recommendedPolicy.holidayEntitlementDays)
              : '28',
          companyPaidHolidayDays:
            typeof payload.recommendedPolicy.companyPaidHolidayDays === 'number'
              ? String(payload.recommendedPolicy.companyPaidHolidayDays)
              : '4',
          companyUnpaidHolidayDays:
            typeof payload.recommendedPolicy.companyUnpaidHolidayDays === 'number'
              ? String(payload.recommendedPolicy.companyUnpaidHolidayDays)
              : '1',
          bankHolidaysIncluded: Boolean(payload.recommendedPolicy.bankHolidaysIncluded ?? true),
          pensionStatus:
            payload.recommendedPolicy.pensionStatus === 'eligible' ||
            payload.recommendedPolicy.pensionStatus === 'enrolled' ||
            payload.recommendedPolicy.pensionStatus === 'opted-out' ||
            payload.recommendedPolicy.pensionStatus === 'postponed'
              ? payload.recommendedPolicy.pensionStatus
              : 'not-assessed',
          pensionProviderName: payload.recommendedPolicy.pensionProviderName || '',
          pensionEnrolmentDate: payload.recommendedPolicy.pensionEnrolmentDate || '',
          leaveAccrualMode:
            payload.recommendedPolicy.leaveAccrualMode === 'none' ||
            payload.recommendedPolicy.leaveAccrualMode === 'pro-rata-hours'
              ? payload.recommendedPolicy.leaveAccrualMode
              : 'monthly',
          leaveAccruedDays:
            typeof payload.recommendedPolicy.leaveAccruedDays === 'number'
              ? String(payload.recommendedPolicy.leaveAccruedDays)
              : '0',
          leaveAccrualAsOf: payload.recommendedPolicy.leaveAccrualAsOf || '',
          overtimeMode:
            payload.recommendedPolicy.overtimeMode === 'flat' ||
            payload.recommendedPolicy.overtimeMode === 'tiered'
              ? payload.recommendedPolicy.overtimeMode
              : 'none',
          overtimeThresholdHours:
            typeof payload.recommendedPolicy.overtimeThresholdHours === 'number'
              ? String(payload.recommendedPolicy.overtimeThresholdHours)
              : '',
          overtimeRateMultiplier:
            typeof payload.recommendedPolicy.overtimeRateMultiplier === 'number'
              ? String(payload.recommendedPolicy.overtimeRateMultiplier)
              : '1',
          effectiveFrom: payload.recommendedPolicy.effectiveFrom || '',
          notes: payload.recommendedPolicy.notes || '',
          policySource: payload.recommendedPolicy.policySource === 'uk-default' ? 'uk-default' : 'manual',
          policyContractType: payload.recommendedPolicy.policyContractType || '',
        }
      : null
    setRecommendedPolicy(recommended)

    if (payload?.supported === false || !payload?.policy) {
      setPolicyForm(
        recommended || {
          sickPayMode: 'statutory',
          sspEligibility: 'not-assessed',
          sspWeeklyRate: '',
          sspMaxWeeks: '28',
          sspRateMode: 'lower-of-cap-or-80pct',
          paidBreakMinutesPerShift: '',
          holidayEntitlementDays: '28',
          companyPaidHolidayDays: '4',
          companyUnpaidHolidayDays: '1',
          bankHolidaysIncluded: true,
          pensionStatus: 'not-assessed',
          pensionProviderName: '',
          pensionEnrolmentDate: '',
          leaveAccrualMode: 'monthly',
          leaveAccruedDays: '0',
          leaveAccrualAsOf: '',
          overtimeMode: 'none',
          overtimeThresholdHours: '',
          overtimeRateMultiplier: '1',
          effectiveFrom: '',
          notes: '',
          policySource: 'manual',
          policyContractType: '',
        },
      )
      return
    }

    const policy = payload.policy
    setPolicyForm({
      sickPayMode: policy.sickPayMode || 'statutory',
      sspEligibility: policy.sspEligibility || 'not-assessed',
      sspWeeklyRate: typeof policy.sspWeeklyRate === 'number' ? String(policy.sspWeeklyRate) : '',
      sspMaxWeeks: typeof policy.sspMaxWeeks === 'number' ? String(policy.sspMaxWeeks) : '28',
      sspRateMode: policy.sspRateMode === 'fixed' ? 'fixed' : 'lower-of-cap-or-80pct',
      paidBreakMinutesPerShift:
        typeof policy.paidBreakMinutesPerShift === 'number'
          ? String(policy.paidBreakMinutesPerShift)
          : '',
      holidayEntitlementDays:
        typeof policy.holidayEntitlementDays === 'number'
          ? String(policy.holidayEntitlementDays)
          : '28',
      companyPaidHolidayDays:
        typeof policy.companyPaidHolidayDays === 'number' ? String(policy.companyPaidHolidayDays) : '4',
      companyUnpaidHolidayDays:
        typeof policy.companyUnpaidHolidayDays === 'number' ? String(policy.companyUnpaidHolidayDays) : '1',
      bankHolidaysIncluded: Boolean(policy.bankHolidaysIncluded ?? true),
      pensionStatus: policy.pensionStatus || 'not-assessed',
      pensionProviderName: policy.pensionProviderName || '',
      pensionEnrolmentDate: policy.pensionEnrolmentDate || '',
      leaveAccrualMode:
        policy.leaveAccrualMode === 'none' || policy.leaveAccrualMode === 'pro-rata-hours'
          ? policy.leaveAccrualMode
          : 'monthly',
      leaveAccruedDays:
        typeof policy.leaveAccruedDays === 'number' ? String(policy.leaveAccruedDays) : '0',
      leaveAccrualAsOf: policy.leaveAccrualAsOf || '',
      overtimeMode: policy.overtimeMode || 'none',
      overtimeThresholdHours:
        typeof policy.overtimeThresholdHours === 'number'
          ? String(policy.overtimeThresholdHours)
          : '',
      overtimeRateMultiplier:
        typeof policy.overtimeRateMultiplier === 'number'
          ? String(policy.overtimeRateMultiplier)
          : '1',
      effectiveFrom: policy.effectiveFrom || '',
      notes: policy.notes || '',
      policySource: policy.policySource === 'uk-default' ? 'uk-default' : 'manual',
      policyContractType: policy.policyContractType || '',
    })
  }

  const applyRecommendedPolicy = () => {
    if (!recommendedPolicy) {
      toast.error('No UK recommendation available for this employee yet')
      return
    }

    setPolicyForm(recommendedPolicy)
    setPolicyError(null)
    toast.success('Applied UK baseline policy. You can still edit any field before saving.')
  }

  useEffect(() => {
    if (!isHrView || !selectedEmployeeId) return
    void loadPolicy(selectedEmployeeId).catch((error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to load policy settings')
    })
  }, [isHrView, selectedEmployeeId])

  useEffect(() => {
    if (filteredEmployees.length === 0) return
    if (filteredEmployees.some((employee) => employee.id === selectedEmployeeId)) return
    void handleSelectEmployee(filteredEmployees[0].id)
  }, [filteredEmployees, selectedEmployeeId])

  useEffect(() => {
    if (!isHrView) return
    if (activeTab !== 'calendar') return
    void loadCompanyCalendar(visibleCalendarMonths).catch((error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to load company calendar')
    })
  }, [isHrView, activeTab, visibleCalendarMonths])

  const handleCalendarPeriodChange = (direction: -1 | 1) => {
    if (calendarView === 'week') {
      const nextDate = shiftIsoDate(calendarViewDate, direction * 7)
      setCalendarViewDate(nextDate)
      setCalendarMonth(nextDate.slice(0, 7))
      return
    }

    const nextMonth = shiftMonthValue(calendarMonth, direction)
    setCalendarMonth(nextMonth)
    setCalendarViewDate(`${nextMonth}-01`)
  }

  const calendarPeriodLabel = useMemo(() => {
    if (calendarView === 'week') {
      if (weekDays.length === 0) return 'Current week'
      const weekStart = new Date(`${weekDays[0]}T00:00:00`)
      const weekEnd = new Date(`${weekDays[6]}T00:00:00`)
      return `${weekStart.toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
      })} - ${weekEnd.toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })}`
    }

    const monthStart = new Date(`${calendarMonth}-01T00:00:00`)
    if (Number.isNaN(monthStart.getTime())) return calendarMonth
    return monthStart.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
  }, [calendarMonth, calendarView, weekDays])

  const handleSavePayroll = async () => {
    if (!selectedEmployeeId) {
      toast.error('Select an employee first')
      return
    }

    const hourlyRate = toNumberOrNull(payrollForm.hourlyRate)
    const annualSalary = toNumberOrNull(payrollForm.annualSalary)
    const hoursPerWeek = toNumberOrNull(payrollForm.workingHoursPerWeek)

    if (payrollForm.payBasis === 'salaried' && annualSalary === null) {
      setPayrollError('Base pay required: enter Annual Salary for a salaried employee.')
      return
    }

    if (payrollForm.payBasis === 'hourly' && hourlyRate === null) {
      setPayrollError('Base pay required: enter Hourly Rate for an hourly employee.')
      return
    }

    if (hourlyRate !== null && hourlyRate < 0) {
      setPayrollError('Hourly rate cannot be negative')
      return
    }

    if (annualSalary !== null && annualSalary < 0) {
      setPayrollError('Annual salary cannot be negative')
      return
    }

    if (hoursPerWeek !== null && (hoursPerWeek < 0 || hoursPerWeek > 168)) {
      setPayrollError('Working hours per week must be between 0 and 168')
      return
    }

    if (
      payrollForm.employmentStartDate &&
      payrollForm.employmentEndDate &&
      payrollForm.employmentEndDate < payrollForm.employmentStartDate
    ) {
      setPayrollError('Employment end date cannot be before start date')
      return
    }

    if (
      payrollForm.workStartTime &&
      payrollForm.workEndTime &&
      payrollForm.workEndTime <= payrollForm.workStartTime
    ) {
      setPayrollError('Work finish time must be after start time')
      return
    }

    setPayrollError(null)

    setSavingPayroll(true)
    try {
      const response = await fetch(`/api/employee-record/payroll/${selectedEmployeeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payBasis: normalizePayBasis(payrollForm.payBasis),
          hourlySource:
            normalizePayBasis(payrollForm.payBasis) === 'hourly'
              ? normalizeHourlySource(payrollForm.hourlySource)
              : null,
          hourlyRate: payrollForm.hourlyRate,
          annualSalary: payrollForm.annualSalary,
          workingHoursPerWeek: payrollForm.workingHoursPerWeek,
          salaryCurrency: payrollForm.salaryCurrency,
          payrollEffectiveFrom: payrollForm.payrollEffectiveFrom || null,
          employmentType: payrollForm.employmentType,
          employmentStartDate: payrollForm.employmentStartDate || null,
          employmentEndDate: payrollForm.employmentEndDate || null,
          workStartTime: payrollForm.workStartTime || null,
          workEndTime: payrollForm.workEndTime || null,
          nationalInsuranceNumber: payrollForm.nationalInsuranceNumber || null,
          payrollNotes: payrollForm.payrollNotes,
        }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to save payroll details')
      }

      const updated = payload?.employee || {}
      setEmployees((current) =>
        current.map((employee) =>
          employee.id === selectedEmployeeId
            ? {
                ...employee,
                pay_basis: updated.payBasis ?? 'salaried',
                hourly_source: updated.hourlySource ?? null,
                hourly_rate: updated.hourlyRate ?? null,
                annual_salary: updated.annualSalary ?? null,
                working_hours_per_week: updated.workingHoursPerWeek ?? null,
                salary_currency: updated.salaryCurrency ?? 'GBP',
                payroll_effective_from: updated.payrollEffectiveFrom ?? null,
                employment_type: updated.employmentType ?? null,
                employment_start_date: updated.employmentStartDate ?? null,
                employment_end_date: updated.employmentEndDate ?? null,
                work_start_time: updated.workStartTime ?? null,
                work_end_time: updated.workEndTime ?? null,
                national_insurance_number: updated.nationalInsuranceNumber ?? null,
                payroll_notes: updated.payrollNotes ?? null,
              }
            : employee,
        ),
      )

      toast.success('Payroll details updated')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save payroll details')
      setPayrollError(error instanceof Error ? error.message : 'Failed to save payroll details')
    } finally {
      setSavingPayroll(false)
    }
  }

  const handleSavePolicy = async () => {
    if (!selectedEmployeeId) {
      toast.error('Select an employee first')
      return
    }

    const sspWeeklyRate = toNumberOrNull(policyForm.sspWeeklyRate)
    const sspMaxWeeks = toNumberOrNull(policyForm.sspMaxWeeks)
    const paidBreakMinutes = toNumberOrNull(policyForm.paidBreakMinutesPerShift)
    const holidayEntitlement = toNumberOrNull(policyForm.holidayEntitlementDays)
    const companyPaidHolidayDays = toNumberOrNull(policyForm.companyPaidHolidayDays)
    const companyUnpaidHolidayDays = toNumberOrNull(policyForm.companyUnpaidHolidayDays)
    const leaveAccruedDays = toNumberOrNull(policyForm.leaveAccruedDays)
    const overtimeThreshold = toNumberOrNull(policyForm.overtimeThresholdHours)
    const overtimeMultiplier = toNumberOrNull(policyForm.overtimeRateMultiplier)

    if (sspWeeklyRate !== null && sspWeeklyRate < 0) {
      setPolicyError('SSP weekly rate cannot be negative')
      return
    }

    if (sspMaxWeeks !== null && (sspMaxWeeks <= 0 || sspMaxWeeks > 28)) {
      setPolicyError('SSP max weeks must be between 1 and 28')
      return
    }

    if (paidBreakMinutes !== null && paidBreakMinutes < 0) {
      setPolicyError('Paid break minutes cannot be negative')
      return
    }

    if (holidayEntitlement !== null && holidayEntitlement < 0) {
      setPolicyError('Holiday entitlement cannot be negative')
      return
    }

    if (companyPaidHolidayDays !== null && companyPaidHolidayDays < 0) {
      setPolicyError('Company paid holiday days cannot be negative')
      return
    }

    if (companyUnpaidHolidayDays !== null && companyUnpaidHolidayDays < 0) {
      setPolicyError('Company unpaid holiday days cannot be negative')
      return
    }

    if (holidayEntitlement !== null && holidayEntitlement < 5.6) {
      setPolicyError('Holiday entitlement is too low. Enter annual days equivalent to at least 5.6 weeks (pro-rated if part-time).')
      return
    }

    if (
      holidayEntitlement !== null &&
      companyPaidHolidayDays !== null &&
      companyPaidHolidayDays > holidayEntitlement
    ) {
      setPolicyError('Company paid holiday days cannot exceed annual leave entitlement')
      return
    }

    if (leaveAccruedDays !== null && leaveAccruedDays < 0) {
      setPolicyError('Accrued leave days cannot be negative')
      return
    }

    if (overtimeThreshold !== null && overtimeThreshold < 0) {
      setPolicyError('Overtime threshold cannot be negative')
      return
    }

    if (overtimeMultiplier !== null && overtimeMultiplier < 1) {
      setPolicyError('Overtime multiplier must be at least 1')
      return
    }

    setPolicyError(null)
    setSavingPolicy(true)

    try {
      const response = await fetch(`/api/employee-record/policy/${selectedEmployeeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sickPayMode: policyForm.sickPayMode,
          sspEligibility: policyForm.sspEligibility,
          sspWeeklyRate: policyForm.sspWeeklyRate || null,
          sspMaxWeeks: policyForm.sspMaxWeeks || null,
          sspRateMode: policyForm.sspRateMode,
          paidBreakMinutesPerShift: policyForm.paidBreakMinutesPerShift || null,
          holidayEntitlementDays: policyForm.holidayEntitlementDays || null,
          companyPaidHolidayDays: policyForm.companyPaidHolidayDays || null,
          companyUnpaidHolidayDays: policyForm.companyUnpaidHolidayDays || null,
          bankHolidaysIncluded: policyForm.bankHolidaysIncluded,
          pensionStatus: policyForm.pensionStatus,
          pensionProviderName: policyForm.pensionProviderName || null,
          pensionEnrolmentDate: policyForm.pensionEnrolmentDate || null,
          leaveAccrualMode: policyForm.leaveAccrualMode,
          leaveAccruedDays: policyForm.leaveAccruedDays || null,
          leaveAccrualAsOf: policyForm.leaveAccrualAsOf || null,
          overtimeMode: policyForm.overtimeMode,
          overtimeThresholdHours: policyForm.overtimeThresholdHours || null,
          overtimeRateMultiplier: policyForm.overtimeRateMultiplier || null,
          effectiveFrom: policyForm.effectiveFrom || null,
          notes: policyForm.notes || null,
          policySource: policyForm.policySource,
          policyContractType: policyForm.policyContractType || null,
        }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to save policy settings')
      }

      toast.success('Policy settings updated')
    } catch (error) {
      setPolicyError(error instanceof Error ? error.message : 'Failed to save policy settings')
      toast.error(error instanceof Error ? error.message : 'Failed to save policy settings')
    } finally {
      setSavingPolicy(false)
    }
  }

  const handleUploadDocument = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    if (!selectedEmployeeId) {
      toast.error('Select an employee first')
      return
    }

    setUploading(true)
    try {
      const uploadData = new FormData()
      uploadData.append('file', file)
      uploadData.append('employeeId', selectedEmployeeId)
      uploadData.append('category', documentType)

      const uploadResponse = await fetch('/api/documents/upload-direct', {
        method: 'POST',
        body: uploadData,
      })
      const uploadPayload = await uploadResponse.json().catch(() => ({}))

      if (!uploadResponse.ok) {
        throw new Error(uploadPayload?.error || 'Failed to upload file')
      }

      const saveResponse = await fetch('/api/employee-record/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentId: uploadPayload?.data?.documentId || uploadPayload?.documentId,
          employeeId: selectedEmployeeId,
          documentType,
          fileName: uploadPayload?.data?.fileName || uploadPayload?.fileName || file.name,
          fileType: uploadPayload?.data?.fileType || uploadPayload?.fileType || file.type,
          fileSize: file.size,
          minioKey: uploadPayload?.data?.minioKey || uploadPayload?.minioKey,
          minioEtag: uploadPayload?.data?.etag || uploadPayload?.etag,
          storageBucket: uploadPayload?.data?.storageBucket || uploadPayload?.storageBucket,
        }),
      })
      const savePayload = await saveResponse.json().catch(() => ({}))

      if (!saveResponse.ok) {
        throw new Error(savePayload?.error || 'Failed to save employee document metadata')
      }

      await refreshDocuments(selectedEmployeeId)
      toast.success('Document uploaded')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to upload document')
    } finally {
      setUploading(false)
      event.target.value = ''
    }
  }

  const payslips = documents.filter((doc) => doc.documentType === 'payslip')

  const openPreview = (document: EmployeeDocument) => {
    const key = document.minio?.key
    if (!key) {
      toast.error('Preview key is missing for this document')
      return
    }

    window.open(`/api/documents/preview?key=${encodeURIComponent(key)}`, '_blank', 'noopener,noreferrer')
  }

  const openDownload = (document: EmployeeDocument) => {
    const key = document.minio?.key
    if (!key) {
      toast.error('Download key is missing for this document')
      return
    }

    window.open(`/api/documents/download?key=${encodeURIComponent(key)}`, '_blank', 'noopener,noreferrer')
  }

  const fieldClass =
    'mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-slate-800 shadow-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200'
  const helpTextClass = 'mt-1 text-xs text-slate-500'

  const tabItems: Array<{ key: TabKey; label: string; icon: string }> = [
    { key: 'overview', label: 'Overview', icon: '▦' },
    ...(isHrView ? [{ key: 'hr' as TabKey, label: 'HR Setup', icon: '⚙' }] : []),
    ...(isHrView ? [{ key: 'calendar' as TabKey, label: 'Company Calendar', icon: '◩' }] : []),
    { key: 'documents', label: 'Documents', icon: '⛃' },
    { key: 'payslips', label: 'Payslips', icon: '£' },
    { key: 'leave', label: 'Book Leave', icon: '◷' },
  ]

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-4 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">My Role</p>
          <p className="mt-2 text-base font-bold text-slate-900">{roleName || 'Employee'}</p>
          <p className="mt-1 text-xs text-slate-500">Access profile</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-blue-50 to-white p-4 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Events (7 days)</p>
          <p className="mt-2 text-3xl font-black text-slate-900">{quickStats.attendanceEventsLast7Days}</p>
          <p className="mt-1 text-xs text-slate-500">Timeclock activity</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-emerald-50 to-white p-4 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">My Documents</p>
          <p className="mt-2 text-3xl font-black text-slate-900">{quickStats.myDocumentCount}</p>
          <p className="mt-1 text-xs text-slate-500">Uploaded files</p>
        </div>
        <div className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-white p-4 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Book Leave</p>
          <p className="mt-2 text-sm font-semibold text-amber-800">Planned next milestone</p>
          <p className="mt-1 text-xs text-amber-700">Coming soon</p>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-2 shadow-sm sticky top-3 z-10">
        <div className="flex flex-wrap gap-2">
        {tabItems.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as TabKey)}
            type="button"
            className={`px-4 py-2.5 rounded-xl text-sm font-semibold transition inline-flex items-center gap-2 ${
              activeTab === tab.key
                ? 'bg-slate-900 text-white shadow-sm'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <span className="text-xs opacity-90">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
        </div>
      </div>

      {activeTab === 'overview' && (
        <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-6 shadow-sm space-y-4">
          <div>
            <p className="text-[11px] uppercase tracking-wide font-semibold text-slate-500">Control Center</p>
            <h2 className="text-xl font-black text-slate-900">Employee Record Dashboard</h2>
          </div>
          <p className="text-sm text-slate-600 max-w-3xl">
            Quick actions and snapshots are now active. HR can configure compensation and upload
            contracts/payslips. Staff can review their own documents and payslips.
          </p>
          {isHrView && (
            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                onClick={() => setActiveTab('hr')}
                className="px-3 py-2 rounded-lg bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800"
              >
                Edit HR Setup
              </button>
              <button
                type="button"
                onClick={() => {
                  setDocumentType('contract')
                  setActiveTab('documents')
                }}
                className="px-3 py-2 rounded-lg bg-blue-700 text-white text-sm font-semibold hover:bg-blue-600"
              >
                Upload Contract
              </button>
              <button
                type="button"
                onClick={() => {
                  setDocumentType('payslip')
                  setActiveTab('documents')
                }}
                className="px-3 py-2 rounded-lg bg-emerald-700 text-white text-sm font-semibold hover:bg-emerald-600"
              >
                Upload Payslip
              </button>
            </div>
          )}
          {!documentsSupported && (
            <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
              Employee document table not found. Run migration
              scripts/migrations/20260414_employee_record_foundation.sql.
            </p>
          )}
        </div>
      )}

      {activeTab === 'hr' && isHrView && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
          <div>
            <p className="text-[11px] uppercase tracking-wide font-semibold text-slate-500">Compensation & Compliance</p>
            <h2 className="text-xl font-black text-slate-900">HR Setup</h2>
          </div>

          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 space-y-2">
            <h3 className="text-sm font-bold text-emerald-900">HR setup flow</h3>
            <p className="text-xs text-emerald-800">Use the sections in this order so payroll and policy data stay consistent.</p>
            <ul className="text-xs text-emerald-900 list-disc pl-5 space-y-1">
              <li>A) Select Branch, then select the employee you are updating.</li>
              <li>1) Employee Information and Data: contract basics, dates, and NI number.</li>
              <li>2) Working Days and Hours: normal weekly hours and shift timings.</li>
              <li>3) Pay and Role Model: pay basis, rate/salary, and payroll effective date.</li>
              <li>4) Sick Pay, SSP and Annual Leave: statutory and company leave/sick policy settings.</li>
            </ul>
          </div>

          <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 space-y-2">
            <h3 className="text-sm font-bold text-blue-900">UK minimum checklist (quick guide)</h3>
            <p className="text-xs text-blue-800">
              This setup captures payroll basics and common statutory items for UK employers: base pay,
              SSP handling, pension auto-enrolment tracking, and annual leave baseline.
            </p>
            <ul className="text-xs text-blue-900 list-disc pl-5 space-y-1">
              <li>Set pay basis and base pay amount (annual salary or hourly rate).</li>
              <li>Track SSP decision and weekly SSP rate used for this employee.</li>
              <li>Track pension auto-enrolment status and provider details.</li>
              <li>Set annual leave entitlement with minimum 5.6 weeks (pro-rated for part-time).</li>
            </ul>
            <p className="text-[11px] text-blue-700">
              Verify current statutory rates/thresholds on GOV.UK before each payroll cycle.
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
            <h3 className="text-sm font-bold text-slate-900">A) Select Branch then Employee</h3>
            <p className="text-xs text-slate-500">
              Start here for every update. Pick a branch first to reduce errors, then choose the employee.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="text-sm text-slate-700">
                Branch
                <select
                  value={selectedBranch}
                  onChange={(event) => setSelectedBranch(event.target.value)}
                  className={fieldClass}
                >
                  <option value="all">All branches</option>
                  {branchOptions.map((branch) => (
                    <option key={branch} value={branch}>
                      {branch}
                    </option>
                  ))}
                </select>
                <p className={helpTextClass}>Filter the employee list by branch before editing records.</p>
              </label>

              <label className="text-sm text-slate-700">
                Employee
                <select
                  value={selectedEmployeeId}
                  onChange={(event) => void handleSelectEmployee(event.target.value)}
                  className={fieldClass}
                >
                  {filteredEmployees.map((employee) => (
                    <option key={employee.id} value={employee.id}>
                      {employee.full_name} ({employee.email})
                    </option>
                  ))}
                </select>
                <p className={helpTextClass}>Choose who this payroll setup applies to.</p>
              </label>

              <div className="md:col-span-2 rounded-lg border border-slate-200 bg-white p-3">
                <p className="text-sm font-bold text-slate-900">1) Employee Information and Data</p>
                <p className="mt-1 text-xs text-slate-500">
                  Record core employment details used in compliance checks and employee records.
                </p>
              </div>

              <label className="text-sm text-slate-700">
                Employment Type
                <select
                  value={payrollForm.employmentType}
                  onChange={(event) =>
                    setPayrollForm((current) => ({ ...current, employmentType: event.target.value }))
                  }
                  className={fieldClass}
                >
                  <option value="">Not set</option>
                  <option value="permanent">Permanent</option>
                  <option value="fixed-term">Fixed Term</option>
                  <option value="part-time">Part Time</option>
                  <option value="contractor">Contractor</option>
                </select>
                <p className={helpTextClass}>Contract type influences pension and leave expectations.</p>
              </label>

              <label className="text-sm text-slate-700">
                Pay Basis
                <select
                  value={payrollForm.payBasis}
                  onChange={(event) =>
                    setPayrollForm((current) => ({
                      ...current,
                      payBasis: event.target.value as 'salaried' | 'hourly',
                    }))
                  }
                  className={fieldClass}
                >
                  <option value="salaried">Salaried (Annual)</option>
                  <option value="hourly">Hourly</option>
                </select>
                <p className={helpTextClass}>
                  Required. If salaried, annual salary must be filled. If hourly, hourly rate must be filled.
                </p>
              </label>

              <div className="md:col-span-2 rounded-lg border border-slate-200 bg-white p-3">
                <p className="text-sm font-bold text-slate-900">2) Working Days and Hours</p>
                <p className="mt-1 text-xs text-slate-500">
                  Define standard hours and daily timings so leave, attendance, and payroll calculations align.
                </p>
              </div>

              {payrollForm.payBasis === 'hourly' && (
                <label className="text-sm text-slate-700">
                  Hour Source
                  <select
                    value={payrollForm.hourlySource}
                    onChange={(event) =>
                      setPayrollForm((current) => ({
                        ...current,
                        hourlySource: event.target.value as 'contracted' | 'timeclock',
                      }))
                    }
                    className={fieldClass}
                  >
                    <option value="contracted">Contracted Hours</option>
                    <option value="timeclock">Timeclock Punches</option>
                  </select>
                  <p className={helpTextClass}>Choose where payable hours come from each period.</p>
                </label>
              )}

              <label className="text-sm text-slate-700">
                Annual Salary (GBP)
                <input
                  type="number"
                  step="0.01"
                  value={payrollForm.annualSalary}
                  onChange={(event) =>
                    setPayrollForm((current) => ({ ...current, annualSalary: event.target.value }))
                  }
                  className={fieldClass}
                />
                <p className={helpTextClass}>Required when pay basis is Salaried.</p>
              </label>

              <label className="text-sm text-slate-700">
                Hourly Rate (GBP)
                <input
                  type="number"
                  step="0.01"
                  value={payrollForm.hourlyRate}
                  onChange={(event) =>
                    setPayrollForm((current) => ({ ...current, hourlyRate: event.target.value }))
                  }
                  className={fieldClass}
                />
                <p className={helpTextClass}>Required when pay basis is Hourly.</p>
              </label>

              <label className="text-sm text-slate-700">
                Working Hours / Week
                <input
                  type="number"
                  step="0.5"
                  value={payrollForm.workingHoursPerWeek}
                  onChange={(event) =>
                    setPayrollForm((current) => ({ ...current, workingHoursPerWeek: event.target.value }))
                  }
                  className={fieldClass}
                />
                <p className={helpTextClass}>Used for annualized hourly estimates and leave pro-rating.</p>
              </label>

              <label className="text-sm text-slate-700">
                Salary Currency
                <input
                  type="text"
                  maxLength={3}
                  value={payrollForm.salaryCurrency}
                  onChange={(event) =>
                    setPayrollForm((current) => ({
                      ...current,
                      salaryCurrency: event.target.value.toUpperCase(),
                    }))
                  }
                  className={fieldClass}
                />
                <p className={helpTextClass}>Use ISO code (for UK payroll this is usually GBP).</p>
              </label>

              <label className="text-sm text-slate-700">
                Payroll Effective From
                <input
                  type="date"
                  value={payrollForm.payrollEffectiveFrom}
                  onChange={(event) =>
                    setPayrollForm((current) => ({
                      ...current,
                      payrollEffectiveFrom: event.target.value,
                    }))
                  }
                  className={fieldClass}
                />
                <p className={helpTextClass}>Date this setup starts being used for payroll runs.</p>
              </label>

              <label className="text-sm text-slate-700">
                Employment Start Date
                <input
                  type="date"
                  value={payrollForm.employmentStartDate}
                  onChange={(event) =>
                    setPayrollForm((current) => ({ ...current, employmentStartDate: event.target.value }))
                  }
                  className={fieldClass}
                />
              </label>

              <label className="text-sm text-slate-700">
                Employment End Date
                <input
                  type="date"
                  value={payrollForm.employmentEndDate}
                  onChange={(event) =>
                    setPayrollForm((current) => ({ ...current, employmentEndDate: event.target.value }))
                  }
                  className={fieldClass}
                />
              </label>

              <label className="text-sm text-slate-700">
                Work Start Time
                <input
                  type="time"
                  value={payrollForm.workStartTime}
                  onChange={(event) =>
                    setPayrollForm((current) => ({ ...current, workStartTime: event.target.value }))
                  }
                  className={fieldClass}
                />
                <p className={helpTextClass}>Normal daily shift start used for scheduling and leave context.</p>
              </label>

              <label className="text-sm text-slate-700">
                Work Finish Time
                <input
                  type="time"
                  value={payrollForm.workEndTime}
                  onChange={(event) =>
                    setPayrollForm((current) => ({ ...current, workEndTime: event.target.value }))
                  }
                  className={fieldClass}
                />
                <p className={helpTextClass}>Must be later than start time.</p>
              </label>

              <div className="md:col-span-2 rounded-lg border border-slate-200 bg-white p-3">
                <p className="text-sm font-bold text-slate-900">3) Pay and Role Model</p>
                <p className="mt-1 text-xs text-slate-500">
                  Finalize the employee's pay model and effective payroll settings before saving payroll details.
                </p>
              </div>

              <label className="text-sm text-slate-700 md:col-span-2">
                National Insurance Number
                <input
                  type="text"
                  value={payrollForm.nationalInsuranceNumber}
                  onChange={(event) =>
                    setPayrollForm((current) => ({
                      ...current,
                      nationalInsuranceNumber: event.target.value.toUpperCase(),
                    }))
                  }
                  className={fieldClass}
                />
                <p className={helpTextClass}>Required for payroll reporting. Example format: QQ123456C.</p>
              </label>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-3">
              <p className="text-[11px] uppercase font-semibold text-slate-500">Weekly Estimate</p>
              <p className="mt-1 text-base font-black text-slate-900">
                {formatCurrency(compensationSummary.weeklyFromHourly)}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-3">
              <p className="text-[11px] uppercase font-semibold text-slate-500">Yearly from Hourly</p>
              <p className="mt-1 text-base font-black text-slate-900">
                {formatCurrency(compensationSummary.yearlyFromHourly)}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-3">
              <p className="text-[11px] uppercase font-semibold text-slate-500">Monthly from Salary</p>
              <p className="mt-1 text-base font-black text-slate-900">
                {formatCurrency(compensationSummary.monthlyFromAnnual)}
              </p>
            </div>
          </div>

          {payrollError && (
            <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {payrollError}
            </p>
          )}

          <label className="block text-sm text-slate-700">
            Payroll Notes
            <textarea
              value={payrollForm.payrollNotes}
              onChange={(event) =>
                setPayrollForm((current) => ({ ...current, payrollNotes: event.target.value }))
              }
              rows={3}
              className={fieldClass}
            />
          </label>

          <button
            onClick={() => void handleSavePayroll()}
            disabled={savingPayroll}
            type="button"
            className="px-4 py-2.5 rounded-lg bg-slate-900 text-white font-semibold hover:bg-slate-800 disabled:opacity-60"
          >
            {savingPayroll ? 'Saving...' : 'Save Payroll Details'}
          </button>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
            <h3 className="text-sm font-bold text-slate-900">4) Sick Pay, SSP and Annual Leave</h3>
            <p className="text-xs text-slate-500">
              Use this section to set statutory sick pay, company sick pay, and annual leave entitlement rules.
            </p>

            <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-3 space-y-2">
              <p className="text-xs text-indigo-900 font-semibold">Automation mode</p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={applyRecommendedPolicy}
                  className="px-3 py-1.5 rounded-md bg-indigo-700 text-white text-xs font-semibold hover:bg-indigo-600"
                >
                  Apply UK Defaults
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setPolicyForm((current) => ({
                      ...current,
                      policySource: 'manual',
                    }))
                  }
                  className="px-3 py-1.5 rounded-md border border-indigo-300 text-indigo-800 text-xs font-semibold hover:bg-indigo-100"
                >
                  Mark as Manual Override
                </button>
              </div>
              <p className="text-[11px] text-indigo-800">
                Current mode: {policyForm.policySource === 'uk-default' ? 'UK default template' : 'Manual override'}
                {policyForm.policyContractType ? ` (${policyForm.policyContractType})` : ''}
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <label className="text-sm text-slate-700">
                Contractual Sick Pay (Company Policy)
                <select
                  value={policyForm.sickPayMode}
                  onChange={(event) =>
                    setPolicyForm((current) => ({
                      ...current,
                      sickPayMode: event.target.value as 'none' | 'statutory' | 'full',
                    }))
                  }
                  className={fieldClass}
                >
                  <option value="none">None</option>
                  <option value="statutory">Statutory</option>
                  <option value="full">Full Pay</option>
                </select>
                <p className={helpTextClass}>This is company sick pay policy. SSP settings are captured separately below.</p>
              </label>

              <label className="text-sm text-slate-700">
                SSP Eligibility
                <select
                  value={policyForm.sspEligibility}
                  onChange={(event) =>
                    setPolicyForm((current) => ({
                      ...current,
                      sspEligibility: event.target.value as 'not-assessed' | 'eligible' | 'not-eligible',
                    }))
                  }
                  className={fieldClass}
                >
                  <option value="not-assessed">Not Assessed</option>
                  <option value="eligible">Eligible</option>
                  <option value="not-eligible">Not Eligible</option>
                </select>
                <p className={helpTextClass}>Track your assessment result for statutory sick pay.</p>
              </label>

              <label className="text-sm text-slate-700">
                SSP Weekly Rate (GBP)
                <input
                  type="number"
                  step="0.01"
                  min={0}
                  value={policyForm.sspWeeklyRate}
                  onChange={(event) =>
                    setPolicyForm((current) => ({ ...current, sspWeeklyRate: event.target.value }))
                  }
                  className={fieldClass}
                />
                <p className={helpTextClass}>Enter the SSP weekly rate used for this employee/pay period.</p>
              </label>

              <label className="text-sm text-slate-700">
                SSP Rate Rule
                <select
                  value={policyForm.sspRateMode}
                  onChange={(event) =>
                    setPolicyForm((current) => ({
                      ...current,
                      sspRateMode: event.target.value as 'lower-of-cap-or-80pct' | 'fixed',
                    }))
                  }
                  className={fieldClass}
                >
                  <option value="lower-of-cap-or-80pct">Lower of GBP 123.25 or 80% weekly earnings</option>
                  <option value="fixed">Fixed weekly SSP value</option>
                </select>
                <p className={helpTextClass}>UK statutory default is lower of cap or 80% of normal weekly earnings.</p>
              </label>

              <label className="text-sm text-slate-700">
                SSP Maximum Weeks
                <input
                  type="number"
                  min={1}
                  max={28}
                  step="1"
                  value={policyForm.sspMaxWeeks}
                  onChange={(event) =>
                    setPolicyForm((current) => ({ ...current, sspMaxWeeks: event.target.value }))
                  }
                  className={fieldClass}
                />
                <p className={helpTextClass}>Statutory maximum is 28 weeks.</p>
              </label>

              <label className="text-sm text-slate-700">
                Pension Auto-enrolment Status
                <select
                  value={policyForm.pensionStatus}
                  onChange={(event) =>
                    setPolicyForm((current) => ({
                      ...current,
                      pensionStatus: event.target.value as
                        | 'not-assessed'
                        | 'eligible'
                        | 'enrolled'
                        | 'opted-out'
                        | 'postponed',
                    }))
                  }
                  className={fieldClass}
                >
                  <option value="not-assessed">Not Assessed</option>
                  <option value="eligible">Eligible Jobholder</option>
                  <option value="enrolled">Enrolled</option>
                  <option value="opted-out">Opted Out</option>
                  <option value="postponed">Postponed</option>
                </select>
                <p className={helpTextClass}>Required for pension compliance tracking and re-enrolment cycles.</p>
              </label>

              <label className="text-sm text-slate-700">
                Pension Provider
                <input
                  type="text"
                  value={policyForm.pensionProviderName}
                  onChange={(event) =>
                    setPolicyForm((current) => ({ ...current, pensionProviderName: event.target.value }))
                  }
                  className={fieldClass}
                />
              </label>

              <label className="text-sm text-slate-700">
                Pension Enrolment Date
                <input
                  type="date"
                  value={policyForm.pensionEnrolmentDate}
                  onChange={(event) =>
                    setPolicyForm((current) => ({ ...current, pensionEnrolmentDate: event.target.value }))
                  }
                  className={fieldClass}
                />
              </label>

              <label className="text-sm text-slate-700">
                Paid Break Minutes / Shift
                <input
                  type="number"
                  step="1"
                  min={0}
                  value={policyForm.paidBreakMinutesPerShift}
                  onChange={(event) =>
                    setPolicyForm((current) => ({
                      ...current,
                      paidBreakMinutesPerShift: event.target.value,
                    }))
                  }
                  className={fieldClass}
                />
                <p className={helpTextClass}>Set paid break minutes included per normal shift.</p>
              </label>

              <label className="text-sm text-slate-700">
                Holiday Entitlement (Days)
                <input
                  type="number"
                  step="0.5"
                  min={0}
                  value={policyForm.holidayEntitlementDays}
                  onChange={(event) =>
                    setPolicyForm((current) => ({
                      ...current,
                      holidayEntitlementDays: event.target.value,
                    }))
                  }
                  className={fieldClass}
                />
                <p className={helpTextClass}>
                  Annual entitlement baseline. UK legal minimum is 5.6 weeks (pro-rated for part-time).
                </p>
              </label>

              <label className="text-sm text-slate-700">
                Company Paid Holiday Days
                <input
                  type="number"
                  min={0}
                  step="1"
                  value={policyForm.companyPaidHolidayDays}
                  onChange={(event) =>
                    setPolicyForm((current) => ({
                      ...current,
                      companyPaidHolidayDays: event.target.value,
                    }))
                  }
                  className={fieldClass}
                />
                <p className={helpTextClass}>Default is 4 days (for example: Eid Fitr x2, Eid Adha x1, re-allocation x1).</p>
              </label>

              <label className="text-sm text-slate-700">
                Company Unpaid Holiday Days
                <input
                  type="number"
                  min={0}
                  step="1"
                  value={policyForm.companyUnpaidHolidayDays}
                  onChange={(event) =>
                    setPolicyForm((current) => ({
                      ...current,
                      companyUnpaidHolidayDays: event.target.value,
                    }))
                  }
                  className={fieldClass}
                />
                <p className={helpTextClass}>Ashura can be recorded as unpaid and not deducted from annual paid leave.</p>
              </label>

              <label className="text-sm text-slate-700">
                Leave Accrual Method
                <select
                  value={policyForm.leaveAccrualMode}
                  onChange={(event) =>
                    setPolicyForm((current) => ({
                      ...current,
                      leaveAccrualMode: event.target.value as 'none' | 'monthly' | 'pro-rata-hours',
                    }))
                  }
                  className={fieldClass}
                >
                  <option value="monthly">Monthly Build-up</option>
                  <option value="pro-rata-hours">Pro-rata Build-up</option>
                  <option value="none">No Automatic Build-up</option>
                </select>
                <p className={helpTextClass}>Controls how annual leave accumulates over time.</p>
              </label>

              <label className="text-sm text-slate-700">
                Leave Accrued Days
                <input
                  type="number"
                  step="0.1"
                  min={0}
                  value={policyForm.leaveAccruedDays}
                  onChange={(event) =>
                    setPolicyForm((current) => ({ ...current, leaveAccruedDays: event.target.value }))
                  }
                  className={fieldClass}
                />
                <p className={helpTextClass}>Current earned leave balance used for payroll/leave checks.</p>
              </label>

              <label className="text-sm text-slate-700">
                Leave Accrual As Of
                <input
                  type="date"
                  value={policyForm.leaveAccrualAsOf}
                  onChange={(event) =>
                    setPolicyForm((current) => ({ ...current, leaveAccrualAsOf: event.target.value }))
                  }
                  className={fieldClass}
                />
              </label>

              <label className="text-sm text-slate-700">
                Overtime Mode
                <select
                  value={policyForm.overtimeMode}
                  onChange={(event) =>
                    setPolicyForm((current) => ({
                      ...current,
                      overtimeMode: event.target.value as 'none' | 'flat' | 'tiered',
                    }))
                  }
                  className={fieldClass}
                >
                  <option value="none">None</option>
                  <option value="flat">Flat Rate</option>
                  <option value="tiered">Tiered</option>
                </select>
              </label>

              <label className="text-sm text-slate-700">
                Overtime Threshold Hours
                <input
                  type="number"
                  step="0.5"
                  min={0}
                  value={policyForm.overtimeThresholdHours}
                  onChange={(event) =>
                    setPolicyForm((current) => ({
                      ...current,
                      overtimeThresholdHours: event.target.value,
                    }))
                  }
                  className={fieldClass}
                />
              </label>

              <label className="text-sm text-slate-700">
                Overtime Rate Multiplier
                <input
                  type="number"
                  step="0.1"
                  min={1}
                  value={policyForm.overtimeRateMultiplier}
                  onChange={(event) =>
                    setPolicyForm((current) => ({
                      ...current,
                      overtimeRateMultiplier: event.target.value,
                    }))
                  }
                  className={fieldClass}
                />
              </label>

              <label className="text-sm text-slate-700">
                Effective From
                <input
                  type="date"
                  value={policyForm.effectiveFrom}
                  onChange={(event) =>
                    setPolicyForm((current) => ({
                      ...current,
                      effectiveFrom: event.target.value,
                    }))
                  }
                  className={fieldClass}
                />
              </label>
            </div>

            <label className="inline-flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={policyForm.bankHolidaysIncluded}
                onChange={(event) =>
                  setPolicyForm((current) => ({
                    ...current,
                    bankHolidaysIncluded: event.target.checked,
                  }))
                }
                className="h-4 w-4 rounded border-slate-300"
              />
              Bank holidays included in entitlement
            </label>

            <label className="block text-sm text-slate-700">
              Policy Notes
              <textarea
                value={policyForm.notes}
                onChange={(event) =>
                  setPolicyForm((current) => ({ ...current, notes: event.target.value }))
                }
                rows={2}
                className={fieldClass}
              />
            </label>

            {policyError && (
              <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {policyError}
              </p>
            )}

            <button
              type="button"
              onClick={() => void handleSavePolicy()}
              disabled={savingPolicy}
              className="px-4 py-2 rounded-lg bg-slate-700 text-white font-semibold hover:bg-slate-600 disabled:opacity-60"
            >
              {savingPolicy ? 'Saving Policy...' : 'Save Policy Settings'}
            </button>
          </div>
        </div>
      )}

      {activeTab === 'calendar' && isHrView && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-black text-slate-900">Company Calendar</h2>
              <p className="text-sm text-slate-500">
                Drag ready-made holiday blocks into dates, switch between week and month planning, and view staff who are off.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex rounded-xl border border-slate-200 bg-slate-100 p-1">
                <button
                  type="button"
                  onClick={() => setCalendarView('month')}
                  className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
                    calendarView === 'month'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Month
                </button>
                <button
                  type="button"
                  onClick={() => setCalendarView('week')}
                  className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
                    calendarView === 'week'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Week
                </button>
              </div>
              <button
                type="button"
                onClick={() => handleCalendarPeriodChange(-1)}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Previous
              </button>
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700">
                {calendarPeriodLabel}
              </div>
              <button
                type="button"
                onClick={() => handleCalendarPeriodChange(1)}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Next
              </button>
              <input
                type="month"
                value={calendarMonth}
                onChange={(event) => {
                  setCalendarMonth(event.target.value)
                  setCalendarViewDate(`${event.target.value}-01`)
                }}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
              />
              <button
                type="button"
                onClick={() => setCalendarSettingsOpen(true)}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
              >
                Settings
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 p-3 space-y-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Holiday blocks</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {activeCalendarTemplates.map((template) => {
                  const theme = getHolidayTheme(
                    template.holidayKey,
                    template.isPaid,
                    template.countsTowardAnnualLeave,
                  )

                  return (
                    <button
                      key={template.id}
                      type="button"
                      draggable
                      onDragStart={(event) => {
                        event.dataTransfer.setData(
                          'text/plain',
                          JSON.stringify({ type: 'template', templateId: template.id }),
                        )
                      }}
                      className={`inline-flex items-center gap-2 rounded-md border px-2 py-1 text-xs font-semibold shadow-sm transition hover:-translate-y-0.5 hover:shadow ${theme.blockClass}`}
                    >
                      <span>{normalizeHolidayName(template.holidayName)}</span>
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${theme.chipClass}`}>
                        Drag
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>

            {calendarView === 'month' ? (
              <>
                <div className="grid grid-cols-7 gap-2 text-xs font-semibold text-slate-500 px-1 pb-2">
                  <span>Mon</span>
                  <span>Tue</span>
                  <span>Wed</span>
                  <span>Thu</span>
                  <span>Fri</span>
                  <span>Sat</span>
                  <span>Sun</span>
                </div>

                <div className="overflow-x-auto">
                  <div className="grid min-w-[940px] grid-cols-7 gap-2">
                    {monthGridDays.map((day, index) => {
                      if (!day) {
                        return (
                          <div
                            key={`empty-${index}`}
                            className="min-h-[152px] rounded-lg border border-dashed border-slate-200 bg-slate-50/60"
                          />
                        )
                      }

                      const dayEvents = calendarEventsByDate[day] || []
                      const dayOff = staffOffByDate[day] || []
                      const isToday = day === todayIso
                      return (
                        <button
                          key={day}
                          type="button"
                          onClick={() => {
                            setSelectedCalendarDate(day)
                            setCalendarViewDate(day)
                          }}
                          onDragOver={(event) => event.preventDefault()}
                          onDrop={(event) => handleCalendarDrop(event, day)}
                          className={`min-h-[152px] rounded-lg border p-2 text-left transition ${
                            selectedCalendarDate === day
                              ? 'border-slate-700 bg-slate-50'
                              : isToday
                                ? 'border-blue-300 bg-blue-50/40'
                                : 'border-slate-200 bg-white hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                                {new Date(`${day}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short' })}
                              </p>
                              <p className="text-xs font-semibold text-slate-700">{formatReadableDate(day)}</p>
                            </div>
                            {isToday ? (
                              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
                                Today
                              </span>
                            ) : visibleCalendarMonths.length > 1 ? (
                              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                                {day.slice(5, 7)}
                              </span>
                            ) : null}
                          </div>
                          <div className="mt-2 space-y-1">
                            {dayEvents.map((event) => {
                              const theme = getHolidayTheme(
                                event.holidayKey,
                                event.isPaid,
                                event.countsTowardAnnualLeave,
                              )

                              return (
                                <div
                                  key={event.id}
                                  draggable
                                  onDragStart={(dragEvent) => {
                                    dragEvent.dataTransfer.setData(
                                      'text/plain',
                                      JSON.stringify({ type: 'event', eventId: event.id }),
                                    )
                                  }}
                                  className={`rounded-md border px-2 py-1 text-[11px] font-semibold ${theme.blockClass}`}
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <span>{normalizeHolidayName(event.holidayName)}</span>
                                    <span
                                      role="button"
                                      onClick={(clickEvent) => {
                                        clickEvent.stopPropagation()
                                        void deleteCalendarEvent(event.id).catch((error) => {
                                          toast.error(
                                            error instanceof Error
                                              ? error.message
                                              : 'Failed to delete calendar event',
                                          )
                                        })
                                      }}
                                      className="text-[10px] text-slate-700 hover:text-rose-700"
                                    >
                                      x
                                    </span>
                                  </div>
                                  <p className="text-[10px] font-normal text-slate-600">
                                    {event.countsTowardAnnualLeave ? 'Deducted from annual leave' : 'Not deducted'}
                                  </p>
                                </div>
                              )
                            })}
                          </div>
                          {dayOff.length > 0 ? (
                            <p className="mt-2 text-[10px] text-slate-500">Off: {dayOff.length} staff</p>
                          ) : null}
                        </button>
                      )
                    })}
                  </div>
                </div>
              </>
            ) : (
              <div className="overflow-x-auto">
                <div className="min-w-[1100px] rounded-lg border border-slate-200">
                  <div
                    className="grid"
                    style={{ gridTemplateColumns: '72px repeat(7, minmax(0, 1fr))' }}
                  >
                    <div className="border-b border-r border-slate-200 bg-slate-50 px-2 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      Time
                    </div>
                    {weekDays.map((day) => {
                      const isToday = day === todayIso
                      return (
                        <button
                          key={`week-head-${day}`}
                          type="button"
                          onClick={() => {
                            setSelectedCalendarDate(day)
                            setCalendarViewDate(day)
                          }}
                          className={`border-b border-slate-200 px-2 py-2 text-left ${
                            isToday ? 'bg-blue-50' : 'bg-slate-50'
                          }`}
                        >
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                            {new Date(`${day}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short' })}
                          </p>
                          <div className="mt-1 flex items-center justify-between gap-2">
                            <p className="text-xs font-semibold text-slate-800">{formatReadableDate(day)}</p>
                            {isToday ? (
                              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
                                Today
                              </span>
                            ) : null}
                          </div>
                        </button>
                      )
                    })}

                    <div className="border-b border-r border-slate-200 bg-slate-50 px-2 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      All day
                    </div>
                    {weekDays.map((day) => {
                      const dayEvents = calendarEventsByDate[day] || []
                      const dayOff = staffOffByDate[day] || []
                      const isToday = day === todayIso
                      return (
                        <button
                          key={`week-allday-${day}`}
                          type="button"
                          onClick={() => {
                            setSelectedCalendarDate(day)
                            setCalendarViewDate(day)
                          }}
                          onDragOver={(event) => event.preventDefault()}
                          onDrop={(event) => handleCalendarDrop(event, day)}
                          className={`min-h-[74px] border-b px-2 py-2 text-left ${
                            isToday ? 'bg-blue-50/40' : 'bg-white'
                          } ${selectedCalendarDate === day ? 'ring-1 ring-inset ring-slate-400' : ''}`}
                        >
                          <div className="space-y-1">
                            {dayEvents.map((event) => {
                              const theme = getHolidayTheme(
                                event.holidayKey,
                                event.isPaid,
                                event.countsTowardAnnualLeave,
                              )

                              return (
                                <div
                                  key={event.id}
                                  draggable
                                  onDragStart={(dragEvent) => {
                                    dragEvent.dataTransfer.setData(
                                      'text/plain',
                                      JSON.stringify({ type: 'event', eventId: event.id }),
                                    )
                                  }}
                                  className={`rounded border px-2 py-1 text-[11px] font-semibold ${theme.blockClass}`}
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <span>{normalizeHolidayName(event.holidayName)}</span>
                                    <span
                                      role="button"
                                      onClick={(clickEvent) => {
                                        clickEvent.stopPropagation()
                                        void deleteCalendarEvent(event.id).catch((error) => {
                                          toast.error(
                                            error instanceof Error
                                              ? error.message
                                              : 'Failed to delete calendar event',
                                          )
                                        })
                                      }}
                                      className="text-[10px] text-slate-700 hover:text-rose-700"
                                    >
                                      x
                                    </span>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                          {dayOff.length > 0 ? (
                            <p className="mt-1 text-[10px] text-slate-500">Off: {dayOff.length}</p>
                          ) : null}
                        </button>
                      )
                    })}

                    {weekHourSlots.map((hour) => {
                      const hourDate = new Date()
                      hourDate.setHours(hour, 0, 0, 0)
                      const hourLabel = hourDate.toLocaleTimeString('en-GB', {
                        hour: 'numeric',
                        hour12: true,
                      })

                      return (
                        <Fragment key={`hour-row-${hour}`}>
                          <div
                            className="border-r border-slate-200 bg-slate-50 px-2 py-3 text-[11px] font-semibold text-slate-500"
                          >
                            {hourLabel}
                          </div>
                          {weekDays.map((day) => {
                            const isToday = day === todayIso
                            return (
                              <button
                                key={`hour-${hour}-${day}`}
                                type="button"
                                onClick={() => {
                                  setSelectedCalendarDate(day)
                                  setCalendarViewDate(day)
                                }}
                                onDragOver={(event) => event.preventDefault()}
                                onDrop={(event) => handleCalendarDrop(event, day)}
                                className={`min-h-[44px] border-b border-slate-100 text-left transition ${
                                  isToday ? 'bg-blue-50/30' : 'bg-white hover:bg-slate-50'
                                }`}
                              >
                                <span className="sr-only">{hourLabel} {formatReadableDate(day)}</span>
                              </button>
                            )
                          })}
                        </Fragment>
                      )
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-semibold text-slate-700">Who is off</p>
              {selectedCalendarDate ? (
                <div className="mt-2 space-y-1">
                  <p className="text-xs text-slate-500">{formatReadableDate(selectedCalendarDate)}</p>
                  {(staffOffByDate[selectedCalendarDate] || []).length === 0 ? (
                    <p className="text-xs text-slate-500">No staff off for this date.</p>
                  ) : (
                    (staffOffByDate[selectedCalendarDate] || []).map((staff) => (
                      <p key={staff.id} className="text-xs text-slate-700">
                        {staff.fullName}
                      </p>
                    ))
                  )}
                </div>
              ) : (
                <p className="mt-2 text-xs text-slate-500">Select a date to view staff off.</p>
              )}
            </div>

            <div className="rounded-md border border-slate-200 bg-white p-3">
              <p className="text-xs font-semibold text-slate-700">Visible days</p>
              <p className="mt-1 text-xs text-slate-500">
                {visibleCalendarDays.length} day{visibleCalendarDays.length === 1 ? '' : 's'} loaded across{' '}
                {visibleCalendarMonths.length} month{visibleCalendarMonths.length === 1 ? '' : 's'}.
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Planning notes</p>
            <ul className="mt-2 space-y-1 text-xs text-slate-600">
              <li>Use the small colored holiday blocks to place recurring company holidays.</li>
              <li>Ashura stays unpaid by default.</li>
              <li>Eid holidays stay paid and deducted from annual leave unless settings change.</li>
            </ul>
          </div>

          <ModalBase
            isOpen={calendarSettingsOpen}
            onClose={() => setCalendarSettingsOpen(false)}
            title="Company Calendar Settings"
            description="Manage the holiday templates behind the ready-made blocks."
            size="lg"
            isLoading={savingCalendar}
          >
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-slate-700">Holiday templates</p>
                <button
                  type="button"
                  onClick={addCalendarTemplateDraft}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  + Add Holiday
                </button>
              </div>

              <div className="space-y-2">
                {calendarTemplates.map((template) => {
                  const theme = getHolidayTheme(
                    template.holidayKey,
                    template.isPaid,
                    template.countsTowardAnnualLeave,
                  )

                  return (
                    <div
                      key={template.id}
                      className={`rounded-xl border p-3 ${theme.blockClass}`}
                    >
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <p className="text-xs font-semibold uppercase tracking-wide opacity-75">Holiday</p>
                        <button
                          type="button"
                          onClick={() => removeCalendarTemplate(template.id)}
                          className="rounded border border-rose-200 bg-white px-2 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-50"
                        >
                          Remove
                        </button>
                      </div>
                      <label className="block text-sm font-semibold text-slate-800">
                        Holiday Name
                        <input
                          type="text"
                          value={normalizeHolidayName(template.holidayName)}
                          onChange={(event) =>
                            setCalendarTemplates((current) =>
                              current.map((row) =>
                                row.id === template.id
                                  ? { ...row, holidayName: normalizeHolidayName(event.target.value) }
                                  : row,
                              ),
                            )
                          }
                          className={fieldClass}
                        />
                      </label>
                      <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-700">
                        <label className="inline-flex items-center gap-1">
                          <input
                            type="checkbox"
                            checked={template.isPaid}
                            onChange={(event) =>
                              setCalendarTemplates((current) =>
                                current.map((row) =>
                                  row.id === template.id ? { ...row, isPaid: event.target.checked } : row,
                                ),
                              )
                            }
                            className="h-4 w-4 rounded border-slate-300"
                          />
                          Paid
                        </label>
                        <label className="inline-flex items-center gap-1">
                          <input
                            type="checkbox"
                            checked={template.countsTowardAnnualLeave}
                            onChange={(event) =>
                              setCalendarTemplates((current) =>
                                current.map((row) =>
                                  row.id === template.id
                                    ? { ...row, countsTowardAnnualLeave: event.target.checked }
                                    : row,
                                ),
                              )
                            }
                            className="h-4 w-4 rounded border-slate-300"
                          />
                          Deduct annual leave
                        </label>
                        <label className="inline-flex items-center gap-1">
                          <input
                            type="checkbox"
                            checked={template.active}
                            onChange={(event) =>
                              setCalendarTemplates((current) =>
                                current.map((row) =>
                                  row.id === template.id ? { ...row, active: event.target.checked } : row,
                                ),
                              )
                            }
                            className="h-4 w-4 rounded border-slate-300"
                          />
                          Active
                        </label>
                      </div>
                    </div>
                  )
                })}
              </div>

              {deletedCalendarTemplateIds.length > 0 ? (
                <p className="text-xs text-rose-700">
                  {deletedCalendarTemplateIds.length} template{deletedCalendarTemplateIds.length === 1 ? '' : 's'} scheduled for removal.
                </p>
              ) : null}

              <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
                <button
                  type="button"
                  onClick={() => setCalendarSettingsOpen(false)}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void (async () => {
                      const didSave = await saveCalendarTemplateSettings()
                      if (didSave) setCalendarSettingsOpen(false)
                    })()
                  }}
                  disabled={savingCalendar}
                  className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
                >
                  {savingCalendar ? 'Saving...' : 'Save Calendar Settings'}
                </button>
              </div>
            </div>
          </ModalBase>
        </div>
      )}

      {activeTab === 'documents' && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
          <h2 className="text-lg font-bold text-slate-900">
            {isHrView ? 'Employee Documents (HR)' : 'My Documents'}
          </h2>

          {isHrView && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
              <label className="text-sm text-slate-700">
                Employee
                <select
                  value={selectedEmployeeId}
                  onChange={(event) => void handleSelectEmployee(event.target.value)}
                  className={fieldClass}
                >
                  {employees.map((employee) => (
                    <option key={employee.id} value={employee.id}>
                      {employee.full_name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-sm text-slate-700">
                Document Type
                <select
                  value={documentType}
                  onChange={(event) =>
                    setDocumentType(event.target.value as 'contract' | 'payslip' | 'other')
                  }
                  className={fieldClass}
                >
                  <option value="contract">Contract</option>
                  <option value="payslip">Payslip</option>
                  <option value="other">Other</option>
                </select>
              </label>

              <label className="text-sm text-slate-700">
                Upload file
                <input
                  type="file"
                  onChange={(event) => void handleUploadDocument(event)}
                  disabled={uploading || !documentsSupported}
                  className={fieldClass}
                />
              </label>
            </div>
          )}

          {!documentsSupported ? (
            <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
              Employee documents are not available yet. Run migration
              scripts/migrations/20260414_employee_record_foundation.sql.
            </p>
          ) : documents.length === 0 ? (
            <p className="text-sm text-slate-500">No documents uploaded yet.</p>
          ) : (
            <div className="overflow-auto">
              <table className="w-full text-sm rounded-xl overflow-hidden">
                <thead className="text-left text-slate-500 border-b border-slate-200 bg-slate-50">
                  <tr>
                    <th className="py-3 px-2">Type</th>
                    <th className="py-3 px-2">File</th>
                    <th className="py-3 px-2">Uploaded</th>
                    <th className="py-3 px-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {documents.map((doc) => (
                    <tr key={doc.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-2 uppercase text-xs font-semibold text-slate-600">
                        {doc.documentType}
                      </td>
                      <td className="py-3 px-2 text-slate-800 font-medium">{doc.fileName}</td>
                      <td className="py-3 px-2 text-slate-500">
                        {new Date(doc.uploadedAt).toLocaleString('en-GB')}
                      </td>
                      <td className="py-3 px-2 text-right">
                        <div className="inline-flex gap-2">
                          <button
                            type="button"
                            onClick={() => openPreview(doc)}
                            className="px-2.5 py-1.5 text-xs rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50"
                          >
                            Preview
                          </button>
                          <button
                            type="button"
                            onClick={() => openDownload(doc)}
                            className="px-2.5 py-1.5 text-xs rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50"
                          >
                            Download
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'payslips' && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
          <h2 className="text-lg font-bold text-slate-900">Payslips</h2>
          {payslips.length === 0 ? (
            <p className="text-sm text-slate-500">No payslips available yet.</p>
          ) : (
            <ul className="space-y-3">
              {payslips.map((payslip) => (
                <li
                  key={payslip.id}
                  className="rounded-xl border border-slate-200 bg-gradient-to-r from-white to-slate-50 px-4 py-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{payslip.fileName}</p>
                      <p className="text-xs text-slate-500">
                        {new Date(payslip.uploadedAt).toLocaleDateString('en-GB')}
                      </p>
                    </div>
                    <div className="inline-flex gap-2">
                      <button
                        type="button"
                        onClick={() => openPreview(payslip)}
                        className="px-2.5 py-1.5 text-xs rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50"
                      >
                        Preview
                      </button>
                      <button
                        type="button"
                        onClick={() => openDownload(payslip)}
                        className="px-2.5 py-1.5 text-xs rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50"
                      >
                        Download
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {activeTab === 'leave' && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-2">
          <h2 className="text-lg font-bold text-slate-900">Book Leave</h2>
          <p className="text-sm text-slate-600">
            Leave request workflow is planned for the next milestone. This phase delivers Employee
            Record dashboard, HR setup, and document/payslip access.
          </p>
        </div>
      )}

      {isHrView && selectedEmployee && activeTab === 'overview' && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-md font-black text-slate-900">Selected Employee Snapshot</h3>
          <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3 text-sm text-slate-700">
            <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">Hourly Rate: {formatCurrency(selectedEmployee.hourly_rate)}</p>
            <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">Annual Salary: {formatCurrency(selectedEmployee.annual_salary)}</p>
            <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">Pay Basis: {selectedEmployee.pay_basis || 'salaried'}</p>
            <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">Working Hours/Week: {selectedEmployee.working_hours_per_week ?? 'Not set'}</p>
            <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">Hourly Source: {selectedEmployee.hourly_source || 'N/A'}</p>
            <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">Employment Type: {selectedEmployee.employment_type || 'Not set'}</p>
            <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">Start Date: {formatDate(selectedEmployee.employment_start_date)}</p>
            <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">End Date: {formatDate(selectedEmployee.employment_end_date)}</p>
          </div>
        </div>
      )}
    </div>
  )
}
