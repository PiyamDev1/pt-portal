/**
 * Modal state management hook
 * Centralizes show/hide logic and prevents prop drilling
 */
import { useState, useCallback } from 'react'

export interface ModalState {
  isOpen: boolean
  isLoading: boolean
  error: string | null
}

export function useModal(initialOpen = false) {
  const [state, setState] = useState<ModalState>({
    isOpen: initialOpen,
    isLoading: false,
    error: null,
  })

  const open = useCallback(() => {
    setState(prev => ({ ...prev, isOpen: true, error: null }))
  }, [])

  const close = useCallback(() => {
    setState(prev => ({ ...prev, isOpen: false }))
  }, [])

  const setLoading = useCallback((loading: boolean) => {
    setState(prev => ({ ...prev, isLoading: loading }))
  }, [])

  const setError = useCallback((error: string | null) => {
    setState(prev => ({ ...prev, error }))
  }, [])

  const reset = useCallback(() => {
    setState({
      isOpen: initialOpen,
      isLoading: false,
      error: null,
    })
  }, [initialOpen])

  return {
    ...state,
    open,
    close,
    setLoading,
    setError,
    reset,
  }
}
