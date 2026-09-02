'use client'

import { useRef, useState, type FormEvent } from 'react'
import { ArrowRightLeft, Save, UserRoundCheck, X } from 'lucide-react'
import { toast } from 'sonner'
import { ModalBase } from '@/components'
import { correctTicketAttribution, TicketLedgerApiError } from './ledgerClientApi'
import type {
  TicketAttributionEmployee,
  TicketCommercialTreatment,
  TicketLedgerItem,
} from './types'

function newIdempotencyKey() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `ticket-attribution-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function fieldClass(hasError: boolean) {
  return `mt-1 w-full rounded-xl border bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:ring-2 ${
    hasError
      ? 'border-red-400 focus:border-red-500 focus:ring-red-100'
      : 'border-slate-300 focus:border-[#8b1e2d] focus:ring-red-100'
  }`
}

export function TicketAttributionDialog({
  item,
  employees,
  onClose,
  onSaved,
}: {
  item: TicketLedgerItem
  employees: TicketAttributionEmployee[]
  onClose: () => void
  onSaved: () => Promise<void>
}) {
  const [responsibleEmployeeId, setResponsibleEmployeeId] = useState(item.responsibleEmployee.id)
  const [assistantEmployeeIds, setAssistantEmployeeIds] = useState(
    item.assistantEmployees.map((employee) => employee.id),
  )
  const [commercialTreatment, setCommercialTreatment] = useState<TicketCommercialTreatment>(
    item.commercialTreatment,
  )
  const [commissionWaiverReason, setCommissionWaiverReason] = useState(
    item.commissionWaiverReason || '',
  )
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const idempotencyKey = useRef(newIdempotencyKey())

  const updateDraft = (update: () => void) => {
    if (isSaving) return
    update()
    setError('')
    idempotencyKey.current = newIdempotencyKey()
  }

  const selectedAssistants = assistantEmployeeIds.flatMap((id) => {
    const employee = employees.find((option) => option.id === id)
    return employee ? [employee] : []
  })

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (isSaving) return

    const availableEmployeeIds = new Set(employees.map((employee) => employee.id))
    if (!availableEmployeeIds.has(responsibleEmployeeId)) {
      setError('Choose an active responsible agent.')
      return
    }
    if (
      assistantEmployeeIds.length > 10 ||
      assistantEmployeeIds.includes(responsibleEmployeeId) ||
      assistantEmployeeIds.some((id) => !availableEmployeeIds.has(id))
    ) {
      setError('Choose up to 10 valid assistants who are not the responsible agent.')
      return
    }
    const cleanReason = reason.trim()
    if (!cleanReason) {
      setError('Enter a reason for this attribution correction.')
      return
    }
    if (cleanReason.length > 500) {
      setError('Keep the correction reason to 500 characters or fewer.')
      return
    }
    const cleanWaiverReason = commissionWaiverReason.trim()
    if (commercialTreatment !== 'standard' && cleanWaiverReason.length < 3) {
      setError('Enter why this ticket does not use standard commission.')
      return
    }
    if (cleanWaiverReason.length > 500) {
      setError('Keep the commission treatment reason to 500 characters or fewer.')
      return
    }

    const currentAssistantIds = item.assistantEmployees.map((employee) => employee.id).sort()
    const nextAssistantIds = [...assistantEmployeeIds].sort()
    const treatmentChanged =
      commercialTreatment !== item.commercialTreatment ||
      (commercialTreatment === 'standard' ? null : cleanWaiverReason) !==
        item.commissionWaiverReason
    if (
      responsibleEmployeeId === item.responsibleEmployee.id &&
      currentAssistantIds.join('|') === nextAssistantIds.join('|') &&
      !treatmentChanged
    ) {
      setError('Change the staff attribution or commission treatment before saving.')
      return
    }

    setIsSaving(true)
    setError('')
    try {
      await correctTicketAttribution(
        item.bookingId,
        {
          expectedBookingVersion: item.bookingVersion,
          responsibleEmployeeId,
          assistantEmployeeIds,
          commercialTreatment,
          commissionWaiverReason: commercialTreatment === 'standard' ? null : cleanWaiverReason,
          reason: cleanReason,
        },
        idempotencyKey.current,
      )
      await onSaved()
      toast.success(`Staff and commission treatment corrected for ${item.pnr}`)
      onClose()
    } catch (caught) {
      if (caught instanceof TicketLedgerApiError && caught.code === 'VERSION_CONFLICT') {
        try {
          await onSaved()
          toast.error('This ticket changed. Reopen it from the refreshed ledger and review again.')
          onClose()
        } catch {
          setError('This ticket changed. Close this window, refresh the ledger, and review again.')
          toast.error('This ticket changed and the ledger could not be refreshed.')
        }
      } else {
        const message =
          caught instanceof TicketLedgerApiError
            ? caught.message
            : 'Unable to correct this ticket attribution right now.'
        setError(message)
        toast.error(message)
      }
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <ModalBase
      isOpen
      onClose={onClose}
      title="Correct staff attribution"
      description="Update the responsible staff, independent assistance, and commission treatment together."
      isLoading={isSaving}
      size="md"
      className="overflow-hidden rounded-2xl"
    >
      <form noValidate onSubmit={(event) => void submit(event)} className="space-y-4">
        <div className="rounded-xl border border-sky-200 bg-sky-50 p-3">
          <p className="inline-flex items-center gap-2 text-sm font-black text-sky-950">
            <ArrowRightLeft className="h-4 w-4" aria-hidden="true" />
            {item.pnr} · {item.customerName}
          </p>
          <p className="mt-1 text-xs font-semibold text-sky-800">
            Current responsible agent: {item.responsibleEmployee.fullName}
          </p>
        </div>

        <label className="text-xs font-bold text-slate-700">
          Responsible agent
          <select
            autoFocus
            value={responsibleEmployeeId}
            onChange={(event) =>
              updateDraft(() => {
                const nextId = event.target.value
                setResponsibleEmployeeId(nextId)
                setAssistantEmployeeIds((current) => current.filter((id) => id !== nextId))
              })
            }
            disabled={isSaving}
            aria-label="Correct responsible agent"
            className={fieldClass(false)}
          >
            {employees.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.fullName}
              </option>
            ))}
          </select>
          <span className="mt-1 block text-[11px] font-medium text-slate-500">
            Issued passenger tickets count toward this agent&apos;s targets.
          </span>
        </label>

        <div className="text-xs font-bold text-slate-700">
          <label htmlFor="ticket-correction-add-assistant">Assisted by (optional)</label>
          <select
            id="ticket-correction-add-assistant"
            value=""
            onChange={(event) => {
              const employeeId = event.target.value
              if (!employeeId) return
              updateDraft(() =>
                setAssistantEmployeeIds((current) =>
                  current.includes(employeeId) ? current : [...current, employeeId].slice(0, 10),
                ),
              )
            }}
            disabled={isSaving || assistantEmployeeIds.length >= 10}
            aria-label="Add correction assistant"
            className={fieldClass(false)}
          >
            <option value="">
              {assistantEmployeeIds.length >= 10
                ? 'Maximum 10 assistants reached'
                : 'Add an assistant…'}
            </option>
            {employees
              .filter(
                (employee) =>
                  employee.id !== responsibleEmployeeId &&
                  !assistantEmployeeIds.includes(employee.id),
              )
              .map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.fullName}
                </option>
              ))}
          </select>
          <span className="mt-1 block text-[11px] font-medium text-slate-500">
            Assistance is recorded independently and never counts toward ticket targets.
          </span>
          {selectedAssistants.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2" aria-label="Correction assistants">
              {selectedAssistants.map((employee) => (
                <span
                  key={employee.id}
                  className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2.5 py-1 text-[11px] font-bold text-sky-900 ring-1 ring-sky-200"
                >
                  <UserRoundCheck className="h-3.5 w-3.5" aria-hidden="true" />
                  {employee.fullName}
                  <button
                    type="button"
                    onClick={() =>
                      updateDraft(() =>
                        setAssistantEmployeeIds((current) =>
                          current.filter((id) => id !== employee.id),
                        ),
                      )
                    }
                    disabled={isSaving}
                    aria-label={`Remove ${employee.fullName} from correction assistants`}
                    className="ui-focus ml-0.5 rounded-full text-sky-700 hover:text-red-700 disabled:opacity-50"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        <fieldset className="rounded-xl border border-amber-200 bg-amber-50/60 p-3">
          <legend className="px-1 text-xs font-black uppercase tracking-[0.12em] text-amber-900">
            Commission treatment
          </legend>
          <label className="text-xs font-bold text-slate-700">
            Booking treatment
            <select
              value={commercialTreatment}
              onChange={(event) => {
                const treatment = event.target.value as TicketCommercialTreatment
                updateDraft(() => {
                  setCommercialTreatment(treatment)
                  if (treatment === 'standard') setCommissionWaiverReason('')
                })
              }}
              disabled={isSaving}
              aria-label="Correct commission treatment"
              className={fieldClass(false)}
            >
              <option value="standard">Standard commission</option>
              <option value="staff_family">Staff/family — no ordinary commission</option>
              <option value="commission_waived">Other no-commission booking</option>
            </select>
          </label>
          {commercialTreatment !== 'standard' && (
            <label className="mt-3 block text-xs font-bold text-slate-700">
              {commercialTreatment === 'staff_family' ? 'Relationship / reason' : 'Waiver reason'}
              <textarea
                value={commissionWaiverReason}
                onChange={(event) =>
                  updateDraft(() => setCommissionWaiverReason(event.target.value))
                }
                maxLength={500}
                rows={2}
                disabled={isSaving}
                aria-label="Correct commission waiver reason"
                className={fieldClass(false)}
                placeholder={
                  commercialTreatment === 'staff_family'
                    ? 'For example: father — staff family concession'
                    : 'Explain why ordinary commission does not apply'
                }
              />
            </label>
          )}
          <p className="mt-2 text-[11px] font-medium leading-4 text-amber-800">
            Changing this setting corrects the Commission source facts for this booking.
          </p>
        </fieldset>

        <label className="text-xs font-bold text-slate-700">
          Correction reason
          <textarea
            value={reason}
            onChange={(event) => updateDraft(() => setReason(event.target.value))}
            maxLength={500}
            rows={3}
            disabled={isSaving}
            aria-label="Attribution correction reason"
            aria-invalid={Boolean(error)}
            aria-describedby={error ? 'ticket-attribution-correction-error' : undefined}
            className={fieldClass(Boolean(error))}
            placeholder="Explain why the attribution is being corrected"
          />
        </label>

        {error && (
          <p
            id="ticket-attribution-correction-error"
            role="alert"
            className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-800 ring-1 ring-red-200"
          >
            {error}
          </p>
        )}

        <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="ui-tap ui-focus inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Keep current
          </button>
          <button
            type="submit"
            disabled={isSaving}
            className="ui-tap ui-focus inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#8b1e2d] px-5 text-sm font-black text-white hover:bg-[#6f1422] disabled:opacity-50"
          >
            <Save className="h-4 w-4" aria-hidden="true" />
            {isSaving ? 'Saving…' : 'Save correction'}
          </button>
        </div>
      </form>
    </ModalBase>
  )
}
