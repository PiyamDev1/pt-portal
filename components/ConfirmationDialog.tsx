/**
 * Reusable Confirmation Dialog
 * Used for delete confirmations, destructive actions, etc.
 */

import React from 'react'
import { AlertCircle, CheckCircle, XCircle, Info } from 'lucide-react'
import { ModalBase } from './ModalBase'

export type ConfirmationType = 'danger' | 'warning' | 'info' | 'success'

export interface ConfirmationDialogProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void | Promise<void>
  title: string
  message: string | React.ReactNode
  confirmLabel?: string
  cancelLabel?: string
  type?: ConfirmationType
  isLoading?: boolean
  description?: string
  children?: React.ReactNode
}

const iconMap = {
  danger: { icon: AlertCircle, color: 'text-red-600', bg: 'bg-red-50' },
  warning: { icon: AlertCircle, color: 'text-yellow-600', bg: 'bg-yellow-50' },
  info: { icon: Info, color: 'text-blue-600', bg: 'bg-blue-50' },
  success: { icon: CheckCircle, color: 'text-green-600', bg: 'bg-green-50' },
}

const buttonColorMap = {
  danger: 'bg-red-600 hover:bg-red-700',
  warning: 'bg-yellow-600 hover:bg-yellow-700',
  info: 'bg-blue-900 hover:bg-blue-800',
  success: 'bg-green-600 hover:bg-green-700',
}

export function ConfirmationDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  type = 'danger',
  isLoading = false,
  description,
  children,
}: ConfirmationDialogProps) {
  const IconComponent = iconMap[type].icon
  const iconColor = iconMap[type].color
  const iconBg = iconMap[type].bg
  const buttonColor = buttonColorMap[type]

  const handleConfirm = async () => {
    try {
      await onConfirm()
      onClose()
    } catch (error) {
      // Error handling should be done by the caller
      console.error('Confirmation error:', error)
    }
  }

  return (
    <ModalBase
      isOpen={isOpen}
      onClose={onClose}
      size="sm"
      showCloseButton={false}
      isLoading={isLoading}
    >
      <div className="text-center">
        {/* Icon */}
        <div className={`${iconBg} w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4`}>
          <IconComponent className={`${iconColor} w-6 h-6`} />
        </div>

        {/* Title */}
        <h3 className="text-lg font-bold text-slate-800 mb-2">{title}</h3>

        {/* Description */}
        {description && <p className="text-sm text-slate-500 mb-4">{description}</p>}

        {/* Message */}
        <div className="text-slate-600 mb-6">
          {typeof message === 'string' ? <p>{message}</p> : message}
        </div>

        {/* Children (additional content) */}
        {children && <div className="mb-6 text-left">{children}</div>}

        {/* Buttons */}
        <div className="flex gap-3 justify-center">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="px-4 py-2 rounded font-medium text-slate-700 border border-slate-300 hover:bg-slate-50 transition disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            onClick={handleConfirm}
            disabled={isLoading}
            className={`px-4 py-2 rounded font-medium text-white transition disabled:opacity-50 ${buttonColor}`}
          >
            {isLoading ? 'Please wait...' : confirmLabel}
          </button>
        </div>
      </div>
    </ModalBase>
  )
}

/**
 * Hook to manage confirmation dialog state
 */
export function useConfirmation(
  onConfirm?: () => void | Promise<void>
) {
  const [isOpen, setIsOpen] = React.useState(false)
  const [isLoading, setIsLoading] = React.useState(false)

  const open = React.useCallback(() => setIsOpen(true), [])
  const close = React.useCallback(() => setIsOpen(false), [])

  const handleConfirm = React.useCallback(async () => {
    setIsLoading(true)
    try {
      if (onConfirm) {
        await onConfirm()
      }
      close()
    } finally {
      setIsLoading(false)
    }
  }, [onConfirm, close])

  return {
    isOpen,
    isLoading,
    open,
    close,
    handleConfirm,
  }
}
