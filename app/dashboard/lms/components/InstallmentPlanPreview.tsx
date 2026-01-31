import type { InstallmentPayment } from '../types'

interface InstallmentPlanPreviewProps {
  installmentPlan: InstallmentPayment[]
  planExpanded: boolean
  onToggle: () => void
  onUpdateInstallmentDate: (index: number, value: string) => void
}

export function InstallmentPlanPreview({
  installmentPlan,
  planExpanded,
  onToggle,
  onUpdateInstallmentDate
}: InstallmentPlanPreviewProps) {
  if (installmentPlan.length === 0) return null

  return (
    <div className="border rounded-lg">
      <button
        type="button"
        onClick={onToggle}
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
                      type="text"
                      placeholder="DD/MM/YYYY"
                      value={installment.dueDate}
                      onChange={e => onUpdateInstallmentDate(idx, e.target.value)}
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
  )
}
