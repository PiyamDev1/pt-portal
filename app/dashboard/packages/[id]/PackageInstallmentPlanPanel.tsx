'use client'

import type { Dispatch, SetStateAction } from 'react'
import { ReceiptText } from 'lucide-react'
import type { TravelPackagePaymentPlan } from '@/app/types/packages'
import { formatMoney } from '@/lib/packageQuote'
import { dateInput, label } from './packageOperationsModel'

export type PackageInstallmentPlanForm = {
  totalAmount: string
  depositAmount: string
  installmentCount: string
  frequency: 'weekly' | 'fortnightly' | 'monthly'
  startsOn: string
  lmsPlanId: string
  internalNotes: string
}

type PackageInstallmentPlanPanelProps = {
  paymentPlan: TravelPackagePaymentPlan | null
  planForm: PackageInstallmentPlanForm
  setPlanForm: Dispatch<SetStateAction<PackageInstallmentPlanForm>>
  onCreatePlan: () => void | Promise<void>
}

export function PackageInstallmentPlanPanel({
  paymentPlan,
  planForm,
  setPlanForm,
  onCreatePlan,
}: PackageInstallmentPlanPanelProps) {
  return (
    <div className="border border-slate-200 p-4">
      <div className="flex items-center gap-2">
        <ReceiptText className="h-5 w-5 text-[#8b1e2d]" />
        <h3 className="text-sm font-black">Installment plan</h3>
      </div>
      {paymentPlan ? (
        <div className="mt-3">
          <p className="text-sm font-semibold text-slate-600">
            {label(paymentPlan.frequency)} ·{' '}
            {formatMoney(paymentPlan.total_amount, paymentPlan.currency)} · {paymentPlan.status}
          </p>
          {paymentPlan.lms_plan_id && (
            <p className="mt-1 text-xs font-bold text-slate-500">
              LMS reference: {paymentPlan.lms_plan_id}
            </p>
          )}
          <div className="mt-3 grid gap-2 md:grid-cols-3">
            {paymentPlan.installments?.map((installment) => (
              <div key={installment.id} className="border border-slate-200 p-2 text-xs">
                <div className="flex justify-between">
                  <strong>#{installment.sequence_number}</strong>
                  <span>{dateInput(installment.due_on)}</span>
                </div>
                <p className="mt-1 font-black">
                  {formatMoney(installment.amount, paymentPlan.currency)}
                </p>
                <p className="mt-1 text-slate-500">{label(installment.status)}</p>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault()
            void onCreatePlan()
          }}
          className="mt-3 grid gap-3 md:grid-cols-3"
        >
          <input
            type="number"
            step="0.01"
            placeholder="Plan total"
            value={planForm.totalAmount}
            onChange={(event) =>
              setPlanForm((current) => ({ ...current, totalAmount: event.target.value }))
            }
            className="border border-slate-300 px-3 py-2 text-sm"
            required
          />
          <input
            type="number"
            step="0.01"
            placeholder="Deposit"
            value={planForm.depositAmount}
            onChange={(event) =>
              setPlanForm((current) => ({ ...current, depositAmount: event.target.value }))
            }
            className="border border-slate-300 px-3 py-2 text-sm"
          />
          <input
            type="number"
            min="1"
            max="24"
            placeholder="Installments"
            value={planForm.installmentCount}
            onChange={(event) =>
              setPlanForm((current) => ({ ...current, installmentCount: event.target.value }))
            }
            className="border border-slate-300 px-3 py-2 text-sm"
          />
          <select
            value={planForm.frequency}
            onChange={(event) =>
              setPlanForm((current) => ({
                ...current,
                frequency: event.target.value as PackageInstallmentPlanForm['frequency'],
              }))
            }
            className="border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="weekly">Weekly</option>
            <option value="fortnightly">Fortnightly</option>
            <option value="monthly">Monthly</option>
          </select>
          <input
            type="date"
            value={planForm.startsOn}
            onChange={(event) =>
              setPlanForm((current) => ({ ...current, startsOn: event.target.value }))
            }
            className="border border-slate-300 px-3 py-2 text-sm"
            required
          />
          <input
            value={planForm.lmsPlanId}
            onChange={(event) =>
              setPlanForm((current) => ({ ...current, lmsPlanId: event.target.value }))
            }
            placeholder="LMS plan reference (optional)"
            className="border border-slate-300 px-3 py-2 text-sm"
          />
          <button type="submit" className="bg-slate-900 px-3 py-2 text-xs font-black text-white">
            Create schedule
          </button>
        </form>
      )}
    </div>
  )
}
