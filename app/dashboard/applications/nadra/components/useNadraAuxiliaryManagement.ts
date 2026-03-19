/**
 * Module: app/dashboard/applications/nadra/components/useNadraAuxiliaryManagement.ts
 * Dashboard module for applications/nadra/components/useNadraAuxiliaryManagement.ts.
 */

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { getNadraRecord } from './helpers'
import type { NadraApplication, NadraHistoryEntry } from '@/app/types/nadra'

type NotesModalState = {
  nadraId: string
  note: string
}

type ComplaintModalState = {
  nadraId: string
  trackingNumber: string
}

type AgentOption = {
  id: string
  name: string
}

type UseNadraAuxiliaryManagementParams = {
  currentUserId: string
  initialComplainedNadraIds: string[]
  onRefresh: () => void
}

type UseNadraAuxiliaryManagementResult = {
  selectedHistory: NadraApplication | null
  setSelectedHistory: (value: NadraApplication | null) => void
  historyLogs: NadraHistoryEntry[]
  loadingHistory: boolean
  notesModal: NotesModalState | null
  notesText: string
  setNotesText: (value: string) => void
  notesSaving: boolean
  openNotesModal: (record: NadraApplication) => void
  closeNotesModal: () => void
  handleSaveNotes: () => Promise<void>
  complaintModal: ComplaintModalState | null
  complaintNumber: string
  setComplaintNumber: (value: string) => void
  complaintDetails: string
  setComplaintDetails: (value: string) => void
  complaintSaving: boolean
  openComplaintModal: (record: NadraApplication) => void
  closeComplaintModal: () => void
  handleSaveComplaint: () => Promise<void>
  agentOptions: AgentOption[]
  canChangeAgent: boolean
  complainedNadraIds: Set<string>
}

