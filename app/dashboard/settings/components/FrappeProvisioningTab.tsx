/**
 * Frappe Provisioning Tab
 * Transfers IMS employees into Frappe HRMS with a reviewed first-time details form.
 */

'use client'

import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, Link2, RefreshCw, Search, Send, UserPlus, UsersRound } from 'lucide-react'
import { toast } from 'sonner'

type CandidateStatus = 'linked' | 'ready_for_transfer' | 'missing_email'

type ProvisioningCandidate = {
  employee_id: string
  full_name: string
  email: string
  role_name: string | null
  department_name: string | null
  location_name: string | null
  manager_id: string | null
  is_active: boolean
  frappe_employee_id: string | null
  frappe_user_id: string | null
  status: CandidateStatus
  missing_fields: string[]
}

type ProvisioningOptions = {
  companies: string[]
  departments: string[]
  branches: string[]
  designations: string[]
  employment_types: string[]
  holiday_lists: string[]
}

type EmployeeProvisioningReadiness = {
  ready: boolean
  error: string | null
}

type TransferForm = {
  company: string
  date_of_joining: string
  gender: string
  date_of_birth: string
  employment_type: string
  holiday_list: string
  department: string
  branch: string
  designation: string
  create_user: boolean
  send_welcome_email: boolean
}

const emptyOptions: ProvisioningOptions = {
  companies: [],
  departments: [],
  branches: [],
  designations: [],
  employment_types: [],
  holiday_lists: [],
}

const FALLBACK_DEFAULT_COMPANY = 'Piyam Travel LTD'

const initialForm: TransferForm = {
  company: FALLBACK_DEFAULT_COMPANY,
  date_of_joining: '',
  gender: '',
  date_of_birth: '',
  employment_type: '',
  holiday_list: '',
  department: '',
  branch: '',
  designation: '',
  create_user: false,
  send_welcome_email: false,
}

function statusBadge(status: CandidateStatus) {
  if (status === 'linked') {
    return 'bg-emerald-100 text-emerald-700'
  }
  if (status === 'missing_email') {
    return 'bg-red-100 text-red-700'
  }
  return 'bg-blue-100 text-blue-700'
}

function statusLabel(status: CandidateStatus) {
  if (status === 'linked') return 'Linked'
  if (status === 'missing_email') return 'Needs email'
  return 'Ready'
}

function DataList({ id, values }: { id: string; values: string[] }) {
  if (values.length === 0) return null

  return (
    <datalist id={id}>
      {values.map((value) => (
        <option key={value} value={value} />
      ))}
    </datalist>
  )
}

function Field({
  label,
  required,
  children,
}: {
  label: string
  required?: boolean
  children: ReactNode
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
        {required ? <span className="text-red-500"> *</span> : null}
      </span>
      <div className="mt-1">{children}</div>
    </label>
  )
}

