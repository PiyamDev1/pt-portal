'use client'

import { useMemo, useState } from 'react'
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
  hourly_rate?: number | null
  annual_salary?: number | null
  working_hours_per_week?: number | null
  employment_type?: string | null
  employment_start_date?: string | null
  employment_end_date?: string | null
  payroll_notes?: string | null
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

  const selectedEmployee = useMemo(
    () => employees.find((employee) => employee.id === selectedEmployeeId) || null,
    [employees, selectedEmployeeId],
  )

  const [payrollForm, setPayrollForm] = useState({
    hourlyRate: selectedEmployee?.hourly_rate?.toString() || '',
    annualSalary: selectedEmployee?.annual_salary?.toString() || '',
    workingHoursPerWeek: selectedEmployee?.working_hours_per_week?.toString() || '',
    employmentType: selectedEmployee?.employment_type || '',
    employmentStartDate: selectedEmployee?.employment_start_date || '',
    employmentEndDate: selectedEmployee?.employment_end_date || '',
    payrollNotes: selectedEmployee?.payroll_notes || '',
  })

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
      hourlyRate: nextEmployee?.hourly_rate?.toString() || '',
      annualSalary: nextEmployee?.annual_salary?.toString() || '',
      workingHoursPerWeek: nextEmployee?.working_hours_per_week?.toString() || '',
      employmentType: nextEmployee?.employment_type || '',
      employmentStartDate: nextEmployee?.employment_start_date || '',
      employmentEndDate: nextEmployee?.employment_end_date || '',
      payrollNotes: nextEmployee?.payroll_notes || '',
    })

    try {
      await refreshDocuments(employeeId)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load employee documents')
    }
  }

  const handleSavePayroll = async () => {
    if (!selectedEmployeeId) {
      toast.error('Select an employee first')
      return
    }

    setSavingPayroll(true)
    try {
      const response = await fetch(`/api/employee-record/payroll/${selectedEmployeeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hourlyRate: payrollForm.hourlyRate,
          annualSalary: payrollForm.annualSalary,
          workingHoursPerWeek: payrollForm.workingHoursPerWeek,
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
                hourly_rate: updated.hourlyRate ?? null,
                annual_salary: updated.annualSalary ?? null,
                working_hours_per_week: updated.workingHoursPerWeek ?? null,
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
    } finally {
      setSavingPayroll(false)
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

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase text-slate-500">My Role</p>
          <p className="mt-2 text-sm font-semibold text-slate-800">{roleName || 'Employee'}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase text-slate-500">Events (7 days)</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{quickStats.attendanceEventsLast7Days}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase text-slate-500">My Documents</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{quickStats.myDocumentCount}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase text-slate-500">Book Leave</p>
          <p className="mt-2 text-sm font-semibold text-amber-700">Planned next milestone</p>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-2 shadow-sm flex flex-wrap gap-2">
        {[
          { key: 'overview', label: 'Overview' },
          ...(isHrView ? [{ key: 'hr', label: 'HR Setup' }] : []),
          { key: 'documents', label: 'Documents' },
          { key: 'payslips', label: 'Payslips' },
          { key: 'leave', label: 'Book Leave' },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as TabKey)}
            type="button"
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${
              activeTab === tab.key
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-3">
          <h2 className="text-lg font-bold text-slate-900">Employee Record Dashboard</h2>
          <p className="text-sm text-slate-600">
            Quick actions and snapshots are now active. HR can configure compensation and upload
            contracts/payslips. Staff can review their own documents and payslips.
          </p>
          {isHrView && (
            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                onClick={() => setActiveTab('hr')}
                className="px-3 py-1.5 rounded-md bg-slate-900 text-white text-sm hover:bg-slate-800"
              >
                Edit HR Setup
              </button>
              <button
                type="button"
                onClick={() => {
                  setDocumentType('contract')
                  setActiveTab('documents')
                }}
                className="px-3 py-1.5 rounded-md bg-blue-700 text-white text-sm hover:bg-blue-600"
              >
                Upload Contract
              </button>
              <button
                type="button"
                onClick={() => {
                  setDocumentType('payslip')
                  setActiveTab('documents')
                }}
                className="px-3 py-1.5 rounded-md bg-emerald-700 text-white text-sm hover:bg-emerald-600"
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
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
          <h2 className="text-lg font-bold text-slate-900">HR Setup</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="text-sm text-slate-700">
              Employee
              <select
                value={selectedEmployeeId}
                onChange={(event) => void handleSelectEmployee(event.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              >
                {employees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.full_name} ({employee.email})
                  </option>
                ))}
              </select>
            </label>

            <label className="text-sm text-slate-700">
              Employment Type
              <select
                value={payrollForm.employmentType}
                onChange={(event) =>
                  setPayrollForm((current) => ({ ...current, employmentType: event.target.value }))
                }
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              >
                <option value="">Not set</option>
                <option value="permanent">Permanent</option>
                <option value="fixed-term">Fixed Term</option>
                <option value="part-time">Part Time</option>
                <option value="contractor">Contractor</option>
              </select>
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
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              />
            </label>

            <label className="text-sm text-slate-700">
              Annual Salary (GBP)
              <input
                type="number"
                step="0.01"
                value={payrollForm.annualSalary}
                onChange={(event) =>
                  setPayrollForm((current) => ({ ...current, annualSalary: event.target.value }))
                }
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              />
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
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              />
            </label>

            <label className="text-sm text-slate-700">
              Employment Start Date
              <input
                type="date"
                value={payrollForm.employmentStartDate}
                onChange={(event) =>
                  setPayrollForm((current) => ({ ...current, employmentStartDate: event.target.value }))
                }
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
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
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              />
            </label>
          </div>

          <label className="block text-sm text-slate-700">
            Payroll Notes
            <textarea
              value={payrollForm.payrollNotes}
              onChange={(event) =>
                setPayrollForm((current) => ({ ...current, payrollNotes: event.target.value }))
              }
              rows={3}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
            />
          </label>

          <button
            onClick={() => void handleSavePayroll()}
            disabled={savingPayroll}
            type="button"
            className="px-4 py-2 rounded-md bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-60"
          >
            {savingPayroll ? 'Saving...' : 'Save Payroll Details'}
          </button>
        </div>
      )}

      {activeTab === 'documents' && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
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
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
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
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
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
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
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
              <table className="w-full text-sm">
                <thead className="text-left text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="py-2">Type</th>
                    <th className="py-2">File</th>
                    <th className="py-2">Uploaded</th>
                    <th className="py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {documents.map((doc) => (
                    <tr key={doc.id}>
                      <td className="py-2 pr-2 uppercase text-xs font-semibold text-slate-600">
                        {doc.documentType}
                      </td>
                      <td className="py-2 pr-2 text-slate-800">{doc.fileName}</td>
                      <td className="py-2 text-slate-500">
                        {new Date(doc.uploadedAt).toLocaleString('en-GB')}
                      </td>
                      <td className="py-2 text-right">
                        <div className="inline-flex gap-2">
                          <button
                            type="button"
                            onClick={() => openPreview(doc)}
                            className="px-2 py-1 text-xs rounded border border-slate-300 text-slate-700 hover:bg-slate-50"
                          >
                            Preview
                          </button>
                          <button
                            type="button"
                            onClick={() => openDownload(doc)}
                            className="px-2 py-1 text-xs rounded border border-slate-300 text-slate-700 hover:bg-slate-50"
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
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
          <h2 className="text-lg font-bold text-slate-900">Payslips</h2>
          {payslips.length === 0 ? (
            <p className="text-sm text-slate-500">No payslips available yet.</p>
          ) : (
            <ul className="space-y-2">
              {payslips.map((payslip) => (
                <li key={payslip.id} className="rounded-md border border-slate-200 px-3 py-2">
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
                        className="px-2 py-1 text-xs rounded border border-slate-300 text-slate-700 hover:bg-slate-50"
                      >
                        Preview
                      </button>
                      <button
                        type="button"
                        onClick={() => openDownload(payslip)}
                        className="px-2 py-1 text-xs rounded border border-slate-300 text-slate-700 hover:bg-slate-50"
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
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-2">
          <h2 className="text-lg font-bold text-slate-900">Book Leave</h2>
          <p className="text-sm text-slate-600">
            Leave request workflow is planned for the next milestone. This phase delivers Employee
            Record dashboard, HR setup, and document/payslip access.
          </p>
        </div>
      )}

      {isHrView && selectedEmployee && activeTab === 'overview' && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-md font-bold text-slate-900">Selected Employee Snapshot</h3>
          <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3 text-sm text-slate-700">
            <p>Hourly Rate: {formatCurrency(selectedEmployee.hourly_rate)}</p>
            <p>Annual Salary: {formatCurrency(selectedEmployee.annual_salary)}</p>
            <p>Working Hours/Week: {selectedEmployee.working_hours_per_week ?? 'Not set'}</p>
            <p>Employment Type: {selectedEmployee.employment_type || 'Not set'}</p>
            <p>Start Date: {formatDate(selectedEmployee.employment_start_date)}</p>
            <p>End Date: {formatDate(selectedEmployee.employment_end_date)}</p>
          </div>
        </div>
      )}
    </div>
  )
}
