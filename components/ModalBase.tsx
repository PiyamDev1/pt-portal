/**
 * Reusable Modal Base Component
 * Provides consistent styling, structure, and behavior for all modals
 */

import React from 'react'
import { X } from 'lucide-react'

export interface ModalBaseProps {
  isOpen: boolean
  onClose: () => void
  title?: string
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
  description,
  children,
  isLoading = false,
  size = 'md',
  showCloseButton = true,
  className = '',
  onSubmit,
}: ModalBaseProps) {
  if (!isOpen) return null

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
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
          className={`${sizeClasses[size]} w-full bg-white rounded-lg shadow-xl pointer-events-auto flex flex-col max-h-[90vh] ${className}`}
          role="dialog"
          aria-modal="true"
          aria-labelledby={title ? 'modal-title' : undefined}
        >
          {/* Header */}
          {(title || showCloseButton) && (
            <div className="flex items-start justify-between p-6 border-b border-slate-200 flex-shrink-0">
              <div>
                {title && (
                  <h2 id="modal-title" className="text-xl font-bold text-slate-800">
                    {title}
                  </h2>
                )}
                {description && <p className="text-sm text-slate-500 mt-1">{description}</p>}
              </div>
              {showCloseButton && (
                <button
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
            <div className="absolute inset-0 bg-white bg-opacity-50 rounded-lg flex items-center justify-center z-10">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-900"></div>
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
          onClick={onCancel}
          disabled={isLoading}
          className="px-4 py-2 border border-slate-300 rounded font-medium text-slate-700 hover:bg-slate-100 transition disabled:opacity-50"
        >
          {cancelLabel}
        </button>
      )}
      {onSubmit && (
        <button
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