export function FrappeProvisioningTab() {
  const [loading, setLoading] = useState(true)
  const [transferring, setTransferring] = useState(false)
  const [showLinked, setShowLinked] = useState(false)
  const [search, setSearch] = useState('')
  const [candidates, setCandidates] = useState<ProvisioningCandidate[]>([])
  const [options, setOptions] = useState<ProvisioningOptions>(emptyOptions)
  const [employeeProvisioning, setEmployeeProvisioning] = useState<EmployeeProvisioningReadiness | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [form, setForm] = useState<TransferForm>(initialForm)

  const selected = useMemo(
    () => candidates.find((candidate) => candidate.employee_id === selectedId) || null,
    [candidates, selectedId],
  )

  const counts = useMemo(() => {
    const linked = candidates.filter((candidate) => candidate.status === 'linked').length
    const ready = candidates.filter((candidate) => candidate.status === 'ready_for_transfer').length
    const blocked = candidates.filter((candidate) => candidate.status === 'missing_email').length

    return {
      total: candidates.length,
      linked,
      ready,
      blocked,
    }
  }, [candidates])

  const filteredCandidates = useMemo(() => {
    const needle = search.trim().toLowerCase()

    return candidates.filter((candidate) => {
      if (!showLinked && candidate.status === 'linked') return false
      if (!needle) return true

      return [
        candidate.full_name,
        candidate.email,
        candidate.role_name,
        candidate.department_name,
        candidate.location_name,
        candidate.frappe_employee_id,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle))
    })
  }, [candidates, search, showLinked])

  const loadCandidates = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/integrations/frappe/provisioning/candidates')
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Unable to load Frappe transfer candidates')
      }

      const nextCandidates = (data.candidates || []) as ProvisioningCandidate[]
      setCandidates(nextCandidates)
      setOptions((data.options || emptyOptions) as ProvisioningOptions)
      setEmployeeProvisioning((data.employee_provisioning || null) as EmployeeProvisioningReadiness | null)
      const defaultCompany = String(data.default_company || FALLBACK_DEFAULT_COMPANY)
      setForm((current) => ({
        ...current,
        company: defaultCompany,
      }))

      const preferred = nextCandidates.find((candidate) => candidate.status === 'ready_for_transfer')
        || nextCandidates[0]
        || null
      setSelectedId((current) => current || preferred?.employee_id || null)
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Unable to load Frappe transfer candidates')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadCandidates()
  }, [])

  useEffect(() => {
    if (!selected) return

    setForm((current) => ({
      ...current,
      date_of_joining: current.date_of_joining || new Date().toISOString().slice(0, 10),
      department: current.department || selected.department_name || '',
      branch: current.branch || selected.location_name || '',
      designation: current.designation || selected.role_name || '',
    }))
  }, [selected])

  const updateForm = (updates: Partial<TransferForm>) => {
    setForm((current) => ({ ...current, ...updates }))
  }

  const transferSelected = async () => {
    if (!selected) {
      toast.error('Select an employee first')
      return
    }

    if (selected.status === 'linked') {
      toast.info('This employee is already linked to Frappe')
      return
    }

    if (employeeProvisioning && !employeeProvisioning.ready) {
      toast.error(employeeProvisioning.error || 'Frappe Employee DocType is not ready')
      return
    }

    setTransferring(true)
    try {
      const response = await fetch('/api/integrations/frappe/provisioning/transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employee_id: selected.employee_id,
          ...form,
        }),
      })
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Unable to transfer employee to Frappe')
      }

      const updatedCandidate = data.candidate as ProvisioningCandidate | undefined
      if (updatedCandidate) {
        setCandidates((current) =>
          current.map((candidate) =>
            candidate.employee_id === updatedCandidate.employee_id ? updatedCandidate : candidate,
          ),
        )
      } else {
        await loadCandidates()
      }

      toast.success(
        data.linked
          ? 'Existing Frappe employee linked'
          : 'Employee transferred to Frappe HRMS',
      )
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Unable to transfer employee to Frappe')
    } finally {
      setTransferring(false)
    }
  }

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="bg-gradient-to-br from-emerald-950 via-slate-950 to-cyan-950 p-6 text-white">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-100">
                <UsersRound className="h-3.5 w-3.5" />
                Frappe Transit
              </div>
              <h2 className="mt-4 text-2xl font-bold tracking-tight">Transfer IMS staff to HRMS</h2>
              <p className="mt-2 max-w-2xl text-sm text-slate-200">
                Review each staff member once, fill the HRMS-only details, then create or link the
                Frappe Employee record. Frappe login users are optional.
              </p>
            </div>

            <button
              onClick={() => void loadCandidates()}
              disabled={loading}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-50 disabled:opacity-60"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        {employeeProvisioning && !employeeProvisioning.ready && (
          <div className="border-b border-red-200 bg-red-50 p-4 text-red-900">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
              <div>
                <p className="font-semibold">Frappe Employee provisioning is not ready</p>
                <p className="mt-1 text-sm">
                  {employeeProvisioning.error || 'The Frappe Employee DocType could not be verified.'}
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 border-b border-slate-200 bg-slate-50 p-4 md:grid-cols-4">
          <SummaryCard label="Total IMS staff" value={counts.total} />
          <SummaryCard label="Ready to transfer" value={counts.ready} tone="blue" />
          <SummaryCard label="Linked in Frappe" value={counts.linked} tone="green" />
          <SummaryCard label="Needs email" value={counts.blocked} tone="amber" />
        </div>

        <div className="grid gap-0 lg:grid-cols-[minmax(0,0.95fr)_minmax(420px,1.05fr)]">
          <div className="border-b border-slate-200 lg:border-b-0 lg:border-r">
            <div className="flex flex-col gap-3 border-b border-slate-200 p-4 md:flex-row md:items-center">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search staff, email, branch..."
                  className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                />
              </div>
              <label className="inline-flex items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={showLinked}
                  onChange={(event) => setShowLinked(event.target.checked)}
                  className="rounded border-slate-300 text-emerald-700 focus:ring-emerald-600"
                />
                Show linked
              </label>
            </div>

            <div className="max-h-[680px] overflow-y-auto">
              {loading ? (
                <div className="flex items-center gap-2 p-6 text-sm text-slate-500">
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  Loading staff...
                </div>
              ) : filteredCandidates.length === 0 ? (
                <div className="p-6 text-sm text-slate-500">No staff match the current filter.</div>
              ) : (
                filteredCandidates.map((candidate) => (
                  <button
                    key={candidate.employee_id}
                    onClick={() => setSelectedId(candidate.employee_id)}
                    className={`w-full border-b border-slate-100 p-4 text-left transition hover:bg-slate-50 ${
                      selectedId === candidate.employee_id ? 'bg-emerald-50/70' : 'bg-white'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-slate-900">{candidate.full_name}</p>
                        <p className="mt-0.5 text-xs text-slate-500">{candidate.email || 'No email'}</p>
                      </div>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusBadge(candidate.status)}`}>
                        {statusLabel(candidate.status)}
                      </span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
                      {candidate.role_name ? <span>{candidate.role_name}</span> : null}
                      {candidate.department_name ? <span>{candidate.department_name}</span> : null}
                      {candidate.location_name ? <span>{candidate.location_name}</span> : null}
                    </div>
                    {candidate.frappe_employee_id ? (
                      <p className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
                        <Link2 className="h-3.5 w-3.5" />
                        {candidate.frappe_employee_id}
                      </p>
                    ) : null}
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="p-5">
            {!selected ? (
              <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
                Select an employee to start the transfer.
              </div>
            ) : selected.status === 'linked' ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-6 text-emerald-900">
                <CheckCircle2 className="h-8 w-8" />
                <h3 className="mt-4 text-lg font-bold">{selected.full_name} is already linked</h3>
                <p className="mt-2 text-sm">
                  Frappe Employee ID: <span className="font-mono">{selected.frappe_employee_id}</span>
                </p>
                {selected.frappe_user_id ? (
                  <p className="mt-1 text-sm">
                    Frappe User: <span className="font-mono">{selected.frappe_user_id}</span>
                  </p>
                ) : null}
              </div>
            ) : (
              <div className="space-y-5">
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Transit details</h3>
                  <p className="mt-1 text-sm text-slate-600">
                    IMS already has the identity basics. Fill the HRMS fields that Frappe needs for
                    the first transfer.
                  </p>
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p className="font-semibold text-slate-900">{selected.full_name}</p>
                  <p className="mt-1 text-sm text-slate-600">{selected.email}</p>
                  <div className="mt-3 grid gap-2 text-xs text-slate-500 sm:grid-cols-3">
                    <span>Role: {selected.role_name || '-'}</span>
                    <span>Dept: {selected.department_name || '-'}</span>
                    <span>Branch: {selected.location_name || '-'}</span>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Company" required>
                    <input
                      value={form.company}
                      readOnly
                      className="w-full rounded-lg border border-slate-300 bg-slate-100 px-3 py-2 text-sm outline-none"
                    />
                  </Field>

                  <Field label="Date of joining" required>
                    <input
                      type="date"
                      value={form.date_of_joining}
                      onChange={(event) => updateForm({ date_of_joining: event.target.value })}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                    />
                  </Field>

                  <Field label="Gender" required>
                    <select
                      value={form.gender}
                      onChange={(event) => updateForm({ gender: event.target.value })}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                    >
                      <option value="">Select gender</option>
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Other">Other</option>
                    </select>
                  </Field>

                  <Field label="Date of birth" required>
                    <input
                      type="date"
                      value={form.date_of_birth}
                      onChange={(event) => updateForm({ date_of_birth: event.target.value })}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                    />
                  </Field>

                  <Field label="Employment type">
                    <input
                      list="frappe-employment-types"
                      value={form.employment_type}
                      onChange={(event) => updateForm({ employment_type: event.target.value })}
                      placeholder="Full-time, Part-time..."
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                    />
                    <DataList id="frappe-employment-types" values={options.employment_types} />
                  </Field>

                  <Field label="Holiday list">
                    <input
                      list="frappe-holiday-lists"
                      value={form.holiday_list}
                      onChange={(event) => updateForm({ holiday_list: event.target.value })}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                    />
                    <DataList id="frappe-holiday-lists" values={options.holiday_lists} />
                  </Field>

                  <Field label="Department">
                    <input
                      list="frappe-departments"
                      value={form.department}
                      onChange={(event) => updateForm({ department: event.target.value })}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                    />
                    <DataList id="frappe-departments" values={options.departments} />
                  </Field>

                  <Field label="Branch">
                    <input
                      list="frappe-branches"
                      value={form.branch}
                      onChange={(event) => updateForm({ branch: event.target.value })}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                    />
                    <DataList id="frappe-branches" values={options.branches} />
                  </Field>

                  <Field label="Designation">
                    <input
                      list="frappe-designations"
                      value={form.designation}
                      onChange={(event) => updateForm({ designation: event.target.value })}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                    />
                    <DataList id="frappe-designations" values={options.designations} />
                  </Field>
                </div>

                <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
                  <label className="flex items-start gap-3 text-sm text-blue-950">
                    <input
                      type="checkbox"
                      checked={form.create_user}
                      onChange={(event) => updateForm({ create_user: event.target.checked })}
                      className="mt-1 rounded border-blue-300 text-blue-700 focus:ring-blue-600"
                    />
                    <span>
                      <span className="font-semibold">Create Frappe login user</span>
                      <span className="mt-1 block text-blue-800">
                        Leave this off for staff who only use IMS. Enable it for HR/admin staff who
                        need to sign into Frappe directly.
                      </span>
                    </span>
                  </label>

                  {form.create_user ? (
                    <label className="mt-3 flex items-center gap-3 text-sm text-blue-950">
                      <input
                        type="checkbox"
                        checked={form.send_welcome_email}
                        onChange={(event) => updateForm({ send_welcome_email: event.target.checked })}
                        className="rounded border-blue-300 text-blue-700 focus:ring-blue-600"
                      />
                      Send Frappe welcome email
                    </label>
                  ) : null}
                </div>

                <button
                  onClick={() => void transferSelected()}
                  disabled={transferring || selected.status === 'missing_email' || employeeProvisioning?.ready === false}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-emerald-700 disabled:opacity-50"
                >
                  {transferring ? (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  ) : form.create_user ? (
                    <UserPlus className="h-4 w-4" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  {transferring ? 'Transferring...' : 'Transfer to Frappe HRMS'}
                </button>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  )
}

function SummaryCard({
  label,
  value,
  tone = 'slate',
}: {
  label: string
  value: number
  tone?: 'slate' | 'blue' | 'green' | 'amber'
}) {
  const tones = {
    slate: 'bg-white border-slate-200 text-slate-900',
    blue: 'bg-blue-50 border-blue-200 text-blue-900',
    green: 'bg-emerald-50 border-emerald-200 text-emerald-900',
    amber: 'bg-amber-50 border-amber-200 text-amber-900',
  }

  return (
    <div className={`rounded-xl border p-4 ${tones[tone]}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-bold">{value}</p>
    </div>
  )
}
