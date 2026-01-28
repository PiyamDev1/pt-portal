'use client'

import { useState, useEffect, useCallback } from 'react'
import { Calendar, Receipt } from 'lucide-react'
import { toast } from 'sonner'
import { ModalWrapper } from './ModalWrapper'
import { LoadingSpinner } from './Skeletons'
import { Account, PaymentMethod, InstallmentPayment } from '../types'
import { API_ENDPOINTS, TRANSACTION_TYPES, PAYMENT_FREQUENCIES, DATE_OFFSETS } from '../constants'

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
    transactionDate: new Date().toISOString().split('T')[0],
    initialDeposit: '',
    firstPaymentDate: new Date(Date.now() + DATE_OFFSETS.FIRST_PAYMENT_DAYS * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0],
    installmentTerms: '6',
    paymentFrequency: PAYMENT_FREQUENCIES.MONTHLY as 'weekly' | 'biweekly' | 'monthly',
    notes: ''
  })

  const [installmentPlan, setInstallmentPlan] = useState<InstallmentPayment[]>([])
  const [methods, setMethods] = useState<PaymentMethod[]>([])
  const [loading, setLoading] = useState(false)
  const [planExpanded, setPlanExpanded] = useState(true)

  // Temporary: Allow unlimited past dates for re-entering deleted data
  const ALLOW_UNLIMITED_PAST = true // Set to false when done re-entering data

  // Fetch payment methods
  useEffect(() => {
    fetch(API_ENDPOINTS.PAYMENT_METHODS)
      .then(r => r.json())
      .then(d => {
        setMethods(d.methods || [])
      })
      .catch(err => {
        console.error('Error loading payment methods:', err)
        toast.error('Failed to load payment methods')
      })
  }, [])

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
        const firstDate = new Date(form.firstPaymentDate)

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
            dueDate: dueDate.toISOString().split('T')[0],
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
      transactionDate: form.transactionDate
    }

    if (form.type === TRANSACTION_TYPES.SERVICE) {
      payload.action = 'add_service'
      payload.serviceAmount = form.amount
      payload.initialDeposit = form.initialDeposit
      payload.installmentTerms = form.installmentTerms
      payload.installmentPlan = installmentPlan
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
      <form onSubmit={handleSubmit} className="space-y-4 max-h-[80vh] overflow-y-auto">
        {/* Transaction Type Selector */}
        <div>
          <label className="text-xs font-bold text-slate-500 uppercase mb-2 block">
            Transaction Type
          </label>
          <div className="grid grid-cols-3 gap-2">
            {[
              { type: TRANSACTION_TYPES.SERVICE, label: 'Installment Plan', color: 'blue' },
              { type: TRANSACTION_TYPES.PAYMENT, label: 'Payment', color: 'green' },
              { type: TRANSACTION_TYPES.FEE, label: 'Service Fee', color: 'amber' }
            ].map(({ type, label, color }) => (
              <button
                key={type}
                type="button"
                onClick={() => updateForm({ type: type as 'service' | 'payment' | 'fee' })}
                className={`p-2 rounded-lg text-xs font-bold transition-all ${
                  form.type === type
                    ? `bg-${color}-600 text-white`
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Amount Field */}
        <div>
          <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Amount</label>
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
          </label>
          <div className="relative">
            <Calendar className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
            <input
              type="date"
              value={form.transactionDate}
              onChange={e => updateForm({ transactionDate: e.target.value })}
              className="w-full pl-10 p-3 border rounded-lg"
            />
          </div>
        </div>

        {/* Payment Method (for payments only) */}
        {isPayment && (
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">
              Payment Method
            </label>
            <select
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
                  type="number"
                  step="0.01"
                  placeholder="0.00 (optional)"
                  value={form.initialDeposit}
                  onChange={e => updateForm({ initialDeposit: e.target.value })}
                  className="w-full pl-10 p-3 border rounded-lg text-lg font-bold"
                />
              </div>
            </div>

            <div className="space-y-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
              <h4 className="text-xs font-bold text-blue-700 uppercase">Payment Plan</h4>

              <div>
                <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">
                  Payment Frequency
                </label>
                <select
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
                <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">
                  Duration
                </label>
                <select
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
                <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">
                  First Payment Date
                  {ALLOW_UNLIMITED_PAST && <span className="text-orange-500 text-xs font-normal">(Backdated: Unlimited)</span>}
                </label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                  <input
                    type="date"
                    value={form.firstPaymentDate}
                    onChange={e => updateForm({ firstPaymentDate: e.target.value })}
                    className="w-full pl-10 p-3 border rounded-lg"
                    min={ALLOW_UNLIMITED_PAST ? undefined : new Date().toISOString().split('T')[0]}
                  />
                </div>
              </div>
            </div>

            {/* Installment Plan Preview */}
            {installmentPlan.length > 0 && (
              <div className="border rounded-lg">
                <button
                  type="button"
                  onClick={() => setPlanExpanded(!planExpanded)}
                  className="w-full p-3 bg-slate-100 hover:bg-slate-200 font-bold text-slate-700 text-xs uppercase flex items-center justify-between"
                >
                  <span>Payment Schedule ({installmentPlan.length} payments)</span>
                  <span>{planExpanded ? '▼' : '▶'}</span>
                </button>

                {planExpanded && (
                  <div className="p-4 space-y-2 bg-white max-h-[400px] overflow-y-auto">
                    {installmentPlan.map((installment, idx) => {
                      const isFirst = idx === 0
                      const isLast = idx === installmentPlan.length - 1

                      return (
                        <div
                          key={idx}
                          className="bg-white p-3 rounded-lg border-2 border-blue-100 hover:border-blue-300 transition-all shadow-sm"
                        >
                          <div className="flex items-center gap-3">
                            <div
                              className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm ${
                                isFirst
                                  ? 'bg-green-100 text-green-700 border-2 border-green-300'
                                  : isLast
                                    ? 'bg-purple-100 text-purple-700 border-2 border-purple-300'
                                    : 'bg-blue-100 text-blue-700 border-2 border-blue-300'
                              }`}
                            >
                              #{idx + 1}
                            </div>

                            <div className="flex-1">
                              <div className="text-[10px] text-slate-500 uppercase font-bold mb-1">
                                Due Date
                              </div>
                              <input
                                type="date"
                                value={installment.dueDate}
                                onChange={e => updateInstallmentDate(idx, e.target.value)}
                                min={new Date().toISOString().split('T')[0]}
                                className="w-full p-2 text-sm border-2 border-slate-200 rounded-lg hover:border-blue-400 focus:border-blue-500 outline-none"
                              />
                            </div>

                            <div className="text-right">
                              <div className="text-[10px] text-slate-500 uppercase font-bold mb-1">
                                Payment
                              </div>
                              <div className="font-mono text-sm font-bold text-slate-600">
                                £{installment.amount.toFixed(2)}
                              </div>
                            </div>

                            <div className="text-right">
                              <div className="text-[10px] text-slate-500 uppercase font-bold mb-1">
                                Balance After
                              </div>
                              <div className="font-mono text-sm font-bold text-slate-600">
                                £{(installment.runningBalance || 0).toFixed(2)}
                              </div>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
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
        <textarea
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
