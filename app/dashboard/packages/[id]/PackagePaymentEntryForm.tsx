'use client'

import type { Dispatch, SetStateAction } from 'react'
import { Plus } from 'lucide-react'
import type {
  TravelPackagePaymentMethod,
  TravelPackagePaymentPlan,
  TravelPackagePaymentStatus,
  TravelPackagePaymentType,
} from '@/app/types/packages'
import { formatMoney } from '@/lib/packageQuote'
import { PAYMENT_METHODS, PAYMENT_TYPES } from './packageOperationsModel'

export type PackagePaymentCreateForm = {
  amount: string
  paymentType: TravelPackagePaymentType
  paymentMethod: TravelPackagePaymentMethod
  paymentStatus: TravelPackagePaymentStatus
  dueAt: string
  installmentId: string
  receiptReference: string
  notes: string
}

type PackagePaymentEntryFormProps = {
  paymentForm: PackagePaymentCreateForm
  setPaymentForm: Dispatch<SetStateAction<PackagePaymentCreateForm>>
  paymentPlan: TravelPackagePaymentPlan | null
  familySelectionRequired: boolean
  familySelected: boolean
  saving: boolean
  onRecordPayment: () => void | Promise<void>
}

export function PackagePaymentEntryForm({
  paymentForm,
  setPaymentForm,
  paymentPlan,
  familySelectionRequired,
  familySelected,
  saving,
  onRecordPayment,
}: PackagePaymentEntryFormProps) {
  if (familySelectionRequired && !familySelected) {
    return (
      <p className="border border-dashed border-cyan-300 bg-cyan-50 p-4 text-center text-sm font-bold text-cyan-900">
        Choose a family above to record a payment. The All families view is read-only.
      </p>
    )
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        void onRecordPayment()
      }}
      className="grid gap-3 border border-slate-200 bg-slate-50 p-4 md:grid-cols-3 xl:grid-cols-4"
    >
      <input
        type="number"
        min="0"
        step="0.01"
        placeholder="Amount"
        value={paymentForm.amount}
        onChange={(event) =>
          setPaymentForm((current) => ({ ...current, amount: event.target.value }))
        }
        className="border border-slate-300 px-3 py-2 text-sm"
        required
      />
      {paymentPlan?.installments?.some((installment) => installment.status !== 'paid') ? (
        <select
          value={paymentForm.installmentId}
          onChange={(event) =>
            setPaymentForm((current) => ({ ...current, installmentId: event.target.value }))
          }
          className="border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">No installment link</option>
          {paymentPlan.installments
            ?.filter((installment) => installment.status !== 'paid')
            .map((installment) => (
              <option key={installment.id} value={installment.id}>
                Installment #{installment.sequence_number} · {installment.due_on} ·{' '}
                {formatMoney(installment.amount, paymentPlan.currency)}
              </option>
            ))}
        </select>
      ) : null}
      <select
        value={paymentForm.paymentType}
        onChange={(event) =>
          setPaymentForm((current) => ({
            ...current,
            paymentType: event.target.value as TravelPackagePaymentType,
          }))
        }
        className="border border-slate-300 px-3 py-2 text-sm"
      >
        {PAYMENT_TYPES.map((item) => (
          <option key={item.value} value={item.value}>
            {item.label}
          </option>
        ))}
      </select>
      <select
        value={paymentForm.paymentMethod}
        onChange={(event) =>
          setPaymentForm((current) => ({
            ...current,
            paymentMethod: event.target.value as TravelPackagePaymentMethod,
          }))
        }
        className="border border-slate-300 px-3 py-2 text-sm"
      >
        {PAYMENT_METHODS.map((item) => (
          <option key={item.value} value={item.value}>
            {item.label}
          </option>
        ))}
      </select>
      <select
        value={paymentForm.paymentStatus}
        onChange={(event) =>
          setPaymentForm((current) => ({
            ...current,
            paymentStatus: event.target.value as TravelPackagePaymentStatus,
          }))
        }
        className="border border-slate-300 px-3 py-2 text-sm"
      >
        <option value="completed">Received</option>
        <option value="pending">Requested / pending</option>
        <option value="failed">Failed</option>
      </select>
      <input
        type="datetime-local"
        title="Payment due"
        value={paymentForm.dueAt}
        onChange={(event) =>
          setPaymentForm((current) => ({ ...current, dueAt: event.target.value }))
        }
        className="border border-slate-300 px-3 py-2 text-sm"
      />
      <input
        placeholder={
          paymentForm.paymentType === 'account_credit'
            ? 'Previous package / refund reference'
            : 'Receipt / bank reference'
        }
        required={paymentForm.paymentType === 'account_credit'}
        value={paymentForm.receiptReference}
        onChange={(event) =>
          setPaymentForm((current) => ({ ...current, receiptReference: event.target.value }))
        }
        className="border border-slate-300 px-3 py-2 text-sm"
      />
      <input
        placeholder="Payment note"
        value={paymentForm.notes}
        onChange={(event) =>
          setPaymentForm((current) => ({ ...current, notes: event.target.value }))
        }
        className="border border-slate-300 px-3 py-2 text-sm"
      />
      <button
        type="submit"
        disabled={saving}
        className="inline-flex items-center justify-center gap-2 bg-[#8b1e2d] px-3 py-2 text-xs font-black text-white disabled:opacity-50"
      >
        <Plus className="h-4 w-4" />
        Record payment
      </button>
    </form>
  )
}
