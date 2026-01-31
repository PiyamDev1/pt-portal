'use client'

import { useState, useEffect } from 'react'
import { AlertCircle, Clock, User, ChevronRight } from 'lucide-react'
import { ModalWrapper } from './ModalWrapper'
import { toast } from 'sonner'

interface AuditLog {
  id: string
  user_id: string
  action: string
  entity_type: string
  entity_id: string
  changes: Record<string, any> | null
  created_at: string
  employee: {
    name: string
    email: string
  }
}

interface AuditLogsModalProps {
  accountId: string
  accountName: string
  onClose: () => void
}

const ACTION_COLORS: Record<string, { bg: string; text: string; icon: string }> = {
  CREATE: { bg: 'bg-green-50', text: 'text-green-700', icon: '➕' },
  UPDATE: { bg: 'bg-blue-50', text: 'text-blue-700', icon: '✏️' },
  DELETE: { bg: 'bg-red-50', text: 'text-red-700', icon: '🗑️' },
  PAYMENT: { bg: 'bg-purple-50', text: 'text-purple-700', icon: '💳' },
  SKIP: { bg: 'bg-amber-50', text: 'text-amber-700', icon: '⏭️' },
  MODIFY: { bg: 'bg-indigo-50', text: 'text-indigo-700', icon: '📝' }
}

export function AuditLogsModal({ accountId, accountName, onClose }: AuditLogsModalProps) {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedLog, setExpandedLog] = useState<string | null>(null)

  useEffect(() => {
    const fetchAuditLogs = async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/lms/audit-logs?accountId=${accountId}`)
        const data = await res.json()
        setLogs(data.logs || [])
      } catch (error) {
        console.error('Error fetching audit logs:', error)
        toast.error('Failed to load audit history')
      } finally {
        setLoading(false)
      }
    }

    fetchAuditLogs()
  }, [accountId])

  const formatDate = (isoDate: string) => {
    const date = new Date(isoDate)
    return date.toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
  }

  const getActionDisplay = (action: string) => {
    const colors = ACTION_COLORS[action] || ACTION_COLORS.UPDATE
    return { ...colors, label: action.charAt(0) + action.slice(1).toLowerCase() }
  }

  return (
    <ModalWrapper onClose={onClose} title={`Audit Trail - ${accountName}`}>
      <div role="dialog" aria-modal="true" aria-label={`Audit Trail for ${accountName}`} className="space-y-4">
        {loading ? (
          <div role="status" aria-live="polite" className="flex justify-center py-8">
            <div className="animate-spin h-8 w-8 border-4 border-slate-200 border-t-blue-600 rounded-full"></div>
          </div>
        ) : logs.length === 0 ? (
          <div role="status" aria-live="polite" className="text-center py-8 text-slate-500">
            <Clock className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p>No audit history yet</p>
          </div>
        ) : (
          <div className="space-y-3 max-h-[500px] overflow-y-auto">
            {logs.map((log) => {
              const actionDisplay = getActionDisplay(log.action)
              const hasChanges = log.changes && Object.keys(log.changes).length > 0

              return (
                <div key={log.id} className={`${actionDisplay.bg} rounded-lg border border-current/10 p-4`}>
                  {/* Header */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 flex-1">
                      <span className="text-2xl">{ACTION_COLORS[log.action]?.icon || '📌'}</span>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className={`${actionDisplay.text} font-bold text-sm`}>
                            {actionDisplay.label}
                          </span>
                          <span className="text-xs text-slate-500">{log.entity_type}</span>
                        </div>
                        <div className="flex items-center gap-1 text-xs text-slate-600 mt-1">
                          <User className="w-3 h-3" />
                          <span>{log.employee.name || 'Unknown User'}</span>
                        </div>
                      </div>
                    </div>
                    {hasChanges && (
                      <button
                        type="button"
                        onClick={() => setExpandedLog(expandedLog === log.id ? null : log.id)}
                        aria-label={expandedLog === log.id ? 'Hide changes' : 'Show changes'}
                        aria-expanded={expandedLog === log.id}
                        className="text-slate-400 hover:text-slate-600 transition-colors"
                      >
                        <ChevronRight
                          className={`w-5 h-5 transition-transform ${
                            expandedLog === log.id ? 'rotate-90' : ''
                          }`}
                        />
                      </button>
                    )}
                  </div>

                  {/* Timestamp */}
                  <div className="flex items-center gap-1 text-xs text-slate-600 mt-2 ml-9">
                    <Clock className="w-3 h-3" />
                    <span>{formatDate(log.created_at)}</span>
                  </div>

                  {/* Changes Details */}
                  {hasChanges && expandedLog === log.id && (
                    <div className="mt-3 ml-9 pt-3 border-t border-current/10 space-y-2">
                      {Object.entries(log.changes || {}).map(([key, value]) => {
                        const oldValue = Array.isArray(value) ? value[0] : value
                        const newValue = Array.isArray(value) ? value[1] : null

                        return (
                          <div key={key} className="text-xs space-y-1">
                            <div className="font-medium text-slate-700">
                              {key.replace(/_/g, ' ').charAt(0).toUpperCase() + key.replace(/_/g, ' ').slice(1)}
                            </div>
                            {newValue ? (
                              <div className="grid grid-cols-2 gap-2">
                                <div className="bg-white/50 p-2 rounded border border-current/5">
                                  <div className="text-xs text-slate-500 mb-1">From:</div>
                                  <div className="font-mono text-xs break-all">{String(oldValue)}</div>
                                </div>
                                <div className="bg-white/50 p-2 rounded border border-current/5">
                                  <div className="text-xs text-slate-500 mb-1">To:</div>
                                  <div className="font-mono text-xs break-all">{String(newValue)}</div>
                                </div>
                              </div>
                            ) : (
                              <div className="bg-white/50 p-2 rounded border border-current/5">
                                <div className="font-mono text-xs break-all">{String(oldValue)}</div>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Info Box */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex gap-2 text-xs text-blue-700">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <p>All changes to this account are tracked and displayed here for compliance and audit purposes.</p>
        </div>
      </div>
    </ModalWrapper>
  )
}
