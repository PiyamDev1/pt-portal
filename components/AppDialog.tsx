'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ConfirmationDialog, type ConfirmationType } from './ConfirmationDialog'
import { ModalBase } from './ModalBase'

export type ConfirmDialogOptions = {
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  type?: ConfirmationType
}

export type PromptDialogOptions = {
  title: string
  message: string
  label: string
  placeholder?: string
  initialValue?: string
  confirmLabel?: string
  cancelLabel?: string
  required?: boolean
}

type DialogState =
  | { kind: 'confirm'; options: ConfirmDialogOptions }
  | { kind: 'prompt'; options: PromptDialogOptions; value: string }
  | null

type DialogResult = boolean | string | null

/**
 * Promise-based app dialog API for decisions and short text input.
 *
 * This deliberately mirrors the ergonomic part of window.confirm/window.prompt while keeping
 * the interaction accessible, styled, and under React's control. Render `dialog` once in the
 * calling component and await `confirm` or `prompt` from event handlers.
 */
export function useAppDialog() {
  const [state, setState] = useState<DialogState>(null)
  const pendingResolution = useRef<((result: DialogResult) => void) | null>(null)

  const settle = useCallback((result: DialogResult) => {
    pendingResolution.current?.(result)
    pendingResolution.current = null
    setState(null)
  }, [])

  const cancelPending = useCallback(() => {
    settle(state?.kind === 'confirm' ? false : null)
  }, [settle, state?.kind])

  const confirm = useCallback((options: ConfirmDialogOptions) => {
    pendingResolution.current?.(null)
    setState({ kind: 'confirm', options })
    return new Promise<boolean>((resolve) => {
      pendingResolution.current = (result) => resolve(result === true)
    })
  }, [])

  const prompt = useCallback((options: PromptDialogOptions) => {
    pendingResolution.current?.(null)
    setState({ kind: 'prompt', options, value: options.initialValue || '' })
    return new Promise<string | null>((resolve) => {
      pendingResolution.current = (result) => resolve(typeof result === 'string' ? result : null)
    })
  }, [])

  useEffect(
    () => () => {
      pendingResolution.current?.(null)
      pendingResolution.current = null
    },
    [],
  )

  const dialog =
    state?.kind === 'confirm' ? (
      <ConfirmationDialog
        isOpen
        onClose={cancelPending}
        onConfirm={() => settle(true)}
        title={state.options.title}
        message={state.options.message}
        confirmLabel={state.options.confirmLabel}
        cancelLabel={state.options.cancelLabel}
        type={state.options.type}
      />
    ) : state?.kind === 'prompt' ? (
      <ModalBase
        isOpen
        onClose={cancelPending}
        onSubmit={(event) => {
          event.preventDefault()
          const value = state.value.trim()
          if (state.options.required !== false && !value) return
          settle(value)
        }}
        title={state.options.title}
        description={state.options.message}
        size="sm"
      >
        <label className="block text-sm font-bold text-slate-700">
          {state.options.label}
          <input
            autoFocus
            value={state.value}
            onChange={(event) =>
              setState((current) =>
                current?.kind === 'prompt' ? { ...current, value: event.target.value } : current,
              )
            }
            placeholder={state.options.placeholder}
            className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 font-normal text-slate-900 outline-none transition focus:border-blue-900 focus:ring-2 focus:ring-blue-100"
          />
        </label>
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={cancelPending}
            className="rounded border border-slate-300 px-4 py-2 font-medium text-slate-700 transition hover:bg-slate-50"
          >
            {state.options.cancelLabel || 'Cancel'}
          </button>
          <button
            type="submit"
            disabled={state.options.required !== false && !state.value.trim()}
            className="rounded bg-blue-900 px-4 py-2 font-medium text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {state.options.confirmLabel || 'Continue'}
          </button>
        </div>
      </ModalBase>
    ) : null

  return { confirm, prompt, dialog }
}
