import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { ModalWrapper } from './ModalWrapper'
import { LoadingSpinner } from './Skeletons'
import { PaymentMethod, CustomerForm } from '../types'
import { API_ENDPOINTS, TRANSACTION_TYPES } from '../constants'

interface NewCustomerModalProps {
  onClose: () => void
  onSave: () => void
  employeeId: string
}

/**
 * New Customer Modal - Create new customer with optional initial transaction
 */
export function NewCustomerModal({ onClose, onSave, employeeId }: NewCustomerModalProps) {
  const [form, setForm] = useState<CustomerForm>({
    firstName: '',
    lastName: '',
    phone: '',
    email: '',
    address: ''
  })
  const [addTransaction, setAddTransaction] = useState(false)
  const [txForm, setTxForm] = useState<{
    amount: string
    type: 'service' | 'payment' | 'fee'
    paymentMethodId: string
    notes: string
  }>({
    amount: '',
    type: 'service',
    paymentMethodId: '',
    notes: ''
  })
  const [methods, setMethods] = useState<PaymentMethod[]>([])
  const [loading, setLoading] = useState(false)

  // Fetch payment methods on mount
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

  // Memoized form update handlers
  const updateForm = useCallback((updates: Partial<CustomerForm>) => {
    setForm(prev => ({ ...prev, ...updates }))
  }, [])

  const updateTxForm = useCallback((updates: Partial<typeof txForm>) => {
    setTxForm(prev => ({ ...prev, ...updates }))
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.firstName || !form.lastName) return toast.error('First and Last name required')
    if (addTransaction && (!txForm.amount || parseFloat(txForm.amount) <= 0)) {
      return toast.error('Valid transaction amount required')
    }

    setLoading(true)
    try {
      const res = await fetch(API_ENDPOINTS.LMS, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create_customer',
          ...form,
          employeeId,
          initialTransaction: addTransaction ? txForm : null
        })
      })
      if (!res.ok) throw new Error('Failed')
      toast.success('Customer created!')
      onSave()
      onClose()
    } catch (err) {
      toast.error('Failed to create customer')
    } finally {
      setLoading(false)
    }
  }

  return (
    <ModalWrapper onClose={onClose} title="New Customer">
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Customer Details */}
        <div>
          <h4 className="text-xs font-bold text-slate-500 uppercase mb-3">Customer Information</h4>
          <div className="grid grid-cols-2 gap-3">
            <input
              placeholder="First Name *"
              value={form.firstName}
              onChange={e => updateForm({ firstName: e.target.value })}
              className="p-3 border rounded-lg"
              required
            />
            <input
              placeholder="Last Name *"
              value={form.lastName}
              onChange={e => updateForm({ lastName: e.target.value })}
              className="p-3 border rounded-lg"
              required
            />
          </div>
          <input
            placeholder="Phone"
            value={form.phone}
            onChange={e => updateForm({ phone: e.target.value })}
            className="w-full p-3 border rounded-lg mt-3"
          />
          <input
            placeholder="Email"
            type="email"
            value={form.email}
            onChange={e => updateForm({ email: e.target.value })}
            className="w-full p-3 border rounded-lg mt-3"
          />
          <input
            placeholder="Address"
            value={form.address}
            onChange={e => updateForm({ address: e.target.value })}
            className="w-full p-3 border rounded-lg mt-3"
          />
        </div>

        {/* Transaction Checkbox */}
        <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-lg">
          <input
            id="add-initial-transaction"
            type="checkbox"
            checked={addTransaction}
            onChange={e => setAddTransaction(e.target.checked)}
            className="w-4 h-4 cursor-pointer"
          />
          <label
            htmlFor="add-initial-transaction"
            className="text-sm font-bold text-slate-700 cursor-pointer"
          >
            Add Initial Transaction
          </label>
        </div>

        {/* Conditional Transaction Section */}
        {addTransaction && (
          <div className="space-y-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
            <h4 className="text-xs font-bold text-blue-700 uppercase">Initial Transaction</h4>

            <div>
              <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">
                Transaction Type
              </label>
              <select
                value={txForm.type}
                onChange={e => {
                  const value = e.target.value as 'service' | 'payment' | 'fee'
                  updateTxForm({ type: value })
                }}
                className="w-full p-3 border rounded-lg bg-white"
              >
                <option value={TRANSACTION_TYPES.SERVICE}>Installment Plan</option>
                <option value={TRANSACTION_TYPES.PAYMENT}>Payment</option>
                <option value={TRANSACTION_TYPES.FEE}>Service Fee</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">
                Amount
              </label>
              <div className="relative">
                <span className="absolute left-3 top-3 text-lg text-slate-500 font-black">£</span>
                <input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={txForm.amount}
                  onChange={e => updateTxForm({ amount: e.target.value })}
                  className="w-full pl-10 p-3 border rounded-lg text-lg font-bold"
                />
              </div>
            </div>

            {txForm.type === TRANSACTION_TYPES.PAYMENT && (
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">
                  Payment Method
                </label>
                <select
                  value={txForm.paymentMethodId}
                  onChange={e => updateTxForm({ paymentMethodId: e.target.value })}
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

            <textarea
              placeholder="Notes (optional)"
              value={txForm.notes}
              onChange={e => updateTxForm({ notes: e.target.value })}
              className="w-full p-3 border rounded-lg"
              rows={2}
            />
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-slate-900 text-white py-3 rounded-lg font-bold hover:bg-black disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
        >
          {loading && <LoadingSpinner size="sm" />}
          {loading ? 'Creating...' : 'Create Customer'}
        </button>
      </form>
    </ModalWrapper>
  )
}
