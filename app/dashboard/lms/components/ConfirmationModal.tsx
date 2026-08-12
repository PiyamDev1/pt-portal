/**
 * Confirmation Modal
 * Generic LMS confirmation dialog for destructive or critical actions.
 *
 * @module app/dashboard/lms/components/ConfirmationModal
 */

'use client'

import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { AlertTriangle, Check, X } from 'lucide-react'

interface ConfirmationModalProps {
  isOpen: boolean
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  isDangerous?: boolean
  confirmDisabled?: boolean
  children?: ReactNode
  onConfirm: () => void | Promise<void>
  onCancel: () => void
}

export function ConfirmationModal({
  isOpen,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  isDangerous = false,
  confirmDisabled = false,
  children,
  onConfirm,
  onCancel,
}: ConfirmationModalProps) {
  const [loading, setLoading] = useState(false)
  const titleId = useId()
  const messageId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  const onCancelRef = useRef(onCancel)
  const loadingRef = useRef(loading)

  useEffect(() => {
    onCancelRef.current = onCancel
  }, [onCancel])

  useEffect(() => {
    loadingRef.current = loading
  }, [loading])

  useEffect(() => {
    if (!isOpen) return
    const previouslyFocused = document.activeElement as HTMLElement | null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const focusableSelector =
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    const animationFrame = window.requestAnimationFrame(() => {
      const dialog = dialogRef.current
      const firstFocusable = dialog?.querySelector<HTMLElement>(focusableSelector)
      if (firstFocusable) firstFocusable.focus()
      else dialog?.focus()
    })

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !loadingRef.current) {
        event.preventDefault()
        onCancelRef.current()
        return
      }

      if (event.key !== 'Tab') return
      const dialog = dialogRef.current
      if (!dialog) return
      const focusable = [...dialog.querySelectorAll<HTMLElement>(focusableSelector)]
      if (focusable.length === 0) {
        event.preventDefault()
        dialog.focus()
        return
      }

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      window.cancelAnimationFrame(animationFrame)
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', handleKeyDown)
      previouslyFocused?.focus()
    }
  }, [isOpen])

  const handleConfirm = async () => {
    setLoading(true)
    try {
      await onConfirm()
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !loading) {
          onCancel()
        }
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={messageId}
        aria-busy={loading || undefined}
        tabIndex={-1}
        className="bg-white rounded-lg shadow-lg max-w-sm w-full mx-4 p-6"
      >
        {/* Header */}
        <div className="flex items-start gap-3 mb-4">
          {isDangerous && (
            <div className="flex-shrink-0">
              <AlertTriangle className="w-6 h-6 text-red-600" />
            </div>
          )}
          <div className="flex-grow">
            <h2
              id={titleId}
              className={`text-lg font-bold ${isDangerous ? 'text-red-700' : 'text-slate-800'}`}
            >
              {title}
            </h2>
          </div>
        </div>

        {/* Message */}
        <p id={messageId} className="text-slate-600 text-sm mb-6 whitespace-pre-wrap">
          {message}
        </p>

        {children}

        {/* Buttons */}
        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            disabled={loading}
            className="px-4 py-2 bg-slate-200 hover:bg-slate-300 disabled:bg-slate-100 text-slate-700 rounded-lg font-medium transition-colors flex items-center gap-2"
            type="button"
          >
            <X className="w-4 h-4" />
            {cancelText}
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading || confirmDisabled}
            className={`px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 ${
              isDangerous
                ? 'bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white'
                : 'bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white'
            }`}
            type="button"
          >
            <Check className="w-4 h-4" />
            {loading ? 'Processing...' : confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}
