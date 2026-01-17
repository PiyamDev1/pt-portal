'use client'
import { X, Clock, FileText, User } from 'lucide-react'

interface HistoryModalProps {
  isOpen: boolean
  onClose: () => void
  data: any[]
  isLoading: boolean
  title: string
}

export default function HistoryModal({ isOpen, onClose, data, isLoading, title }: HistoryModalProps) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[80vh]">
        
        {/* Header */}
        <div className="bg-slate-50 px-6 py-4 border-b border-slate-100 flex justify-between items-center">
          <div>
            <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
              <Clock className="w-5 h-5 text-blue-600" />
              Tracking History
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">{title}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {isLoading ? (
            <div className="text-center py-8 text-slate-400">Loading history...</div>
          ) : data.length === 0 ? (
            <div className="text-center py-8 text-slate-400 flex flex-col items-center gap-2">
                <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center">
                    <Clock className="w-6 h-6 text-slate-300" />
                </div>
                <p>No history records found.</p>
            </div>
          ) : (
            <div className="relative border-l-2 border-slate-100 ml-3 space-y-8">
              {data.map((log: any) => (
                <div key={log.id} className="relative pl-8">
                  {/* Timeline Dot */}
                  <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full border-2 border-white ring-2 ring-blue-100 bg-blue-600" />
                  
                  {/* Content Card */}
                  <div className="bg-slate-50 rounded-lg p-4 border border-slate-100 shadow-sm">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Status Change</span>
                        <div className="font-bold text-slate-800 text-sm mt-0.5">
                          {log.old_status || 'New'} <span className="text-slate-300 mx-1">→</span> <span className="text-blue-600">{log.new_status}</span>
                        </div>
                      </div>
                      <div className="text-[10px] font-mono text-slate-400 bg-white px-2 py-1 rounded border border-slate-100">
                        {new Date(log.changed_at).toLocaleString()}
                      </div>
                    </div>

                    {/* Notes Section */}
                    {log.notes && (
                      <div className="mt-3 pt-3 border-t border-slate-200/50">
                        <div className="flex gap-2">
                            <FileText className="w-3 h-3 text-slate-400 mt-0.5 shrink-0" />
                            <p className="text-xs text-slate-600 leading-relaxed italic">&ldquo;{log.notes}&rdquo;</p>
                        </div>
                      </div>
                    )}

                    {/* User Info */}
                    <div className="mt-3 flex items-center gap-2 text-[10px] text-slate-400">
                      <User className="w-3 h-3" />
                      <span>Updated by: {log.employees?.full_name || 'System'}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
