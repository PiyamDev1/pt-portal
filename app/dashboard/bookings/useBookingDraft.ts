'use client'

import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import type { BookingDraftPayload } from '@/app/types/bookings'

const DEFAULT_DRAFT_KEY = 'appointment-form'

function isMeaningfulDraft(payload: BookingDraftPayload): boolean {
  return Boolean(
    payload.customer_name.trim() ||
    payload.customer_email.trim() ||
    payload.phone_local.trim() ||
    payload.notes.trim() ||
    payload.tags.trim()
  )
}

export function useBookingDraft(params: {
  enabled: boolean
  editing: boolean
  locationId: string
  form: BookingDraftPayload
  setForm: Dispatch<SetStateAction<BookingDraftPayload>>
}) {
  const { enabled, editing, locationId, form, setForm } = params
  const [draftState, setDraftState] = useState<'idle' | 'loading' | 'saving' | 'saved' | 'error'>('idle')
  const loadedRef = useRef(false)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (enabled) return
    loadedRef.current = false
  }, [enabled])

  useEffect(() => {
    if (!enabled || editing || !locationId || loadedRef.current) return
    let active = true

    const run = async () => {
      try {
        if (active) setDraftState('loading')
        const res = await fetch(`/api/bookings/drafts?location_id=${encodeURIComponent(locationId)}&draft_key=${DEFAULT_DRAFT_KEY}`, {
          cache: 'no-store',
        })
        const json = await res.json()
        if (!active) return
        if (res.ok && json.payload) {
          const draft = json.payload as BookingDraftPayload
          setForm((current) => ({
            ...draft,
            date: current.date || draft.date || '',
            service_id: current.service_id || draft.service_id || '',
            start_time: current.start_time || draft.start_time || '',
            person_count: current.person_count || draft.person_count || 1,
            manual_override: current.manual_override,
          }))
        }
        setDraftState('idle')
        loadedRef.current = true
      } catch {
        if (active) setDraftState('error')
      }
    }

    run()
    return () => {
      active = false
    }
  }, [editing, enabled, locationId, setForm])

  useEffect(() => {
    if (!enabled || editing || !locationId || !loadedRef.current) return
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)

    if (!isMeaningfulDraft(form)) {
      saveTimerRef.current = setTimeout(() => {
        void fetch(`/api/bookings/drafts?location_id=${encodeURIComponent(locationId)}&draft_key=${DEFAULT_DRAFT_KEY}`, {
          method: 'DELETE',
        })
      }, 250)
      return
    }

    saveTimerRef.current = setTimeout(() => {
      setDraftState('saving')
      void fetch('/api/bookings/drafts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          location_id: locationId,
          draft_key: DEFAULT_DRAFT_KEY,
          payload: form,
        }),
      }).then((res) => {
        setDraftState(res.ok ? 'saved' : 'error')
      }).catch(() => {
        setDraftState('error')
      })
    }, 600)

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [editing, enabled, form, locationId])

  const clearDraft = async () => {
    if (!locationId) return
    await fetch(`/api/bookings/drafts?location_id=${encodeURIComponent(locationId)}&draft_key=${DEFAULT_DRAFT_KEY}`, {
      method: 'DELETE',
    })
    setDraftState('idle')
  }
  return {
    draftState,
    clearDraft,
  }
}
