'use client'

import type React from 'react'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Ban, CheckCircle2, ClipboardList, FileText, Pencil, Plus, Save, X } from 'lucide-react'
import type {
  EmployeeOption,
  Metadata,
  PakPassportDraft,
  PakPassportDraftFormData,
  PakPassportDraftPaymentStatus,
  PakPassportDraftStatus,
} from './types'
import { formatCNIC } from './utils'
import { pakPassportApi } from './api'

type DraftModePanelProps = {
  drafts: PakPassportDraft[]
  documentCounts: Record<string, number>
  employeeOptions: EmployeeOption[]
  metadata: Metadata
  currentUserId: string
  onManageDocuments?: (draftId: string) => void
}

const DRAFT_STATUSES: PakPassportDraftStatus[] = [
  'Draft',
  'Documents Pending',
  'Ready to Process',
  'With External Staff',
  'Tracking Received',
  'Converted',
  'Cancelled',
]

const ACTIVE_DRAFT_STATUSES = DRAFT_STATUSES.filter(
  (status) => status !== 'Converted' && status !== 'Cancelled',
)

const PAYMENT_STATUSES: Array<{ value: PakPassportDraftPaymentStatus; label: string }> = [
  { value: 'unknown', label: 'Unknown' },
  { value: 'not_taken', label: 'Not taken' },
  { value: 'taken', label: 'Taken' },
  { value: 'refunded', label: 'Refunded' },
]

function pickOne<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] || null
  return value || null
}

function formatDate(value?: string | null) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleDateString('en-GB')
}

function createEmptyDraftForm(metadata: Metadata): PakPassportDraftFormData {
  const applicationTypes = metadata.applicationTypes.includes('Lost')
    ? metadata.applicationTypes
    : [...metadata.applicationTypes, 'Lost']

  return {
    applicantName: '',
    applicantCnic: '',
    applicantEmail: '',
    applicantPhone: '',
    familyHeadEmail: '',
    applicationType: applicationTypes[0] || 'Renewal',
    category: metadata.categories[0] || 'Adult 10 Year',
    pageCount: metadata.pageCounts[0] || '34 pages',
    speed: metadata.speeds[0] || 'Normal',
    oldPassportNumber: '',
    notes: '',
    status: 'Documents Pending',
    assignedEmployeeId: '',
    paymentStatus: 'unknown',
    paymentAmount: '',
    paymentNote: '',
  }
}

function draftToForm(draft: PakPassportDraft): PakPassportDraftFormData {
  return {
    applicantName: draft.applicant_name || '',
    applicantCnic: draft.applicant_cnic || '',
    applicantEmail: draft.applicant_email || '',
    applicantPhone: draft.applicant_phone || '',
    familyHeadEmail: draft.family_head_email || '',
    applicationType: draft.application_type || 'Renewal',
    category: draft.category || 'Adult 10 Year',
    pageCount: draft.page_count || '34 pages',
    speed: draft.speed || 'Normal',
    oldPassportNumber: draft.old_passport_number || '',
    notes: draft.notes || '',
    status: draft.status || 'Documents Pending',
    assignedEmployeeId: draft.assigned_employee_id || '',
    paymentStatus: draft.payment_status || 'unknown',
    paymentAmount:
      draft.payment_amount === null || draft.payment_amount === undefined
        ? ''
        : String(draft.payment_amount),
    paymentNote: draft.payment_note || '',
  }
}

function statusTone(status: string) {
  if (status === 'Ready to Process') return 'bg-emerald-50 text-emerald-700 border-emerald-200'
  if (status === 'With External Staff') return 'bg-blue-50 text-blue-700 border-blue-200'
  if (status === 'Tracking Received') return 'bg-violet-50 text-violet-700 border-violet-200'
  if (status === 'Cancelled') return 'bg-rose-50 text-rose-700 border-rose-200'
  if (status === 'Converted') return 'bg-slate-100 text-slate-700 border-slate-200'
  return 'bg-amber-50 text-amber-700 border-amber-200'
}

