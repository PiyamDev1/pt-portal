'use client'

import { useState } from 'react'
import { ModalWrapper } from './ModalWrapper'
import { toast } from 'sonner'

interface Installment {
  date: string
  amount: number
  remaining: number
  term: number
  totalTerms: number
  loanId?: string
}

interface InstallmentPaymentModalProps {
  installment: Installment
  accountId: string
  onClose: () => void
  onSave: () => void
}

export function InstallmentPaymentModal({
  installment,
  accountId,
  onClose,
  onSave,
}: InstallmentPaymentModalProps) {
  const [paymentAmount, setPaymentAmount] = useState(installment.amount.toFixed(2))
  const [paymentMethod, setPaymentMethod] = useState('bank_transfer')
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0])
  const [loading, setLoading] = useState(false)

  const amountNum = parseFloat(paymentAmount) || 0
  const difference = amountNum - installment.amount

  const handleSubmit = async () => {
    if (!paymentAmount || amountNum <= 0) {
      toast.error('Please enter a valid payment amount')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/lms/installment-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId,
          installmentDate: new Date(installment.date).toISOString(),
          paymentAmount: amountNum,
          paymentMethod,
          paymentDate,
          installmentTerm: installment.term,
          totalTerms: installment.totalTerms,
        }),
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.message || 'Failed to record payment')
      }

      toast.success(`Payment of £${amountNum.toFixed(2)} recorded successfully`)
      onSave()
      onClose()
    } catch (err: any) {
      toast.error(err.message || 'Failed to record payment')
    } finally {
      setLoading(false)
    }
  }

  return (
    <ModalWrapper onClose={onClose} title="Record Installment Payment">
      <div className="space-y-4">
        {/* Installment Info */}
        <div className="bg-blue-50 p-3 rounded-lg border border-blue-200">
          <p className="text-xs font-bold text-blue-900 uppercase">Installment Details</p>
          <div className="mt-2 space-y-1 text-sm">
            <p>
              <span className="text-slate-600">Due Date:</span>{' '}
              <span className="font-bold">{new Date(installment.date).toLocaleDateString()}</span>
            </p>
            <p>
              <span className="text-slate-600">Original Amount:</span>{' '}
              <span className="font-bold">£{installment.amount.toFixed(2)}</span>
            </p>
            <p>
              <span className="text-slate-600">Term:</span>{' '}
              <span className="font-bold">
                {installment.term}/{installment.totalTerms}
              </span>
            </p>
          </div>
        </div>

        {/* Payment Amount */}
        <div>
          <label className="block text-sm font-bold text-slate-700 mb-2">Payment Amount (£)</label>
          <input
            type="number"
            value={paymentAmount}
            onChange={(e) => setPaymentAmount(e.target.value)}
            step="0.01"
            min="0"
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:border-slate-400"
            disabled={loading}
          />
          {difference !== 0 && (
            <p className={`mt-1 text-xs font-semibold ${difference > 0 ? 'text-green-600' : 'text-amber-600'}`}>
              {difference > 0
                ? `Overpayment of £${difference.toFixed(2)} will be split across remaining installments`
                : `Underpayment of £${Math.abs(difference).toFixed(2)} - this installment will be reduced`}
            </p>
          )}
        </div>

        {/* Payment Method */}
        <div>
          <label className="block text-sm font-bold text-slate-700 mb-2">Payment Method</label>
          <select
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:border-slate-400"
            disabled={loading}
          >
            <option value="bank_transfer">Bank Transfer</option>
            <option value="cash">Cash</option>
            <option value="card">Card</option>
            <option value="cheque">Cheque</option>
            <option value="other">Other</option>
          </select>
        </div>

        {/* Payment Date */}
        <div>
          <label className="block text-sm font-bold text-slate-700 mb-2">Payment Date</label>
          <input
            type="date"
            value={paymentDate}
            onChange={(e) => setPaymentDate(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:border-slate-400"
            disabled={loading}
          />
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-4 border-t">
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-slate-400 text-white font-bold rounded-lg transition-colors text-sm"
          >
            {loading ? 'Processing...' : 'Record Payment'}
          </button>
          <button
            onClick={onClose}
            disabled={loading}
            className="flex-1 px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-900 font-bold rounded-lg transition-colors text-sm"
          >
            Cancel
          </button>
        </div>
      </div>
    </ModalWrapper>
  )
}
