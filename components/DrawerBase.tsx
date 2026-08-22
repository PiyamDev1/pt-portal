'use client'

import { useEffect, useId, useRef, type ReactNode, type RefObject } from 'react'
import { X } from 'lucide-react'

export type DrawerBaseProps = {
  isOpen: boolean
  onClose: () => void
  title: string
  description?: string
  children: ReactNode
  footer?: ReactNode
  isLoading?: boolean
  closeDisabled?: boolean
  isActive?: boolean
  initialFocusRef?: RefObject<HTMLElement | null>
  className?: string
}

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/** Accessible right-side drawer with focus containment and opener restoration. */
export function DrawerBase({
  isOpen,
  onClose,
  title,
  description,
  children,
  footer,
  isLoading = false,
  closeDisabled = false,
  isActive = true,
  initialFocusRef,
  className = '',
}: DrawerBaseProps) {
  const titleId = useId()
  const descriptionId = useId()
  const drawerRef = useRef<HTMLDivElement>(null)
  const openerRef = useRef<HTMLElement | null>(null)
  const onCloseRef = useRef(onClose)
  const isLoadingRef = useRef(isLoading)
  const closeDisabledRef = useRef(closeDisabled)

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    isLoadingRef.current = isLoading
  }, [isLoading])

  useEffect(() => {
    closeDisabledRef.current = closeDisabled
  }, [closeDisabled])

  useEffect(() => {
    if (!isOpen) return

    openerRef.current = document.activeElement as HTMLElement | null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.body.style.overflow = previousOverflow
      openerRef.current?.focus()
      openerRef.current = null
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen || !isActive) return

    const animationFrame = window.requestAnimationFrame(() => {
      const drawer = drawerRef.current
      if (!drawer || drawer.contains(document.activeElement)) return
      const requestedTarget = initialFocusRef?.current
      const firstFocusable = drawer.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)
      if (
        requestedTarget &&
        drawer.contains(requestedTarget) &&
        !requestedTarget.hasAttribute('disabled')
      ) {
        requestedTarget.focus()
      } else if (firstFocusable) {
        firstFocusable.focus()
      } else {
        drawer.focus()
      }
    })

    const handleKeyDown = (event: KeyboardEvent) => {
      const drawer = drawerRef.current
      if (!drawer) return

      if (event.key === 'Escape' && !isLoadingRef.current && !closeDisabledRef.current) {
        event.preventDefault()
        onCloseRef.current()
        return
      }

      if (event.key !== 'Tab') return
      const focusable = [...drawer.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)].filter(
        (element) => element.getAttribute('aria-hidden') !== 'true',
      )
      if (focusable.length === 0) {
        event.preventDefault()
        drawer.focus()
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
    }
  }, [initialFocusRef, isActive, isOpen])

  if (!isOpen) return null

  const closeAllowed = !isLoading && !closeDisabled

  return (
    <div
      className={`fixed inset-0 z-50 flex justify-end bg-slate-950/50 backdrop-blur-sm ${isActive ? '' : 'pointer-events-none'}`}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && closeAllowed) onClose()
      }}
      aria-hidden={isActive ? undefined : true}
    >
      <div
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        aria-busy={isLoading || undefined}
        tabIndex={-1}
        className={`flex h-[100dvh] w-full flex-col bg-white shadow-2xl outline-none sm:max-w-2xl ${className}`}
      >
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 px-4 pb-4 pt-[calc(1rem+env(safe-area-inset-top))] sm:px-6 sm:pt-5">
          <div className="min-w-0">
            <h2 id={titleId} className="truncate text-xl font-black text-slate-950">
              {title}
            </h2>
            {description && (
              <p id={descriptionId} className="mt-1 text-sm text-slate-500">
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={!closeAllowed}
            aria-label="Close drawer"
            className="ui-tap ui-focus flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>

        {footer && (
          <footer className="shrink-0 border-t border-slate-200 bg-white px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 sm:px-6 sm:pb-4">
            {footer}
          </footer>
        )}
      </div>
    </div>
  )
}