function paymentTone(status: string) {
  if (status === 'taken') return 'bg-amber-50 text-amber-700 border-amber-200'
  if (status === 'refunded') return 'bg-emerald-50 text-emerald-700 border-emerald-200'
  if (status === 'not_taken') return 'bg-slate-50 text-slate-600 border-slate-200'
  return 'bg-zinc-50 text-zinc-600 border-zinc-200'
}

export default function DraftModePanel({
  drafts,
  documentCounts,
  employeeOptions,
  metadata,
  currentUserId,
  onManageDocuments,
}: DraftModePanelProps) {
  const router = useRouter()
  const [showForm, setShowForm] = useState(false)
  const [editingDraftId, setEditingDraftId] = useState<string | null>(null)
  const [formData, setFormData] = useState<PakPassportDraftFormData>(() =>
    createEmptyDraftForm(metadata),
  )
  const [isSaving, setIsSaving] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'All' | PakPassportDraftStatus>('All')
  const [paymentFilter, setPaymentFilter] = useState<'All' | PakPassportDraftPaymentStatus>('All')
  const [convertDraft, setConvertDraft] = useState<PakPassportDraft | null>(null)
  const [trackingNumber, setTrackingNumber] = useState('')
  const [cancelDraft, setCancelDraft] = useState<PakPassportDraft | null>(null)
  const [cancelReason, setCancelReason] = useState('')
  const [busyDraftId, setBusyDraftId] = useState<string | null>(null)

  const resetForm = () => {
    setEditingDraftId(null)
    setFormData(createEmptyDraftForm(metadata))
    setShowForm(false)
  }

  const filteredDrafts = useMemo(() => {
    const terms = searchQuery
      .toLowerCase()
      .split(/\s+/)
      .map((term) => term.trim())
      .filter(Boolean)

    return drafts.filter((draft) => {
      if (statusFilter !== 'All' && draft.status !== statusFilter) return false
      if (paymentFilter !== 'All' && draft.payment_status !== paymentFilter) return false

      if (terms.length === 0) return true

      const employee = pickOne(draft.assigned_employee)
      const haystack = [
        draft.draft_id,
        draft.applicant_name,
        draft.applicant_cnic,
        draft.applicant_email,
        draft.applicant_phone,
        draft.family_head_email,
        draft.application_type,
        draft.category,
        draft.speed,
        draft.status,
        draft.payment_status,
        draft.notes,
        employee?.full_name,
      ]
        .join(' ')
        .toLowerCase()

      const compactHaystack = haystack.replace(/[^a-z0-9]/g, '')
      return terms.every(
        (term) =>
          haystack.includes(term) || compactHaystack.includes(term.replace(/[^a-z0-9]/g, '')),
      )
    })
  }, [drafts, paymentFilter, searchQuery, statusFilter])

  const applicationTypeOptions = useMemo(
    () =>
      metadata.applicationTypes.includes('Lost')
        ? metadata.applicationTypes
        : [...metadata.applicationTypes, 'Lost'],
    [metadata.applicationTypes],
  )

  const oldPassportRequired = formData.applicationType !== 'First Time'

  const handleFormChange = (
    event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>,
  ) => {
    const { name, type } = event.target
    const checked = (event.target as HTMLInputElement).checked
    let value = event.target.value

    if (type === 'checkbox') {
      setFormData((current) => ({ ...current, [name]: checked }))
      return
    }

    if (name === 'applicantCnic') value = formatCNIC(value)
    if (name === 'oldPassportNumber') value = value.toUpperCase()

    if (name === 'applicationType' && value === 'First Time') {
      setFormData((current) => ({ ...current, applicationType: value, oldPassportNumber: '' }))
      return
    }

    setFormData((current) => ({ ...current, [name]: value }))
  }

  const openCreateForm = () => {
    setEditingDraftId(null)
    setFormData(createEmptyDraftForm(metadata))
    setShowForm(true)
  }

  const openEditForm = (draft: PakPassportDraft) => {
    setEditingDraftId(draft.id)
    setFormData(draftToForm(draft))
    setShowForm(true)
  }

  const manageDocuments = (draftId: string) => {
    if (onManageDocuments) {
      onManageDocuments(draftId)
      return
    }
    router.push(`/dashboard/applications/passports/drafts/${encodeURIComponent(draftId)}/documents`)
  }

  const saveDraft = async () => {
    setIsSaving(true)
    const result = editingDraftId
      ? await pakPassportApi.updateDraft(editingDraftId, formData, currentUserId)
      : await pakPassportApi.createDraft(formData, currentUserId)
    setIsSaving(false)

    if (result.ok) {
      toast.success(editingDraftId ? 'Draft updated' : 'Draft created')
      resetForm()
      router.refresh()
      return
    }

    toast.error(result.error || 'Draft save failed')
  }

  const patchDraft = async (draft: PakPassportDraft, data: Partial<PakPassportDraftFormData>) => {
    setBusyDraftId(draft.id)
    const result = await pakPassportApi.updateDraft(draft.id, data, currentUserId)
    setBusyDraftId(null)

    if (result.ok) {
      toast.success('Draft updated')
      router.refresh()
      return
    }

    toast.error(result.error || 'Draft update failed')
  }

  const confirmConvert = async () => {
    if (!convertDraft) return
    if (!trackingNumber.trim()) {
      toast.error('Tracking number is required')
      return
    }

    setBusyDraftId(convertDraft.id)
    const result = await pakPassportApi.convertDraft(convertDraft.id, trackingNumber, currentUserId)
    setBusyDraftId(null)

    if (result.ok) {
      toast.success('Draft converted')
      setConvertDraft(null)
      setTrackingNumber('')
      router.refresh()
      return
    }

    toast.error(result.error || 'Conversion failed')
  }

  const confirmCancel = async () => {
    if (!cancelDraft) return

    setBusyDraftId(cancelDraft.id)
    const result = await pakPassportApi.cancelDraft(cancelDraft.id, cancelReason, currentUserId)
    setBusyDraftId(null)

    if (result.ok) {
      toast.success('Draft cancelled')
      setCancelDraft(null)
      setCancelReason('')
      router.refresh()
      return
    }

    toast.error(result.error || 'Cancel failed')
  }

  return (
    <section className="rounded-xl border border-green-200 bg-white shadow-sm overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-green-100 bg-green-50 px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-lg font-black text-slate-900">Draft Mode</h2>
          <p className="text-xs font-semibold text-green-800">
            {filteredDrafts.length} active drafts
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={openCreateForm}
            className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-bold text-white hover:bg-green-700"
          >
            <Plus className="h-4 w-4" />
            New Draft
          </button>
          {showForm && (
            <button
              type="button"
              onClick={resetForm}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50"
            >
              <X className="h-4 w-4" />
              Close
            </button>
          )}
        </div>
      </div>

      <div className="space-y-4 p-4">
        {showForm && (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div className="mb-4 flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-green-700" />
              <h3 className="text-sm font-black text-slate-800">
                {editingDraftId ? 'Edit Draft' : 'New Draft'}
              </h3>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <div className="space-y-3">
                <input
                  name="applicantName"
                  value={formData.applicantName}
                  onChange={handleFormChange}
                  placeholder="Full legal name"
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                />
                <input
                  name="applicantCnic"
                  value={formData.applicantCnic}
                  onChange={handleFormChange}
                  placeholder="CNIC"
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-mono"
                />
                <input
                  name="applicantEmail"
                  value={formData.applicantEmail}
                  onChange={handleFormChange}
                  placeholder="Email"
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                />
                <input
                  name="applicantPhone"
                  value={formData.applicantPhone}
                  onChange={handleFormChange}
                  placeholder="Phone"
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                />
                <input
                  name="familyHeadEmail"
                  value={formData.familyHeadEmail}
                  onChange={handleFormChange}
                  placeholder="Family head email"
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                />
              </div>

              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <select
                    name="applicationType"
                    value={formData.applicationType}
                    onChange={handleFormChange}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                  >
                    {applicationTypeOptions.map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                  <select
                    name="speed"
                    value={formData.speed}
                    onChange={handleFormChange}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                  >
                    {metadata.speeds.map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                  <select
                    name="category"
                    value={formData.category}
                    onChange={handleFormChange}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                  >
                    {metadata.categories.map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                  <select
                    name="pageCount"
                    value={formData.pageCount}
                    onChange={handleFormChange}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                  >
                    {metadata.pageCounts.map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                </div>
                {oldPassportRequired && (
                  <input
                    name="oldPassportNumber"
                    value={formData.oldPassportNumber}
                    onChange={handleFormChange}
                    placeholder="Old passport number"
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-mono uppercase"
                  />
                )}
              </div>

              <div className="space-y-3">
                <select
                  name="status"
                  value={formData.status}
                  onChange={handleFormChange}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                >
                  {ACTIVE_DRAFT_STATUSES.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
                <select
                  name="assignedEmployeeId"
                  value={formData.assignedEmployeeId}
                  onChange={handleFormChange}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                >
                  <option value="">Unassigned</option>
                  {employeeOptions.map((employee) => (
                    <option key={employee.id} value={employee.id}>
                      {employee.full_name}
                    </option>
                  ))}
                </select>
                <div className="grid grid-cols-2 gap-3">
                  <select
                    name="paymentStatus"
                    value={formData.paymentStatus}
                    onChange={handleFormChange}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                  >
                    {PAYMENT_STATUSES.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <input
                    name="paymentAmount"
                    value={formData.paymentAmount}
                    onChange={handleFormChange}
                    placeholder="Amount"
                    inputMode="decimal"
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                  />
                </div>
                <textarea
                  name="paymentNote"
                  value={formData.paymentNote}
                  onChange={handleFormChange}
                  placeholder="Payment note"
                  rows={2}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                />
                <textarea
                  name="notes"
                  value={formData.notes}
                  onChange={handleFormChange}
                  placeholder="Draft notes"
                  rows={3}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={resetForm}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50"
              >
                <X className="h-4 w-4" />
                Cancel
              </button>
              <button
                type="button"
                onClick={saveDraft}
                disabled={isSaving}
                className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-bold text-white hover:bg-green-700 disabled:bg-slate-400"
              >
                <Save className="h-4 w-4" />
                {isSaving ? 'Saving' : 'Save Draft'}
              </button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_180px_180px]">
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search drafts"
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
          />
          <select
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(event.target.value as 'All' | PakPassportDraftStatus)
            }
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
          >
            <option value="All">All statuses</option>
            {DRAFT_STATUSES.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
          <select
            value={paymentFilter}
            onChange={(event) =>
              setPaymentFilter(event.target.value as 'All' | PakPassportDraftPaymentStatus)
            }
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
          >
            <option value="All">All payments</option>
            {PAYMENT_STATUSES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full min-w-[1050px] text-left">
            <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-3">Draft</th>
                <th className="px-3 py-3">Applicant</th>
                <th className="px-3 py-3">Specs</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3">Assigned</th>
                <th className="px-3 py-3">Payment</th>
                <th className="px-3 py-3">Docs</th>
                <th className="px-3 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredDrafts.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-10 text-center text-sm text-slate-400">
                    No draft records found.
                  </td>
                </tr>
              ) : (
                filteredDrafts.map((draft) => {
                  const assignedEmployee = pickOne(draft.assigned_employee)
                  const documentCount = documentCounts[draft.draft_id] || 0
                  const isBusy = busyDraftId === draft.id

                  return (
                    <tr key={draft.id} className="align-top hover:bg-slate-50">
                      <td className="px-3 py-3">
                        <div className="font-mono text-sm font-black text-slate-900">
                          {draft.draft_id}
                        </div>
                        <div className="mt-1 text-[11px] font-semibold text-slate-500">
                          {formatDate(draft.updated_at)}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <div className="text-sm font-bold text-slate-800">
                          {draft.applicant_name}
                        </div>
                        <div className="font-mono text-xs text-slate-500">
                          {draft.applicant_cnic}
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          {draft.applicant_phone || '-'}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <div className="text-sm font-semibold text-slate-700">
                          {draft.application_type}
                        </div>
                        <div className="text-xs text-slate-500">{draft.category}</div>
                        <div className="text-xs font-bold text-slate-500">{draft.speed}</div>
                      </td>
                      <td className="px-3 py-3">
                        <select
                          value={draft.status}
                          disabled={
                            isBusy || draft.status === 'Converted' || draft.status === 'Cancelled'
                          }
                          onChange={(event) =>
                            patchDraft(draft, {
                              status: event.target.value as PakPassportDraftStatus,
                            })
                          }
                          className={`rounded-lg border px-2 py-1 text-xs font-bold ${statusTone(draft.status)}`}
                        >
                          {DRAFT_STATUSES.map((status) => (
                            <option key={status} value={status}>
                              {status}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-3">
                        <select
                          value={draft.assigned_employee_id || ''}
                          disabled={
                            isBusy || draft.status === 'Converted' || draft.status === 'Cancelled'
                          }
                          onChange={(event) =>
                            patchDraft(draft, { assignedEmployeeId: event.target.value })
                          }
                          className="w-40 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700"
                        >
                          <option value="">Unassigned</option>
                          {employeeOptions.map((employee) => (
                            <option key={employee.id} value={employee.id}>
                              {employee.full_name}
                            </option>
                          ))}
                        </select>
                        <div className="mt-1 text-[11px] text-slate-400">
                          {assignedEmployee?.full_name || '-'}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <select
                          value={draft.payment_status}
                          disabled={isBusy || draft.status === 'Converted'}
                          onChange={(event) =>
                            patchDraft(draft, {
                              paymentStatus: event.target.value as PakPassportDraftPaymentStatus,
                            })
                          }
                          className={`rounded-lg border px-2 py-1 text-xs font-bold ${paymentTone(draft.payment_status)}`}
                        >
                          {PAYMENT_STATUSES.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                        {draft.payment_amount ? (
                          <div className="mt-1 text-xs font-bold text-slate-600">
                            {draft.payment_amount}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-3 py-3">
                        <button
                          type="button"
                          onClick={() => manageDocuments(draft.draft_id)}
                          className="inline-flex items-center gap-2 rounded-lg bg-sky-50 px-3 py-2 text-xs font-bold text-sky-700 hover:bg-sky-100"
                        >
                          <FileText className="h-4 w-4" />
                          {documentCount}
                        </button>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => openEditForm(draft)}
                            disabled={isBusy || draft.status === 'Converted'}
                            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-blue-700 disabled:opacity-40"
                            title="Edit"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setConvertDraft(draft)
                              setTrackingNumber('')
                            }}
                            disabled={
                              isBusy || draft.status === 'Converted' || draft.status === 'Cancelled'
                            }
                            className="rounded-lg p-2 text-slate-500 hover:bg-emerald-50 hover:text-emerald-700 disabled:opacity-40"
                            title="Add tracking number"
                          >
                            <CheckCircle2 className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setCancelDraft(draft)
                              setCancelReason('')
                            }}
                            disabled={
                              isBusy || draft.status === 'Converted' || draft.status === 'Cancelled'
                            }
                            className="rounded-lg p-2 text-slate-500 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-40"
                            title="Cancel draft"
                          >
                            <Ban className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {convertDraft && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-2xl">
            <h3 className="text-lg font-black text-slate-900">Add Tracking Number</h3>
            <p className="mt-1 font-mono text-sm font-bold text-slate-500">
              {convertDraft.draft_id}
            </p>
            <input
              value={trackingNumber}
              onChange={(event) => setTrackingNumber(event.target.value.toUpperCase())}
              placeholder="Official tracking number"
              className="mt-4 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono uppercase"
            />
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConvertDraft(null)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-bold text-slate-600"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmConvert}
                disabled={busyDraftId === convertDraft.id}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white disabled:bg-slate-400"
              >
                Convert
              </button>
            </div>
          </div>
        </div>
      )}

      {cancelDraft && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-2xl">
            <h3 className="text-lg font-black text-slate-900">Cancel Draft</h3>
            <p className="mt-1 font-mono text-sm font-bold text-slate-500">
              {cancelDraft.draft_id}
            </p>
            <textarea
              value={cancelReason}
              onChange={(event) => setCancelReason(event.target.value)}
              placeholder="Cancellation reason"
              rows={3}
              className="mt-4 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCancelDraft(null)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-bold text-slate-600"
              >
                Close
              </button>
              <button
                type="button"
                onClick={confirmCancel}
                disabled={busyDraftId === cancelDraft.id}
                className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-bold text-white disabled:bg-slate-400"
              >
                Cancel Draft
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