export default function useNadraAuxiliaryManagement({
  currentUserId,
  initialComplainedNadraIds,
  onRefresh,
}: UseNadraAuxiliaryManagementParams): UseNadraAuxiliaryManagementResult {
  const [selectedHistory, setSelectedHistoryState] = useState<NadraApplication | null>(null)
  const [historyLogs, setHistoryLogs] = useState<NadraHistoryEntry[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [notesModal, setNotesModal] = useState<NotesModalState | null>(null)
  const [notesText, setNotesText] = useState('')
  const [notesSaving, setNotesSaving] = useState(false)
  const [complaintModal, setComplaintModal] = useState<ComplaintModalState | null>(null)
  const [complaintNumber, setComplaintNumber] = useState('')
  const [complaintDetails, setComplaintDetails] = useState('')
  const [complaintSaving, setComplaintSaving] = useState(false)
  const [agentOptions, setAgentOptions] = useState<AgentOption[]>([])
  const [canChangeAgent, setCanChangeAgent] = useState(false)
  const [agentLoadError, setAgentLoadError] = useState('')
  const [complainedNadraIds, setComplainedNadraIds] = useState<Set<string>>(
    new Set(initialComplainedNadraIds),
  )

  useEffect(() => {
    setComplainedNadraIds(new Set(initialComplainedNadraIds))
  }, [initialComplainedNadraIds])

  const fetchHistory = useCallback(async (nadraId: string) => {
    setLoadingHistory(true)
    try {
      const response = await fetch(`/api/nadra/status-history?nadraId=${nadraId}`)
      const data = await response.json()
      if (data.history) setHistoryLogs(data.history)
    } finally {
      setLoadingHistory(false)
    }
  }, [])

  useEffect(() => {
    const nadraArr = Array.isArray(selectedHistory?.nadra_services)
      ? selectedHistory.nadra_services
      : selectedHistory?.nadra_services
        ? [selectedHistory.nadra_services]
        : []

    const nadraId = nadraArr[0]?.id
    if (!nadraId) {
      setHistoryLogs([])
      return
    }

    setLoadingHistory(true)
    const timer = setTimeout(() => {
      fetchHistory(nadraId).catch(() => {
        // Error already shown via toast
      })
    }, 100)

    return () => clearTimeout(timer)
  }, [fetchHistory, selectedHistory])

  useEffect(() => {
    const loadAgents = async () => {
      try {
        const res = await fetch(`/api/nadra/agent-options?userId=${currentUserId}`)
        if (!res.ok) {
          const payload = await res.json()
          throw new Error(payload?.error || 'Unable to load agents')
        }

        const payload = await res.json()
        setAgentOptions(payload.agentOptions || [])
        setCanChangeAgent(!!payload.canChangeAgent)
      } catch (error: unknown) {
        setAgentLoadError(error instanceof Error ? error.message : 'Failed to load agents')
      }
    }

    loadAgents()
  }, [currentUserId])

  useEffect(() => {
    if (agentLoadError) {
      toast.error(agentLoadError)
    }
  }, [agentLoadError])

  const setSelectedHistory = useCallback((value: NadraApplication | null) => {
    setSelectedHistoryState(value)
  }, [])

  const openNotesModal = useCallback((record: NadraApplication) => {
    const nadra = getNadraRecord(record)
    if (!nadra?.id) {
      toast.error('Notes are only available for saved applications')
      return
    }

    setNotesModal({ nadraId: nadra.id, note: nadra.notes || '' })
    setNotesText(nadra.notes || '')
  }, [])

  const closeNotesModal = useCallback(() => {
    setNotesModal(null)
  }, [])

  const handleSaveNotes = useCallback(async () => {
    if (!notesModal?.nadraId) return

    setNotesSaving(true)
    try {
      const res = await fetch('/api/nadra/manage-record', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update',
          type: 'application',
          id: notesModal.nadraId,
          data: { notes: notesText },
          userId: currentUserId,
        }),
      })

      if (!res.ok) {
        const payload = await res.json()
        toast.error(payload?.error || 'Failed to update notes')
        return
      }

      toast.success('Notes updated')
      setNotesModal(null)
      onRefresh()
    } catch {
      toast.error('Error saving notes')
    } finally {
      setNotesSaving(false)
    }
  }, [currentUserId, notesModal, notesText, onRefresh])

  const openComplaintModal = useCallback((record: NadraApplication) => {
    const nadra = getNadraRecord(record)
    if (!nadra?.id) {
      toast.error('Complaints are only available for saved applications')
      return
    }

    setComplaintModal({
      nadraId: nadra.id,
      trackingNumber: nadra.tracking_number || record.tracking_number || 'N/A',
    })
    setComplaintNumber('')
    setComplaintDetails('')
  }, [])

  const closeComplaintModal = useCallback(() => {
    setComplaintModal(null)
  }, [])

  const handleSaveComplaint = useCallback(async () => {
    if (!complaintModal?.nadraId) return
    if (!complaintNumber.trim()) {
      toast.error('Complaint number is required')
      return
    }
    if (!complaintDetails.trim()) {
      toast.error('Complaint details are required')
      return
    }

    setComplaintSaving(true)
    try {
      const res = await fetch('/api/nadra/complaint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nadraId: complaintModal.nadraId,
          complaintNumber,
          details: complaintDetails,
          userId: currentUserId,
        }),
      })

      if (!res.ok) {
        const payload = await res.json()
        toast.error(payload?.error || 'Failed to record complaint')
        return
      }

      toast.success('Complaint recorded')
      setComplainedNadraIds((prev) => {
        const next = new Set(prev)
        next.add(complaintModal.nadraId)
        return next
      })
      setComplaintModal(null)

      if (selectedHistory) {
        await fetchHistory(complaintModal.nadraId)
      }
    } catch {
      toast.error('Error recording complaint')
    } finally {
      setComplaintSaving(false)
    }
  }, [
    complaintDetails,
    complaintModal,
    complaintNumber,
    currentUserId,
    fetchHistory,
    selectedHistory,
  ])

  return {
    selectedHistory,
    setSelectedHistory,
    historyLogs,
    loadingHistory,
    notesModal,
    notesText,
    setNotesText,
    notesSaving,
    openNotesModal,
    closeNotesModal,
    handleSaveNotes,
    complaintModal,
    complaintNumber,
    setComplaintNumber,
    complaintDetails,
    setComplaintDetails,
    complaintSaving,
    openComplaintModal,
    closeComplaintModal,
    handleSaveComplaint,
    agentOptions,
    canChangeAgent,
    complainedNadraIds,
  }
}
