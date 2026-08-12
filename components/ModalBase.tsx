/**
 * Reusable Modal Base Component
 * Provides consistent styling, structure, and behavior for all modals
 */

import React, { useEffect, useId, useRef } from 'react'
import { X } from 'lucide-react'

export interface ModalBaseProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  ariaLabel?: string
  description?: string
  children: React.ReactNode
  isLoading?: boolean
  size?: 'sm' | 'md' | 'lg'
  showCloseButton?: boolean
  className?: string
  onSubmit?: (e: React.FormEvent<HTMLFormElement>) => void
}

const sizeClasses = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-2xl',
}

export function ModalBase({
  isOpen,
  onClose,
  title,
  ariaLabel,
  description,
  children,
  isLoading = false,
  size = 'md',
  showCloseButton = true,
  className = '',
  onSubmit,
}: ModalBaseProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  const isLoadingRef = useRef(isLoading)
  const titleId = useId()
  const descriptionId = useId()

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    isLoadingRef.current = isLoading
  }, [isLoading])

  useEffect(() => {
    if (!isOpen) return

    const previouslyFocused = document.activeElement as HTMLElement | null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const focusableSelector =
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    const animationFrame = window.requestAnimationFrame(() => {
      const dialog = dialogRef.current
      if (!dialog || dialog.contains(document.activeElement)) return
      const firstFocusable = dialog.querySelector<HTMLElement>(focusableSelector)
      if (firstFocusable) firstFocusable.focus()
      else dialog.focus()
    })

    const handleKeyDown = (event: KeyboardEvent) => {
      const dialog = dialogRef.current
      if (!dialog) return

      if (event.key === 'Escape' && !isLoadingRef.current) {
        event.preventDefault()
        onCloseRef.current()
        return
      }

      if (event.key !== 'Tab') return
      const focusable = [...dialog.querySelectorAll<HTMLElement>(focusableSelector)].filter(
        (element) => element.getAttribute('aria-hidden') !== 'true',
      )
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
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousOverflow
      previouslyFocused?.focus()
    }
  }, [isOpen])

  if (!isOpen) return null

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget && !isLoading) {
      onClose()
    }
  }

  const content = onSubmit ? (
    <form onSubmit={onSubmit} className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto">{children}</div>
    </form>
  ) : (
    children
  )

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 z-50 transition-opacity"
        onClick={handleBackdropClick}
        aria-hidden="true"
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div
          ref={dialogRef}
          tabIndex={-1}
          className={`${sizeClasses[size]} relative w-full bg-white rounded-lg shadow-xl pointer-events-auto flex flex-col max-h-[90vh] ${className}`}
          role="dialog"
          aria-modal="true"
          aria-label={title ? undefined : ariaLabel}
          aria-labelledby={title ? titleId : undefined}
          aria-describedby={description ? descriptionId : undefined}
          aria-busy={isLoading || undefined}
        >
          {/* Header */}
          {(title || description || showCloseButton) && (
            <div className="flex items-start justify-between p-6 border-b border-slate-200 flex-shrink-0">
              <div>
                {title && (
                  <h2 id={titleId} className="text-xl font-bold text-slate-800">
                    {title}
                  </h2>
                )}
                {description && (
                  <p id={descriptionId} className="text-sm text-slate-500 mt-1">
                    {description}
                  </p>
                )}
              </div>
              {showCloseButton && (
                <button
                  type="button"
                  onClick={onClose}
                  className="text-slate-400 hover:text-slate-600 flex-shrink-0 ml-4"
                  aria-label="Close modal"
                  disabled={isLoading}
                >
                  <X size={24} />
                </button>
              )}
            </div>
          )}

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-6">{content}</div>

          {/* Loading overlay */}
          {isLoading && (
            <div
              className="absolute inset-0 bg-white bg-opacity-50 rounded-lg flex items-center justify-center z-10"
              role="status"
              aria-label="Loading"
            >
              <div
                className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-900"
                aria-hidden="true"
              />
            </div>
          )}
        </div>
      </div>
    </>
  )
}

/**
 * Modal footer with action buttons
 * Use this with ModalBase for consistent button styling
 */
export interface ModalFooterProps {
  onCancel: () => void
  onSubmit?: () => void | Promise<void>
  cancelLabel?: string
  submitLabel?: string
  submitVariant?: 'primary' | 'danger' | 'success'
  isLoading?: boolean
  showCancel?: boolean
}

export function ModalFooter({
  onCancel,
  onSubmit,
  cancelLabel = 'Cancel',
  submitLabel = 'Save',
  submitVariant = 'primary',
  isLoading = false,
  showCancel = true,
}: ModalFooterProps) {
  const submitButtonClass = {
    primary: 'bg-blue-900 text-white hover:bg-blue-800',
    danger: 'bg-red-600 text-white hover:bg-red-700',
    success: 'bg-green-600 text-white hover:bg-green-700',
  }[submitVariant]

  return (
    <div className="flex items-center gap-3 p-6 border-t border-slate-200 flex-shrink-0 bg-slate-50">
      {showCancel && (
        <button
          type="button"
          onClick={onCancel}
          disabled={isLoading}
          className="px-4 py-2 border border-slate-300 rounded font-medium text-slate-700 hover:bg-slate-100 transition disabled:opacity-50"
        >
          {cancelLabel}
        </button>
      )}
      {onSubmit && (
        <button
          type="button"
          onClick={onSubmit}
          disabled={isLoading}
          className={`px-4 py-2 rounded font-medium transition disabled:opacity-50 ml-auto ${submitButtonClass}`}
        >
          {isLoading ? 'Saving...' : submitLabel}
        </button>
      )}
    </div>
  )
}
