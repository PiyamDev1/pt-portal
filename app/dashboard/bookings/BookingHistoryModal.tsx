'use client'

import { useEffect, useState } from 'react'

type HistoryLog = {
  id: string
  action_type?: string | null
  email_kind?: string | null
  email_subject?: string | null
  status?: string | null
  created_at: string
  actor_identifier?: string | null
  metadata?: Record<string, unknown> | null
}

export default function BookingHistoryModal({
  bookingId,
  isOpen,
  onClose,
}: {
  bookingId: string | null
  isOpen: boolean
  onClose: () => void
}) {
  const [loading, setLoading] = useState(false)
  const [auditLogs, setAuditLogs] = useState<HistoryLog[]>([])
  const [emailLogs, setEmailLogs] = useState<HistoryLog[]>([])

  useEffect(() => {
    if (!isOpen || !bookingId) return
    let active = true

    const run = async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/bookings/${bookingId}/history`, { cache: 'no-store' })
        const json = await res.json()
        if (!active) return
        setAuditLogs(json.audit_logs || [])
        setEmailLogs(json.email_logs || [])
      } finally {
        if (active) setLoading(false)
      }
    }

    run()
    return () => {
      active = false
    }
  }, [bookingId, isOpen])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4">
      <div className="w-full max-w-4xl max-h-[85vh] overflow-y-auto rounded-[28px] border border-white/70 bg-white p-5 shadow-[0_28px_90px_-36px_rgba(15,23,42,0.5)]">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Appointment History</h2>
            <p className="mt-1 text-sm text-slate-500">Activity timeline and email delivery log</p>
          </div>
          <button onClick={onClose} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 hover:bg-slate-50">
            Close
          </button>
        </div>

        {loading ? (
          <div className="py-10 text-center text-sm text-slate-400">Loading history...</div>
        ) : (
          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <section className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-600">Activity</h3>
              <div className="mt-3 space-y-3">
                {auditLogs.length === 0 ? (
                  <p className="text-sm text-slate-400">No activity logged yet.</p>
                ) : (
                  auditLogs.map((log) => (
                    <div key={log.id} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                      <p className="text-sm font-semibold text-slate-800">{log.action_type || 'updated'}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {new Date(log.created_at).toLocaleString('en-GB')}
                        {log.actor_identifier ? ` · ${log.actor_identifier}` : ''}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-600">Emails</h3>
              <div className="mt-3 space-y-3">
                {emailLogs.length === 0 ? (
                  <p className="text-sm text-slate-400">No emails logged yet.</p>
                ) : (
                  emailLogs.map((log) => (
                    <div key={log.id} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                      <p className="text-sm font-semibold text-slate-800">{log.email_subject || log.email_kind || 'Email event'}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {new Date(log.created_at).toLocaleString('en-GB')}
                        {log.status ? ` · ${log.status}` : ''}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  )
}
