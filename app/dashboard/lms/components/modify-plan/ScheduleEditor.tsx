'use client'

interface Installment {
  id: string
  installment_number: number
  due_date: string
  amount: number
  status: string
  amount_paid: number
}

interface ScheduleEditorProps {
  editedInstallments: Installment[]
  onInstallmentChange: (index: number, field: 'due_date' | 'amount', value: string) => void
  onCancel: () => void
  onSave: () => void
  saving: boolean
  transaction: { amount: number }
  totalInstallments: number
}

export function ScheduleEditor({
  editedInstallments,
  onInstallmentChange,
  onCancel,
  onSave,
  saving,
  transaction,
  totalInstallments
}: ScheduleEditorProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-slate-800">Edit Payment Schedule</h3>
        <button
          onClick={onCancel}
          className="text-sm text-slate-500 hover:text-slate-700"
        >
          Cancel
        </button>
      </div>

      <div className="max-h-96 overflow-y-auto space-y-2 border rounded-lg p-3 bg-slate-50">
        {editedInstallments.map((inst, idx) => (
          <div key={inst.id} className="bg-white p-3 rounded border border-slate-200">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-700">
                Installment {inst.installment_number}/{totalInstallments}
              </span>
              <span className={`text-xs px-2 py-0.5 rounded ${
                inst.status === 'paid' ? 'bg-green-100 text-green-700' :
                inst.status === 'skipped' ? 'bg-gray-100 text-gray-600' :
                'bg-blue-100 text-blue-700'
              }`}>
                {inst.status}
              </span>
            </div>
            
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-slate-600 block mb-1">Due Date</label>
                <input
                  type="date"
                  value={inst.due_date}
                  onChange={(e) => onInstallmentChange(idx, 'due_date', e.target.value)}
                  disabled={inst.status === 'paid' || inst.status === 'skipped'}
                  className="w-full px-2 py-1.5 text-sm border rounded disabled:bg-slate-100 disabled:cursor-not-allowed"
                />
              </div>
              <div>
                <label className="text-xs text-slate-600 block mb-1">Amount (£)</label>
                <input
                  type="number"
                  step="0.01"
                  value={inst.status === 'paid' ? inst.amount_paid : inst.status === 'skipped' ? 0 : inst.amount}
                  onChange={(e) => onInstallmentChange(idx, 'amount', e.target.value)}
                  disabled={inst.status === 'paid' || inst.status === 'skipped'}
                  className="w-full px-2 py-1.5 text-sm border rounded disabled:bg-slate-100 disabled:cursor-not-allowed"
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Summary */}
      <div className="bg-blue-50 border border-blue-200 rounded p-3 text-sm">
        <div className="flex justify-between mb-1">
          <span className="text-blue-700">Total Installments:</span>
          <span className="font-semibold text-blue-900">
            £{editedInstallments.reduce((sum, inst) => {
              const displayAmount = inst.status === 'paid' ? inst.amount_paid : inst.status === 'skipped' ? 0 : inst.amount
              return sum + displayAmount
            }, 0).toFixed(2)}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-blue-700">Service Amount:</span>
          <span className="font-semibold text-blue-900">
            £{parseFloat(transaction.amount as any).toFixed(2)}
          </span>
        </div>
      </div>

      <button
        onClick={onSave}
        disabled={saving}
        className="w-full px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white rounded-lg font-medium transition-colors"
      >
        {saving ? 'Saving...' : 'Save Changes'}
      </button>
    </div>
  )
}
