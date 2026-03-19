/**
 * Transaction Service Fields
 * Form section for installment-plan-specific inputs such as deposit, terms, and schedule preview.
 *
 * @module app/dashboard/lms/components/TransactionServiceFields
 */

import { Calendar } from 'lucide-react'
import { InstallmentPlanPreview } from './InstallmentPlanPreview'
import { PAYMENT_FREQUENCIES } from '../constants'
import { handleDateInput } from '@/lib/dateFormatter'
import type { InstallmentPayment } from '../types'

type FormShape = {
  initialDeposit: string
  paymentFrequency: 'weekly' | 'biweekly' | 'monthly'
  installmentTerms: string
  firstPaymentDate: string
}

type Option = { value: string; label: string }

type TransactionServiceFieldsProps = {
  form: FormShape
  updateForm: (updates: Partial<FormShape>) => void
  installmentOptions: Option[]
  installmentPlan: InstallmentPayment[]
  planExpanded: boolean
  onTogglePlan: () => void
  onUpdateInstallmentDate: (index: number, date: string) => void
  allowUnlimitedPast: boolean
}

export function TransactionServiceFields({
  form,
  updateForm,
  installmentOptions,
  installmentPlan,
  planExpanded,
  onTogglePlan,
  onUpdateInstallmentDate,
  allowUnlimitedPast,
}: TransactionServiceFieldsProps) {
  return (
    <>
      <div className="space-y-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
        <h4 className="text-xs font-bold text-blue-700 uppercase">Initial Deposit</h4>
        <div className="relative">
          <span className="absolute left-3 top-3 text-lg text-slate-500 font-black">£</span>
          <input
            id="initial-deposit"
            type="number"
            step="0.01"
            placeholder="0.00 (optional)"
            value={form.initialDeposit}
            onChange={(e) => updateForm({ initialDeposit: e.target.value })}
            aria-label="Initial deposit amount"
            className="w-full pl-10 p-3 border rounded-lg text-lg font-bold"
          />
        </div>
      </div>

      <div className="space-y-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
        <h4 className="text-xs font-bold text-blue-700 uppercase">Payment Plan</h4>

        <div>
          <label htmlFor="payment-frequency" className="text-xs font-bold text-slate-500 uppercase mb-1 block">
            Payment Frequency
          </label>
          <select
            id="payment-frequency"
            value={form.paymentFrequency}
            onChange={(e) =>
              updateForm({
                paymentFrequency: e.target.value as 'weekly' | 'biweekly' | 'monthly',
              })
            }
            className="w-full p-3 border rounded-lg bg-white"
          >
            <option value={PAYMENT_FREQUENCIES.WEEKLY}>Weekly</option>
            <option value={PAYMENT_FREQUENCIES.BIWEEKLY}>Bi-weekly</option>
            <option value={PAYMENT_FREQUENCIES.MONTHLY}>Monthly</option>
          </select>
        </div>

        <div>
          <label htmlFor="installment-duration" className="text-xs font-bold text-slate-500 uppercase mb-1 block">
            Duration
          </label>
          <select
            id="installment-duration"
            value={form.installmentTerms}
            onChange={(e) => updateForm({ installmentTerms: e.target.value })}
            className="w-full p-3 border rounded-lg bg-white"
          >
            {installmentOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="first-payment-date" className="text-xs font-bold text-slate-500 uppercase mb-1 block">
            First Payment Date
            {allowUnlimitedPast && <span className="text-orange-500 text-xs font-normal">(Backdated: Unlimited)</span>}
          </label>
          <div className="relative">
            <Calendar className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
            <input
              id="first-payment-date"
              type="text"
              placeholder="DD/MM/YYYY"
              value={form.firstPaymentDate}
              onChange={(e) => updateForm({ firstPaymentDate: handleDateInput(e.target.value) })}
              className="w-full pl-10 p-3 border rounded-lg"
            />
          </div>
        </div>
      </div>

      <InstallmentPlanPreview
        installmentPlan={installmentPlan}
        planExpanded={planExpanded}
        onToggle={onTogglePlan}
        onUpdateInstallmentDate={onUpdateInstallmentDate}
      />
    </>
  )
}
