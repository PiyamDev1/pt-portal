interface HistoryModalProps {
  isOpen: boolean
  selectedHistory: any
  historyLogs: any[]
  loadingHistory: boolean
  onClose: () => void
}

export default function HistoryModal({
  isOpen,
  selectedHistory,
  historyLogs,
  loadingHistory,
  onClose
}: HistoryModalProps) {
  if (!isOpen || !selectedHistory) return null

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <div>
            <h3 className="font-bold text-slate-800">Status History</h3>
            <p className="text-xs text-slate-500 font-mono mt-1">Tracking: {selectedHistory.tracking_number}</p>
          </div>
          <button
            onClick={onClose}
            className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-slate-200 transition text-slate-400"
          >
            ✕
          </button>
        </div>

        <div className="p-6 overflow-y-auto">
          {loadingHistory ? (
            <div className="text-center py-8 text-slate-400 text-sm">Loading history...</div>
          ) : historyLogs.length === 0 ? (
            <div className="text-center py-8 text-slate-400 text-sm italic">No history recorded yet.</div>
          ) : (
            <div className="relative pl-4 border-l-2 border-slate-100 space-y-8 ml-2">
              {historyLogs.map((log, index) => (
                <div key={log.id} className="relative">
                  <div
                    className={`absolute -left-[23px] top-1 h-3 w-3 rounded-full border-2 border-white shadow-sm ${
                      index === 0 ? 'bg-green-500 ring-4 ring-green-50' : 'bg-slate-300'
                    }`}
                  />
                  <div className="flex justify-between items-start">
                    <div>
                      <p className={`text-sm font-bold ${index === 0 ? 'text-slate-800' : 'text-slate-500'}`}>
                        {log.status}
                      </p>
                      <p className="text-[10px] text-slate-400 mt-0.5">by {log.changed_by}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] text-slate-400 font-mono">
                        {new Date(log.date).toLocaleDateString()}
                      </p>
                      <p className="text-[10px] text-slate-300">
                        {new Date(log.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="p-4 bg-slate-50 border-t border-slate-100 text-center">
          <span className="text-[10px] text-slate-400">
            Current Status:{' '}
            <span className="font-bold text-slate-600">
              {Array.isArray(selectedHistory.nadra_services)
                ? selectedHistory.nadra_services[0]?.status
                : selectedHistory.nadra_services?.status}
            </span>
          </span>
        </div>
      </div>
    </div>
  )
}
