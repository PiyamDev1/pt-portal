'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { AlertTriangle, Bug, Camera, Loader2, Send, TerminalSquare, X } from 'lucide-react'
import { toast } from 'sonner'
import { getRecentConsoleEntries, getRecentFailedRequests, startConsoleCapture } from './issue-reporter/consoleCapture'

type Severity = 'low' | 'medium' | 'high' | 'critical'

const severityOptions: Severity[] = ['low', 'medium', 'high', 'critical']

export function IssueReporterWidget() {
  const pathname = usePathname()
  const rootRef = useRef<HTMLDivElement | null>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [notes, setNotes] = useState('')
  const [severity, setSeverity] = useState<Severity>('medium')
  const [includeScreenshot, setIncludeScreenshot] = useState(true)
  const [includeConsoleLog, setIncludeConsoleLog] = useState(true)
  const [includeFailedRequests, setIncludeFailedRequests] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [submittedTicketId, setSubmittedTicketId] = useState<string | null>(null)

  useEffect(() => {
    startConsoleCapture()
  }, [])

  const consoleCount = useMemo(() => getRecentConsoleEntries().length, [isOpen])
  const failedRequestCount = useMemo(() => getRecentFailedRequests().length, [isOpen])

  const captureScreenshot = async () => {
    const { default: html2canvas } = await import('html2canvas')

    const canvas = await html2canvas(document.body, {
      backgroundColor: '#f8fafc',
      logging: false,
      scale: Math.min(window.devicePixelRatio || 1, 1.5),
      useCORS: true,
      x: window.scrollX,
      y: window.scrollY,
      width: window.innerWidth,
      height: window.innerHeight,
      windowWidth: window.innerWidth,
      windowHeight: window.innerHeight,
      ignoreElements: (element) => {
        if (!rootRef.current) return false
        return rootRef.current.contains(element)
      },
      onclone: (documentClone) => {
        documentClone
          .querySelectorAll('input[type="password"], textarea[data-issue-report-redact="true"], input[data-issue-report-redact="true"]')
          .forEach((element) => {
            if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
              element.value = '[REDACTED]'
            }
          })
      },
    })

    return canvas.toDataURL('image/webp', 0.86)
  }

  const handleSubmit = async () => {
    const trimmedNotes = notes.trim()
    if (!trimmedNotes) {
      toast.error('Add a short note about what went wrong.')
      return
    }

    setSubmitting(true)

    let screenshotDataUrl: string | null = null
    if (includeScreenshot) {
      try {
        screenshotDataUrl = await captureScreenshot()
      } catch (error) {
        console.error('Issue reporter screenshot capture failed:', error)
        toast.error('Screenshot capture failed. The report will be sent without it.')
      }
    }

    try {
      const response = await fetch('/api/issue-reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          notes: trimmedNotes,
          severity,
          includeScreenshot,
          includeConsoleLog,
          includeFailedRequests,
          screenshotDataUrl,
          consoleEntries: includeConsoleLog ? getRecentConsoleEntries() : [],
          failedRequests: includeFailedRequests ? getRecentFailedRequests() : [],
          pageUrl: window.location.href,
          routePath: pathname || window.location.pathname,
          browserContext: {
            viewport: {
              width: window.innerWidth,
              height: window.innerHeight,
              pixelRatio: window.devicePixelRatio || 1,
            },
            userAgent: navigator.userAgent,
            language: navigator.language,
            platform: navigator.platform,
            appVersion: process.env.NEXT_PUBLIC_APP_VERSION || 'web',
          },
        }),
      })

      const data = await response.json()
      if (!response.ok) {
        throw new Error(data?.error || 'Failed to submit issue report')
      }

      setSubmittedTicketId(data.ticketId)
      setNotes('')
      setSeverity('medium')
      toast.success('Issue reported successfully')
    } catch (error: any) {
      toast.error(error?.message || 'Failed to submit issue report')
    } finally {
      setSubmitting(false)
    }
  }

  const handleClose = () => {
    setIsOpen(false)
    setSubmittedTicketId(null)
  }

  return (
    <div ref={rootRef} className="fixed right-0 top-1/2 z-50" data-issue-report-ignore="true">
      {isOpen && (
        <div
          className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-950/60 p-2 sm:items-center sm:p-4"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              handleClose()
            }
          }}
        >
          <div className="max-h-[94vh] w-[min(95vw,24rem)] overflow-y-auto rounded-3xl border border-slate-200 bg-white p-5 shadow-2xl">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-amber-800">
                <AlertTriangle className="h-3.5 w-3.5" />
                Report Issue
              </div>
              <h2 className="mt-3 text-xl font-bold text-slate-900">Send fault details to Master Admin</h2>
              <p className="mt-1 text-sm text-slate-600">
                We will attach your notes, page context, and optional screenshot/logs.
              </p>
            </div>
            <button
              type="button"
              onClick={handleClose}
              className="rounded-full p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
              aria-label="Close issue reporter"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {submittedTicketId ? (
            <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900">
              <p className="text-sm font-semibold">Ticket submitted</p>
              <p className="mt-1 text-sm">Reference ID: <span className="font-mono">{submittedTicketId}</span></p>
              <button
                type="button"
                onClick={handleClose}
                className="mt-4 w-full rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700"
              >
                Close
              </button>
            </div>
          ) : (
            <div className="mt-5 space-y-4">
              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-800">What went wrong?</label>
                <textarea
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  rows={5}
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  placeholder="Describe the problem, what you clicked, and what you expected to happen."
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-800">Severity</label>
                  <select
                    value={severity}
                    onChange={(event) => setSeverity(event.target.value as Severity)}
                    className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  >
                    {severityOptions.map((option) => (
                      <option key={option} value={option}>
                        {option.charAt(0).toUpperCase() + option.slice(1)}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                  <p className="font-semibold text-slate-800">Current page</p>
                  <p className="mt-1 break-all">{pathname || '/'}</p>
                </div>
              </div>

              <div className="grid gap-3">
                <label className="flex items-start gap-3 rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={includeScreenshot}
                    onChange={(event) => setIncludeScreenshot(event.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span>
                    <span className="flex items-center gap-2 font-semibold text-slate-900"><Camera className="h-4 w-4" /> Include screenshot</span>
                    <span className="mt-1 block text-xs text-slate-500">Captures the current visible page only.</span>
                  </span>
                </label>

                <label className="flex items-start gap-3 rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={includeConsoleLog}
                    onChange={(event) => setIncludeConsoleLog(event.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span>
                    <span className="flex items-center gap-2 font-semibold text-slate-900"><TerminalSquare className="h-4 w-4" /> Include browser console</span>
                    <span className="mt-1 block text-xs text-slate-500">Recent entries queued: {consoleCount}</span>
                  </span>
                </label>

                <label className="flex items-start gap-3 rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={includeFailedRequests}
                    onChange={(event) => setIncludeFailedRequests(event.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span>
                    <span className="flex items-center gap-2 font-semibold text-slate-900"><Bug className="h-4 w-4" /> Include failed API requests</span>
                    <span className="mt-1 block text-xs text-slate-500">Recent failed requests queued: {failedRequestCount}</span>
                  </span>
                </label>
              </div>

              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting}
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {submitting ? 'Submitting Report...' : 'Submit Report'}
              </button>
            </div>
          )}
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        className="-translate-y-1/2 inline-flex items-center rounded-l-lg border border-r-0 border-slate-700 bg-slate-900 px-1.5 py-2.5 text-[11px] font-semibold text-white shadow-xl transition hover:bg-slate-800"
      >
        <span className="[writing-mode:vertical-rl] rotate-180 tracking-[0.08em]">Report Issue</span>
      </button>
    </div>
  )
}
