'use client'

import { useState, useEffect } from 'react'
import { ModalWrapper } from './ModalWrapper'
import { toast } from 'sonner'
import { API_ENDPOINTS } from '../constants'

interface Installment {
  id?: string
  date: string
  amount: number
  amountPaid?: number
  status?: string
  installmentNumber?: number
  remaining?: number
  term?: number
  totalTerms?: number
  loanId?: string
}

interface PaymentMethod {
  id: string
  name: string
}

interface InstallmentPaymentModalProps {
  installment: Installment
  accountId: string
  employeeId: string
  onClose: () => void
  onSave: () => void
}

export function InstallmentPaymentModal({
  installment,
  accountId,
  employeeId,
  onClose,
  onSave,
}: InstallmentPaymentModalProps) {
  // Date format conversion utilities
  const formatToDisplayDate = (isoDate: string): string => {
    if (!isoDate) return ''
    const [year, month, day] = isoDate.split('-')
    return `${day}/${month}/${year}`
  }

  const formatToISODate = (displayDate: string): string => {
    if (!displayDate) return ''
    const parts = displayDate.split('/')
    if (parts.length !== 3) return ''
    const [day, month, year] = parts
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
  }

  const todayISO = new Date().toISOString().split('T')[0]
  const [paymentAmount, setPaymentAmount] = useState(installment.amount.toFixed(2))
  const [paymentMethod, setPaymentMethod] = useState('')
  const [paymentDate, setPaymentDate] = useState(formatToDisplayDate(todayISO))
  const [loading, setLoading] = useState(false)
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([])
  const [existingPayments, setExistingPayments] = useState<any[]>([])
  const [editingPaymentId, setEditingPaymentId] = useState<string | null>(null)
  const [editingAmount, setEditingAmount] = useState('')

  // Auto-format date input (DD/MM/YYYY)
  const handleDateInput = (value: string): string => {
    // Remove all non-digit characters
    const digits = value.replace(/\D/g, '')
    
    // Format as DD/MM/YYYY
    if (digits.length <= 2) return digits
    if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`
    return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4, 8)}`
  }

  // Calculate date limits
  // Permanent: Allow up to 7 days old
  // Temporary: Allow unlimited past dates for re-entering deleted data
  const ALLOW_UNLIMITED_PAST = true // Set to false when you want to enforce 7-day limit
  const today = new Date()
  const sevenDaysAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000)
  const minDate = ALLOW_UNLIMITED_PAST ? undefined : sevenDaysAgo.toISOString().split('T')[0]
  const maxDate = today.toISOString().split('T')[0]

  // Validate date format (DD/MM/YYYY)
  const isValidDateFormat = (dateString: string): boolean => {
    if (!dateString) return false
    // Check if it matches DD/MM/YYYY format
    const dateRegex = /^\d{2}\/\d{2}\/\d{4}$/
    if (!dateRegex.test(dateString)) return false
    
    const parts = dateString.split('/')
    const day = parseInt(parts[0])
    const month = parseInt(parts[1])
    const year = parseInt(parts[2])
    
    // Check if month is valid
    if (month < 1 || month > 12) return false
    
    // Check if day is valid
    if (day < 1 || day > 31) return false
    
    // Check if it's a valid date
    const date = new Date(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`)
    return date instanceof Date && !isNaN(date.getTime())
  }

  useEffect(() => {
    const fetchPaymentMethods = async () => {
      try {
        const res = await fetch(API_ENDPOINTS.PAYMENT_METHODS)
        const data = await res.json()
        setPaymentMethods(data.methods || [])
        if (data.methods?.length > 0) {
          setPaymentMethod(data.methods[0].id)
        }
      } catch (err) {
        console.error('Failed to fetch payment methods:', err)
        toast.error('Failed to load payment methods')
      }
    }
    fetchPaymentMethods()
  }, [])

  const handleDeletePayment = async (paymentId: string) => {
    if (!confirm('Are you sure you want to delete this payment?')) return

    try {
      const res = await fetch(`/api/lms/installment-payment?transactionId=${paymentId}&accountId=${installment.loanId || accountId}`, {
        method: 'DELETE',
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.message || 'Failed to delete payment')
      }

      setExistingPayments(existingPayments.filter(p => p.id !== paymentId))
      toast.success('Payment deleted successfully')
      onSave()
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete payment')
    }
  }

  const amountNum = parseFloat(paymentAmount) || 0
  const difference = amountNum - installment.amount

  const handleSubmit = async () => {
    // Validate date format first
    if (!isValidDateFormat(paymentDate)) {
      toast.error('Invalid Payment Date format. Use DD/MM/YYYY (e.g., 28/01/2026)')
      return
    }

    // Convert display date to ISO format for API
    const isoPaymentDate = formatToISODate(paymentDate)
    if (!isoPaymentDate) {
      toast.error('Invalid Payment Date. Please check the date and try again.')
      return
    }

    if (!paymentAmount || amountNum <= 0) {
      toast.error('Please enter a valid payment amount')
      return
    }

    if (!installment.id) {
      toast.error('Installment ID is missing. Please try again.')
      return
    }

    setLoading(true)
    try {
      const isTempId = installment.id.startsWith('temp__')
      const body: any = {
        installmentId: installment.id,
        employeeId,
        paymentAmount: amountNum,
        paymentMethod,
        paymentDate: isoPaymentDate,
      }

      // For temporary installments, pass loan info
      if (isTempId && installment.loanId) {
        body.loanId = installment.loanId
        // Extract service transaction ID from temp ID format: temp__{serviceId}__{installmentNum}
        const parts = installment.id.split('__')
        if (parts.length >= 2) {
          body.serviceTransactionId = parts[1]
        }
      }

      const res = await fetch('/api/lms/installment-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
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
              <span className="text-slate-600">Installment ID:</span>{' '}
              <span className="font-mono text-xs">{installment.id?.substring(0, 8)}</span>
            </p>
            <p>
              <span className="text-slate-600">Due Date:</span>{' '}
              <span className="font-bold">{new Date(installment.date).toLocaleDateString()}</span>
            </p>
            <p>
              <span className="text-slate-600">Amount:</span>{' '}
              <span className="font-bold">£{installment.amount.toFixed(2)}</span>
            </p>
            {installment.amountPaid && installment.amountPaid > 0 && (
              <p>
                <span className="text-slate-600">Already Paid:</span>{' '}
                <span className="font-bold text-green-600">£{installment.amountPaid.toFixed(2)}</span>
              </p>
            )}
            <p>
              <span className="text-slate-600">Status:</span>{' '}
              <span className="font-bold capitalize">{installment.status || 'pending'}</span>
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
            disabled={loading || paymentMethods.length === 0}
          >
            {paymentMethods.length === 0 ? (
              <option disabled>Loading payment methods...</option>
            ) : (
              paymentMethods.map((method) => (
                <option key={method.id} value={method.id}>
                  {method.name}
                </option>
              ))
            )}
          </select>
        </div>

        {/* Payment Date */}
        <div>
          <label className="block text-sm font-bold text-slate-700 mb-2">
            Payment Date (DD/MM/YYYY)
            {ALLOW_UNLIMITED_PAST && <span className="text-orange-500 text-xs font-normal ml-2">(Backdated: Unlimited)</span>}
            {!ALLOW_UNLIMITED_PAST && <span className="text-slate-500 text-xs font-normal ml-2">(Last 7 days)</span>}
          </label>
          <input
            type="text"
            placeholder="DD/MM/YYYY"
            value={paymentDate}
            onChange={(e) => setPaymentDate(handleDateInput(e.target.value))}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:border-slate-400 focus:ring-2 focus:ring-blue-200"
            disabled={loading}
            maxLength={10}
          />
        </div>

        {/* Existing Payments History */}
        {existingPayments.length > 0 && (
          <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
            <p className="text-xs font-bold text-slate-700 uppercase mb-2">Payment History</p>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {existingPayments.map((payment) => (
                <div key={payment.id} className="flex items-center justify-between bg-white p-2 rounded border border-slate-200">
                  <div className="flex-1">
                    <p className="text-xs font-semibold text-slate-900">
                      £{typeof payment.amount === 'number' ? payment.amount.toFixed(2) : parseFloat(payment.amount).toFixed(2)}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      {new Date(payment.transaction_timestamp).toLocaleDateString()}
                    </p>
                  </div>
                  <button
                    onClick={() => handleDeletePayment(payment.id)}
                    disabled={loading}
                    className="px-2 py-1 text-xs bg-red-100 hover:bg-red-200 text-red-700 rounded transition-colors disabled:opacity-50"
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

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
