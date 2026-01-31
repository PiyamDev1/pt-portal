'use client'

import type { PaymentMethod } from '../../types'
import { TRANSACTION_TYPES } from '../../constants'

interface InitialTransactionProps {
  type: 'service' | 'payment' | 'fee'
  amount: string
  paymentMethodId: string
  notes: string
  methods: PaymentMethod[]
  onChange: (field: string, value: string) => void
}

export function InitialTransactionSection({
  type,
  amount,
  paymentMethodId,
  notes,
  methods,
  onChange
}: InitialTransactionProps) {
  return (
    <div className="space-y-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
      <h4 className="text-xs font-bold text-blue-700 uppercase">Initial Transaction</h4>

      <div>
        <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">
          Transaction Type
        </label>
        <select
          value={type}
          onChange={e => onChange('type', e.target.value)}
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
            value={amount}
            onChange={e => onChange('amount', e.target.value)}
            className="w-full pl-10 p-3 border rounded-lg text-lg font-bold"
          />
        </div>
      </div>

      {type === TRANSACTION_TYPES.PAYMENT && (
        <div>
          <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">
            Payment Method
          </label>
          <select
            value={paymentMethodId}
            onChange={e => onChange('paymentMethodId', e.target.value)}
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
        value={notes}
        onChange={e => onChange('notes', e.target.value)}
        className="w-full p-3 border rounded-lg"
        rows={2}
      />
    </div>
  )
}
