'use client'

import { useEffect, useMemo, useState } from 'react'
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
  payroll_notes?: string | null
}

type EmployeePolicy = {
  sickPayMode: 'none' | 'statutory' | 'full'
  sspEligibility: 'not-assessed' | 'eligible' | 'not-eligible'
  sspWeeklyRate: string
  paidBreakMinutesPerShift: string
  holidayEntitlementDays: string
  bankHolidaysIncluded: boolean
  pensionStatus: 'not-assessed' | 'eligible' | 'enrolled' | 'opted-out' | 'postponed'
  pensionProviderName: string
  pensionEnrolmentDate: string
  overtimeMode: 'none' | 'flat' | 'tiered'
  overtimeThresholdHours: string
  overtimeRateMultiplier: string
  effectiveFrom: string
  notes: string
  policySource: 'manual' | 'uk-default'
  policyContractType: string
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

type TabKey = 'overview' | 'hr' | 'documents' | 'payslips' | 'leave'

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

  const selectedEmployee = useMemo(
    () => employees.find((employee) => employee.id === selectedEmployeeId) || null,
    [employees, selectedEmployeeId],
  )

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
    payrollNotes: selectedEmployee?.payroll_notes || '',
  })

  const [policyForm, setPolicyForm] = useState<EmployeePolicy>({
    sickPayMode: 'statutory',
    sspEligibility: 'not-assessed',
    sspWeeklyRate: '',
    paidBreakMinutesPerShift: '',
    holidayEntitlementDays: '28',
    bankHolidaysIncluded: true,
    pensionStatus: 'not-assessed',
    pensionProviderName: '',
    pensionEnrolmentDate: '',
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
          paidBreakMinutesPerShift:
            typeof payload.recommendedPolicy.paidBreakMinutesPerShift === 'number'
              ? String(payload.recommendedPolicy.paidBreakMinutesPerShift)
              : '',
          holidayEntitlementDays:
            typeof payload.recommendedPolicy.holidayEntitlementDays === 'number'
              ? String(payload.recommendedPolicy.holidayEntitlementDays)
              : '28',
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
          paidBreakMinutesPerShift: '',
          holidayEntitlementDays: '28',
          bankHolidaysIncluded: true,
          pensionStatus: 'not-assessed',
          pensionProviderName: '',
          pensionEnrolmentDate: '',
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
      paidBreakMinutesPerShift:
        typeof policy.paidBreakMinutesPerShift === 'number'
          ? String(policy.paidBreakMinutesPerShift)
          : '',
      holidayEntitlementDays:
        typeof policy.holidayEntitlementDays === 'number'
          ? String(policy.holidayEntitlementDays)
          : '28',
      bankHolidaysIncluded: Boolean(policy.bankHolidaysIncluded ?? true),
      pensionStatus: policy.pensionStatus || 'not-assessed',
      pensionProviderName: policy.pensionProviderName || '',
      pensionEnrolmentDate: policy.pensionEnrolmentDate || '',
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
    const paidBreakMinutes = toNumberOrNull(policyForm.paidBreakMinutesPerShift)
    const holidayEntitlement = toNumberOrNull(policyForm.holidayEntitlementDays)
    const overtimeThreshold = toNumberOrNull(policyForm.overtimeThresholdHours)
    const overtimeMultiplier = toNumberOrNull(policyForm.overtimeRateMultiplier)

    if (sspWeeklyRate !== null && sspWeeklyRate < 0) {
      setPolicyError('SSP weekly rate cannot be negative')
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

    if (holidayEntitlement !== null && holidayEntitlement < 5.6) {
      setPolicyError('Holiday entitlement is too low. Enter annual days equivalent to at least 5.6 weeks (pro-rated if part-time).')
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
          paidBreakMinutesPerShift: policyForm.paidBreakMinutesPerShift || null,
          holidayEntitlementDays: policyForm.holidayEntitlementDays || null,
          bankHolidaysIncluded: policyForm.bankHolidaysIncluded,
          pensionStatus: policyForm.pensionStatus,
          pensionProviderName: policyForm.pensionProviderName || null,
          pensionEnrolmentDate: policyForm.pensionEnrolmentDate || null,
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
            <h3 className="text-sm font-bold text-slate-900">1) Employee and Pay Model</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="text-sm text-slate-700">
                Employee
                <select
                  value={selectedEmployeeId}
                  onChange={(event) => void handleSelectEmployee(event.target.value)}
                  className={fieldClass}
                >
                  {employees.map((employee) => (
                    <option key={employee.id} value={employee.id}>
                      {employee.full_name} ({employee.email})
                    </option>
                  ))}
                </select>
                <p className={helpTextClass}>Choose who this payroll setup applies to.</p>
              </label>

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
            <h3 className="text-sm font-bold text-slate-900">2) UK Statutory and Contract Policy</h3>
            <p className="text-xs text-slate-500">
              Use these fields to record SSP, pension auto-enrolment and leave terms used in payroll checks.
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
                Sick Pay Mode
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
                <p className={helpTextClass}>Statutory means SSP rules apply; Full means contractual sick pay.</p>
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
                <p className={helpTextClass}>
                  UK legal minimum is 5.6 weeks per leave year (28 days for a 5-day worker, pro-rated for part-time).
                </p>
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
