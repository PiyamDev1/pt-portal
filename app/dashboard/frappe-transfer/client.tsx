/**
 * Self-service Frappe transfer page.
 */

'use client'

import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { CheckCircle2, RefreshCw, Send, UserRoundCheck } from 'lucide-react'
import { toast } from 'sonner'

type Candidate = {
  employee_id: string
  full_name: string
  email: string
  role_name: string | null
  department_name: string | null
  location_name: string | null
  frappe_employee_id: string | null
  status: 'linked' | 'ready_for_transfer' | 'missing_email'
}

type Options = {
  companies: string[]
  departments: string[]
  branches: string[]
  designations: string[]
  employment_types: string[]
  holiday_lists: string[]
}

type FormState = {
  company: string
  date_of_joining: string
  gender: string
  date_of_birth: string
  employment_type: string
  holiday_list: string
  department: string
  branch: string
  designation: string
}

const emptyOptions: Options = {
  companies: [],
  departments: [],
  branches: [],
  designations: [],
  employment_types: [],
  holiday_lists: [],
}

const initialForm: FormState = {
  company: '',
  date_of_joining: new Date().toISOString().slice(0, 10),
  gender: '',
  date_of_birth: '',
  employment_type: '',
  holiday_list: '',
  department: '',
  branch: '',
  designation: '',
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

export function FrappeTransferClient() {
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [candidate, setCandidate] = useState<Candidate | null>(null)
  const [options, setOptions] = useState<Options>(emptyOptions)
  const [form, setForm] = useState<FormState>(initialForm)

  const adminMissingItems = useMemo(() => {
    if (!candidate) return []

    const missing: string[] = []

    if (!candidate.email) {
      missing.push('work email')
    }

    if (options.companies.length === 0) {
      missing.push('Frappe company')
    }

    if (options.companies.length > 1 && !form.company) {
      missing.push('company assignment')
    }

    if (!candidate.department_name) {
      missing.push('department')
    }

    if (!candidate.location_name) {
      missing.push('branch/location')
    }

    if (!candidate.role_name) {
      missing.push('designation/role')
    }

    return missing
  }, [candidate, form.company, options.companies.length])

  const loadStatus = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/integrations/frappe/provisioning/me')
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || 'Unable to load HRMS transfer status')
      }

      const nextCandidate = data.candidate as Candidate
      setCandidate(nextCandidate)
      setOptions((data.options || emptyOptions) as Options)
      const nextOptions = (data.options || emptyOptions) as Options
      setForm((current) => ({
        ...current,
        company: current.company || (nextOptions.companies.length === 1 ? nextOptions.companies[0] : ''),
        department: nextCandidate.department_name || current.department,
        branch: nextCandidate.location_name || current.branch,
        designation: nextCandidate.role_name || current.designation,
      }))
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Unable to load HRMS transfer status')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadStatus()
  }, [])

  const updateForm = (updates: Partial<FormState>) => {
    setForm((current) => ({ ...current, ...updates }))
  }

  const submitTransfer = async () => {
    setSubmitting(true)
    try {
      const response = await fetch('/api/integrations/frappe/provisioning/me', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || 'Unable to complete HRMS transfer')
      }

      setCandidate(data.candidate as Candidate)
      toast.success('HRMS transfer completed')
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Unable to complete HRMS transfer')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="flex items-center gap-3 text-slate-600">
          <RefreshCw className="h-5 w-5 animate-spin" />
          Loading your HRMS transit status...
        </div>
      </div>
    )
  }

  if (!candidate) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-8 text-red-900 shadow-sm">
        We could not find your IMS employee profile. Ask an admin to check your staff account.
      </div>
    )
  }

  if (candidate.status === 'linked') {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-8 text-emerald-950 shadow-sm">
        <CheckCircle2 className="h-10 w-10" />
        <h2 className="mt-4 text-2xl font-bold">Your HRMS profile is connected</h2>
        <p className="mt-2 text-sm">
          Frappe Employee ID: <span className="font-mono">{candidate.frappe_employee_id}</span>
        </p>
      </div>
    )
  }

  if (adminMissingItems.length > 0) {
    return (
      <div className="grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-start gap-4">
            <div className="rounded-2xl bg-emerald-100 p-3 text-emerald-700">
              <UserRoundCheck className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900">Your IMS details</h2>
              <p className="mt-2 text-sm text-slate-600">
                Your profile exists in IMS, but HRMS needs a few organization details before the
                transfer can continue.
              </p>
            </div>
          </div>

          <dl className="mt-6 space-y-4 text-sm">
            <InfoRow label="Name" value={candidate.full_name} />
            <InfoRow label="Email" value={candidate.email || 'Missing email'} />
            <InfoRow label="Role" value={candidate.role_name || '-'} />
            <InfoRow label="Department" value={candidate.department_name || '-'} />
            <InfoRow label="Branch" value={candidate.location_name || '-'} />
          </dl>
        </section>

        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-950 shadow-sm">
          <h2 className="text-xl font-bold">Contact your line manager or admin</h2>
          <p className="mt-2 text-sm">
            We cannot complete your HRMS transfer yet because some manager/admin-controlled details
            are missing. Ask your line manager or an admin to complete your onboarding data in IMS
            or use Settings - Frappe Transfer.
          </p>

          <div className="mt-5 rounded-xl border border-amber-200 bg-white/70 p-4">
            <p className="text-sm font-semibold">Missing setup details</p>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">
              {adminMissingItems.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>

          <button
            onClick={() => void loadStatus()}
            className="mt-5 inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700"
          >
            <RefreshCw className="h-4 w-4" />
            Recheck setup
          </button>
        </section>
      </div>
    )
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="rounded-2xl bg-emerald-100 p-3 text-emerald-700">
            <UserRoundCheck className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900">Confirm your IMS details</h2>
            <p className="mt-2 text-sm text-slate-600">
              These details come from IMS. The next form collects the HRMS fields that are not
              stored in the portal yet.
            </p>
          </div>
        </div>

        <dl className="mt-6 space-y-4 text-sm">
          <InfoRow label="Name" value={candidate.full_name} />
          <InfoRow label="Email" value={candidate.email || 'Missing email'} />
          <InfoRow label="Role" value={candidate.role_name || '-'} />
          <InfoRow label="Department" value={candidate.department_name || '-'} />
          <InfoRow label="Branch" value={candidate.location_name || '-'} />
        </dl>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-bold text-slate-900">Complete HRMS transit details</h2>
        <p className="mt-2 text-sm text-slate-600">
          These values create your Employee record in Frappe HRMS. Ask your manager if you are not
          sure what to select.
        </p>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <Field label="Company" required>
            <input
              list="self-frappe-companies"
              value={form.company}
              readOnly
              onChange={(event) => updateForm({ company: event.target.value })}
              className="w-full rounded-lg border border-slate-300 bg-slate-100 px-3 py-2 text-sm outline-none"
            />
            <DataList id="self-frappe-companies" values={options.companies} />
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
              list="self-frappe-employment-types"
              value={form.employment_type}
              onChange={(event) => updateForm({ employment_type: event.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
            />
            <DataList id="self-frappe-employment-types" values={options.employment_types} />
          </Field>

          <Field label="Holiday list">
            <input
              list="self-frappe-holiday-lists"
              value={form.holiday_list}
              onChange={(event) => updateForm({ holiday_list: event.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
            />
            <DataList id="self-frappe-holiday-lists" values={options.holiday_lists} />
          </Field>

          <Field label="Department">
            <input
              list="self-frappe-departments"
              value={form.department}
              readOnly
              onChange={(event) => updateForm({ department: event.target.value })}
              className="w-full rounded-lg border border-slate-300 bg-slate-100 px-3 py-2 text-sm outline-none"
            />
            <DataList id="self-frappe-departments" values={options.departments} />
          </Field>

          <Field label="Branch">
            <input
              list="self-frappe-branches"
              value={form.branch}
              readOnly
              onChange={(event) => updateForm({ branch: event.target.value })}
              className="w-full rounded-lg border border-slate-300 bg-slate-100 px-3 py-2 text-sm outline-none"
            />
            <DataList id="self-frappe-branches" values={options.branches} />
          </Field>

          <Field label="Designation">
            <input
              list="self-frappe-designations"
              value={form.designation}
              readOnly
              onChange={(event) => updateForm({ designation: event.target.value })}
              className="w-full rounded-lg border border-slate-300 bg-slate-100 px-3 py-2 text-sm outline-none"
            />
            <DataList id="self-frappe-designations" values={options.designations} />
          </Field>
        </div>

        <button
          onClick={() => void submitTransfer()}
          disabled={submitting || candidate.status === 'missing_email'}
          className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-emerald-700 disabled:opacity-50"
        >
          {submitting ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          {submitting ? 'Submitting...' : 'Complete HRMS transfer'}
        </button>
      </section>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-1 font-medium text-slate-900">{value}</dd>
    </div>
  )
}
