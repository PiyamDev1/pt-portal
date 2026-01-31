import { TRANSACTION_TYPES } from '../constants'

interface TransactionTypeSelectorProps {
  value: 'service' | 'payment' | 'fee'
  onChange: (type: 'service' | 'payment' | 'fee') => void
}

export function TransactionTypeSelector({ value, onChange }: TransactionTypeSelectorProps) {
  return (
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
            onClick={() => onChange(type as 'service' | 'payment' | 'fee')}
            className={`p-2 rounded-lg text-xs font-bold transition-all ${
              value === type
                ? `bg-${color}-600 text-white`
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}
