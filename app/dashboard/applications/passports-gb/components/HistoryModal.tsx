'use client'

import React from 'react'
import { X } from 'lucide-react'

export default function HistoryModal({
  isOpen,
  onClose,
  pexNumber,
  statusHistory
}: any) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in">
      <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <div>
            <h3 className="font-bold text-lg text-slate-800">Status History</h3>
            <p className="text-xs text-slate-500 mt-1">
              PEX: <span className="font-mono font-bold text-slate-700">{pexNumber}</span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          {!statusHistory || statusHistory.length === 0 ? (
            <p className="text-center text-slate-400 py-8">No status updates recorded yet.</p>
          ) : (
            <div className="relative">
              <div className="absolute left-6 top-3 bottom-3 w-0.5 bg-slate-200"></div>

              <div className="space-y-6">
                {statusHistory.map((entry: any, idx: number) => (
                  <div key={entry.id || idx} className="relative pl-16">
                    <div
                      className={`absolute left-4 top-1 w-5 h-5 rounded-full border-4 border-white shadow-md ${
                        idx === 0 ? 'bg-green-500' : 'bg-slate-900'
                      }`}
                    ></div>

                    <div className="bg-slate-50 rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <div className="font-bold text-lg text-slate-800">
                            {entry.new_status}
                          </div>
                          {entry.old_status && (
                            <div className="text-xs text-slate-600 mt-1">
                              Previously: {entry.old_status}
                            </div>
                          )}
                          {entry.notes && (
                            <div className="text-sm text-slate-600 mt-2 italic">
                              {entry.notes}
                            </div>
                          )}
                        </div>
                        {idx === 0 && (
                          <span className="bg-green-100 text-green-700 text-xs font-bold px-2 py-1 rounded-full">
                            Current
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-slate-500">
                        {entry.changed_by && (
                          <span className="flex items-center gap-1">
                            <span>👤</span>
                            <span className="font-medium text-slate-700">
                              {entry.changed_by}
                            </span>
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <span>🕒</span>
                          <span>
                            {entry.created_at
                              ? new Date(entry.created_at).toLocaleString()
                              : 'Unknown time'}
                          </span>
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="p-6 border-t border-slate-100 bg-slate-50">
          <button
            onClick={onClose}
            className="w-full py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-sm font-bold transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
