'use client'

import { useState, useEffect, useCallback } from 'react'
import { Calendar, Receipt } from 'lucide-react'
import { toast } from 'sonner'
import { ModalWrapper } from './ModalWrapper'
import { LoadingSpinner } from './Skeletons'
import { Account, InstallmentPayment } from '../types'
import { API_ENDPOINTS, TRANSACTION_TYPES, PAYMENT_FREQUENCIES, DATE_OFFSETS } from '../constants'
import { formatToDisplayDate, formatToISODate, handleDateInput, isValidDateFormat } from '@/app/lib/dateFormatter'
import { usePaymentMethods } from '../hooks'
import { TransactionTypeSelector } from './TransactionTypeSelector'
import { InstallmentPlanPreview } from './InstallmentPlanPreview'

interface TransactionModalProps {
  data: Account & { transactionType?: string }
  onClose: () => void
  onSave: () => void
  employeeId: string
  onPaymentRecorded?: () => void
}

/**
 * Transaction Modal - Record payments, installment plans, and service fees
 */
export function TransactionModal({
  data,
  onClose,
  onSave,
  employeeId,
  onPaymentRecorded
}: TransactionModalProps) {

  const getInstallmentOptions = useCallback((frequency: string) => {
    if (frequency === PAYMENT_FREQUENCIES.WEEKLY) {
      return Array.from({ length: 10 }, (_, i) => {
        const weeks = i + 3
        return {
          value: weeks.toString(),
          label: `${weeks} week${weeks === 1 ? '' : 's'}`
        }
      })
    }
    if (frequency === PAYMENT_FREQUENCIES.BIWEEKLY) {
      return [2, 4, 6, 8, 10, 12].map(weeks => ({
        value: weeks.toString(),
        label: `${weeks} weeks (bi-weekly)`
      }))
    }
    return [1, 2, 3, 4, 5, 6].map(months => ({
      value: months.toString(),
      label: `${months} month${months === 1 ? '' : 's'}`
    }))
  }, [])

  const [form, setForm] = useState({
    type: (data.transactionType || TRANSACTION_TYPES.SERVICE) as 'service' | 'payment' | 'fee',
    amount: '',
    paymentMethodId: '',
    transactionDate: formatToDisplayDate(new Date().toISOString().split('T')[0]),
    initialDeposit: '',
    firstPaymentDate: formatToDisplayDate(new Date(Date.now() + DATE_OFFSETS.FIRST_PAYMENT_DAYS * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0]),
    installmentTerms: '6',
    paymentFrequency: PAYMENT_FREQUENCIES.MONTHLY as 'weekly' | 'biweekly' | 'monthly',
    notes: ''
  })

  const [installmentPlan, setInstallmentPlan] = useState<InstallmentPayment[]>([])
  const { methods } = usePaymentMethods()
  const [loading, setLoading] = useState(false)
  const [planExpanded, setPlanExpanded] = useState(true)

  // Temporary: Allow unlimited past dates for re-entering deleted data
  const ALLOW_UNLIMITED_PAST = true // Set to false when done re-entering data

  // Reset dates to today when modal opens
  useEffect(() => {
    const today = formatToDisplayDate(new Date().toISOString().split('T')[0])
    const firstPaymentDefault = formatToDisplayDate(
      new Date(Date.now() + DATE_OFFSETS.FIRST_PAYMENT_DAYS * 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0]
    )
    setForm(prev => ({
      ...prev,
      transactionDate: today,
      firstPaymentDate: firstPaymentDefault
    }))
  }, []) // Empty dependency array means this runs once when component mounts

  // Clamp installment terms when frequency changes
  useEffect(() => {
    setForm(prev => {
      const options = getInstallmentOptions(prev.paymentFrequency)
      if (options.some(opt => opt.value === prev.installmentTerms)) return prev
      return { ...prev, installmentTerms: options[options.length - 1].value }
    })
  }, [form.paymentFrequency, getInstallmentOptions])

  // Auto-generate installment plan
  useEffect(() => {
    if (form.type === TRANSACTION_TYPES.SERVICE && form.amount && form.installmentTerms) {
      const totalAmount = parseFloat(form.amount)
      const deposit = parseFloat(form.initialDeposit) || 0
      const remainingAmount = totalAmount - deposit
      const termCount = parseInt(form.installmentTerms)
      const numInstallments =
        form.paymentFrequency === PAYMENT_FREQUENCIES.BIWEEKLY
          ? Math.ceil(termCount / 2)
          : termCount

      if (remainingAmount > 0 && numInstallments > 0) {
        const installmentAmount = remainingAmount / numInstallments
        // Convert DD/MM/YYYY to ISO format for Date parsing
        const isoFirstPaymentDate = formatToISODate(form.firstPaymentDate)
        if (!isoFirstPaymentDate) {
          setInstallmentPlan([])
          return
        }
        const firstDate = new Date(isoFirstPaymentDate)
        // Validate the date is valid before proceeding
        if (isNaN(firstDate.getTime())) {
          setInstallmentPlan([])
          return
        }

        const plan = Array.from({ length: numInstallments }, (_, i) => {
          const dueDate = new Date(firstDate)

          if (form.paymentFrequency === PAYMENT_FREQUENCIES.WEEKLY) {
            dueDate.setDate(dueDate.getDate() + i * 7)
          } else if (form.paymentFrequency === PAYMENT_FREQUENCIES.BIWEEKLY) {
            dueDate.setDate(dueDate.getDate() + i * 14)
          } else {
            dueDate.setMonth(dueDate.getMonth() + i)
          }

          const runningBalance = remainingAmount - installmentAmount * (i + 1)

          return {
            id: i + 1,
            dueDate: formatToDisplayDate(dueDate.toISOString().split('T')[0]),
            amount: installmentAmount,
            runningBalance: Math.max(0, runningBalance),
            status: 'Pending'
          }
        })

        setInstallmentPlan(plan)
      } else {
        setInstallmentPlan([])
      }
    }
  }, [
    form.amount,
    form.initialDeposit,
    form.installmentTerms,
    form.firstPaymentDate,
    form.paymentFrequency,
    form.type
  ])

  const updateInstallmentDate = useCallback((index: number, newDate: string) => {
    const updated = [...installmentPlan]
    const selectedDate = new Date(newDate)
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    if (selectedDate < today) {
      toast.error('Cannot set installment date in the past')
      return
    }

    if (index > 0 && selectedDate <= new Date(updated[index - 1].dueDate)) {
      toast.warning('Installment date should be after previous installment')
    }

    updated[index].dueDate = newDate
    setInstallmentPlan(updated)
  }, [installmentPlan])

  const updateForm = useCallback((updates: Partial<typeof form>) => {
    setForm(prev => ({ ...prev, ...updates }))
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // Validate all dates
    if (!isValidDateFormat(form.transactionDate)) {
      return toast.error('Invalid Transaction Date format. Use DD/MM/YYYY (e.g., 28/01/2026)')
    }
    if (form.type === TRANSACTION_TYPES.SERVICE && !isValidDateFormat(form.firstPaymentDate)) {
      return toast.error('Invalid First Payment Date format. Use DD/MM/YYYY (e.g., 28/01/2026)')
    }
    if (form.type === TRANSACTION_TYPES.SERVICE) {
      for (let i = 0; i < installmentPlan.length; i++) {
        if (!isValidDateFormat(installmentPlan[i].dueDate)) {
          return toast.error(`Invalid due date in installment #${i + 1}. Use DD/MM/YYYY format (e.g., 28/01/2026)`)
        }
      }
    }
    
    if (!form.amount || parseFloat(form.amount) <= 0) return toast.error('Valid amount required')
    if (
      form.type === TRANSACTION_TYPES.PAYMENT &&
      (data.balance || 0) <= 0
    ) {
      return toast.error('No outstanding balance to record a payment')
    }

    const payload: Record<string, unknown> = {
      amount: form.amount,
      customerId: data.id,
      notes: form.notes,
      employeeId,
      transactionDate: formatToISODate(form.transactionDate)
    }

    if (form.type === TRANSACTION_TYPES.SERVICE) {
      payload.action = 'add_service'
      payload.serviceAmount = form.amount
      payload.initialDeposit = form.initialDeposit
      payload.installmentTerms = form.installmentTerms
      // Convert installment plan dates to ISO format
      payload.installmentPlan = installmentPlan.map(ip => ({
        ...ip,
        dueDate: formatToISODate(ip.dueDate)
      }))
      payload.paymentFrequency = form.paymentFrequency
    } else if (form.type === TRANSACTION_TYPES.PAYMENT) {
      payload.action = 'record_payment'
      const activeLoan = (data as { loans?: Array<{ id: string; current_balance: number }> }).loans?.find(
        l => l.current_balance > 0
      )
      if (!activeLoan) return toast.error('No active loan found for this customer')
      payload.loanId = activeLoan.id
      payload.paymentMethodId = form.paymentMethodId
    } else if (form.type === TRANSACTION_TYPES.FEE) {
      payload.action = 'add_fee'
      const activeLoan =
        (data as { loans?: Array<{ id: string; current_balance: number }> }).loans?.find(
          l => l.current_balance > 0
        ) ||
        (data as { loans?: Array<{ id: string }> }).loans?.[0]
      payload.loanId = activeLoan?.id
      payload.customerId = data.id
    }

    setLoading(true)
    try {
      const res = await fetch(API_ENDPOINTS.LMS, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      if (!res.ok) throw new Error('Failed')

      const actionLabel =
        form.type === TRANSACTION_TYPES.SERVICE
          ? 'Installment plan added'
          : form.type === TRANSACTION_TYPES.PAYMENT
            ? 'Payment recorded'
            : 'Service fee added'
      toast.success(actionLabel + '!')
      onSave()
      if (form.type === TRANSACTION_TYPES.PAYMENT && typeof onPaymentRecorded === 'function') {
        try {
          onPaymentRecorded()
        } catch {}
      }
      onClose()
    } catch (err) {
      toast.error('Failed to record transaction')
    } finally {
      setLoading(false)
    }
  }

  const isPayment = form.type === TRANSACTION_TYPES.PAYMENT
  const isService = form.type === TRANSACTION_TYPES.SERVICE
  const isFee = form.type === TRANSACTION_TYPES.FEE
  const installmentOptions = getInstallmentOptions(form.paymentFrequency)
  const totalAmount = parseFloat(form.amount) || 0
  const deposit = parseFloat(form.initialDeposit) || 0
  const remainingAmount = totalAmount - deposit

  return (
    <ModalWrapper
      onClose={onClose}
      title={`Record ${
        form.type === TRANSACTION_TYPES.SERVICE
          ? 'Installment Plan'
          : form.type === TRANSACTION_TYPES.PAYMENT
            ? 'Payment'
            : 'Service Fee'
      } - ${data.name}`}
    >
      <form onSubmit={handleSubmit} role="dialog" aria-modal="true" aria-label={`Record transaction for ${data.name}`} className="space-y-4 max-h-[80vh] overflow-y-auto">
        <TransactionTypeSelector
          value={form.type}
          onChange={(type) => updateForm({ type })}
        />

        {/* Amount Field */}
        <div>
          <label htmlFor="transaction-amount" className="text-xs font-bold text-slate-500 uppercase mb-1 block">Amount</label>
          <div className="relative">
            <span className="absolute left-3 top-3 text-lg text-slate-500 font-black">£</span>
            <input
              type="number"
              step="0.01"
              placeholder="0.00"
              value={form.amount}
              onChange={e => updateForm({ amount: e.target.value })}
              className="w-full pl-10 p-3 border rounded-lg text-lg font-bold"
            />
          </div>
        </div>

        {/* Transaction Date */}
        <div>
          <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">
            Transaction Date
            {ALLOW_UNLIMITED_PAST && <span className="text-orange-500 text-xs font-normal">(Backdated: Unlimited)</span>}
          </label>
          <div className="relative">
            <Calendar className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="DD/MM/YYYY"
              value={form.transactionDate}
              onChange={e => updateForm({ transactionDate: handleDateInput(e.target.value) })}
              className="w-full pl-10 p-3 border rounded-lg"
            />
          </div>
        </div>

        {/* Payment Method (for payments only) */}
        {isPayment && (
          <div>
            <label htmlFor="payment-method" className="text-xs font-bold text-slate-500 uppercase mb-1 block">
              Payment Method
            </label>
            <select
              id="payment-method"
              value={form.paymentMethodId}
              onChange={e => updateForm({ paymentMethodId: e.target.value })}
              className="w-full p-3 border rounded-lg bg-white"
            >
              <option value="">Select method...</option>
              {methods.map(m => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Service Details (for service plans) */}
        {isService && (
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
                  onChange={e => updateForm({ initialDeposit: e.target.value })}
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
                  onChange={e =>
                    updateForm({
                      paymentFrequency: e.target.value as 'weekly' | 'biweekly' | 'monthly'
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
                  onChange={e => updateForm({ installmentTerms: e.target.value })}
                  className="w-full p-3 border rounded-lg bg-white"
                >
                  {installmentOptions.map(opt => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="first-payment-date" className="text-xs font-bold text-slate-500 uppercase mb-1 block">
                  First Payment Date
                  {ALLOW_UNLIMITED_PAST && <span className="text-orange-500 text-xs font-normal">(Backdated: Unlimited)</span>}
                </label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                  <input
                    id="first-payment-date"
                    type="text"
                    placeholder="DD/MM/YYYY"
                    value={form.firstPaymentDate}
                    onChange={e => updateForm({ firstPaymentDate: handleDateInput(e.target.value) })}
                    className="w-full pl-10 p-3 border rounded-lg"
                  />
                </div>
              </div>
            </div>

            <InstallmentPlanPreview
              installmentPlan={installmentPlan}
              planExpanded={planExpanded}
              onToggle={() => setPlanExpanded(!planExpanded)}
              onUpdateInstallmentDate={updateInstallmentDate}
            />
          </>
        )}

        {/* Summary */}
        {(isService || isPayment || isFee) && (
          <div className="bg-slate-50 p-3 rounded-lg space-y-1">
            {isService && (
              <>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Total Amount:</span>
                  <span className="font-bold">£{totalAmount.toFixed(2)}</span>
                </div>
                {deposit > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-600">Initial Deposit:</span>
                    <span className="font-bold">£{deposit.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm border-t border-slate-200 pt-1 mt-1">
                  <span className="text-slate-600">Remaining Amount:</span>
                  <span className="font-bold">£{remainingAmount.toFixed(2)}</span>
                </div>
              </>
            )}
          </div>
        )}

        {/* Notes */}
        <label htmlFor="transaction-notes" className="sr-only">Additional notes</label>
        <textarea
          id="transaction-notes"
          placeholder="Additional notes..."
          value={form.notes}
          onChange={e => updateForm({ notes: e.target.value })}
          className="w-full p-3 border rounded-lg text-sm"
          rows={2}
        />

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-slate-900 text-white py-3 rounded-lg font-bold hover:bg-black disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
        >
          {loading ? <LoadingSpinner size="sm" /> : <Receipt className="w-4 h-4" />}
          {loading ? 'Recording...' : 'Record Transaction'}
        </button>
      </form>
    </ModalWrapper>
  )
}
