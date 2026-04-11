/**
 * Pakistani Passports Client
 * Handles list filtering, create/edit/status workflows,
 * notes/history modals, and passport arrival tracking.
 */
'use client'

import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { useRouter, useSearchParams } from 'next/navigation'
import RowItem from './components/RowItem'
import EditModal from './components/EditModal'
import HistoryModal from './components/HistoryModal'
import ArrivalModal from './components/ArrivalModal'
import NotesModal from './components/NotesModal'
import NewApplicationForm from './components/NewApplicationForm'
import PassportsToolbar from './components/PassportsToolbar'
import PassportsTable from './components/PassportsTable'
import PassportsPagination from './components/PassportsPagination'
import ReceiptHistoryModal from '@/app/dashboard/applications/components/ReceiptHistoryModal'
import { formatCNIC, getApplicantRecord, getPassportRecord } from './components/utils'
import { usePassportListFiltering } from './components/usePassportListFiltering'
import { useReceipt } from '@/hooks'
import type {
  PakApplicationFormData,
  Application,
  ModalState,
  Metadata,
  PakEditFormData,
  PakUpdateRecordPayload,
} from './components/types'
import { PakApplicationFormSchema } from './components/schemas'
import type { PakApplicationFormErrors } from './components/schemas'
import { pakPassportApi } from './components/api'

type StatusHistoryEntry = {
  id: string
  status: string
  description?: string
  changed_by?: string
  date?: string
}

type PakPassportClientProps = {
  initialApplications: Application[]
  currentUserId: string
}

const getNoteSignature = (value?: string | null) => String(value || '').trim()

export default function PakPassportClient({
  initialApplications,
  currentUserId,
}: PakPassportClientProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const attentionMode = searchParams.get('focus') === 'attention'
  const [showForm, setShowForm] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 25

  // Modals
  const [historyModal, setHistoryModal] = useState<ModalState | null>(null)
  const [editModal, setEditModal] = useState<boolean>(false)
  const [arrivalModal, setArrivalModal] = useState<ModalState | null>(null)
  const [notesModal, setNotesModal] = useState<ModalState | null>(null)
  const [newPassportNum, setNewPassportNum] = useState('')
  const [receiptHistoryApplicantId, setReceiptHistoryApplicantId] = useState<string | null>(null)
  const [notesText, setNotesText] = useState('')
  const [isNotesLoading, setIsNotesLoading] = useState(false)
  const [isNotesSaving, setIsNotesSaving] = useState(false)
  const [statusHistory, setStatusHistory] = useState<StatusHistoryEntry[]>([])
  const [noteReadSignatures, setNoteReadSignatures] = useState<Record<string, string>>({})

  // Form Data
  const [formErrors, setFormErrors] = useState<PakApplicationFormErrors>({})
  const [editFormData, setEditFormData] = useState<PakEditFormData>({
    id: '',
    applicantName: '',
    applicantEmail: '',
    applicantPhone: '',
    familyHeadEmail: '',
    trackingNumber: '',
    oldPassportNumber: '',
  })
  const [deleteAuthCode, setDeleteAuthCode] = useState('')

  const [formData, setFormData] = useState<PakApplicationFormData>({
    applicantName: '',
    applicantCnic: '',
    applicantEmail: '',
    applicantPhone: '',
    familyHeadEmail: '',
    applicationType: 'Renewal',
    category: 'Adult 10 Year',
    pageCount: '34 pages',
    speed: 'Normal',
    trackingNumber: '',
    oldPassportNumber: '',
    fingerprintsCompleted: false,
  })

  const [metadata, setMetadata] = useState<Metadata>({
    categories: ['Adult 10 Year', 'Adult 5 Year', 'Child 5 Year'],
    speeds: ['Normal', 'Executive'],
    applicationTypes: ['First Time', 'Renewal', 'Modification', 'Lost'],
    pageCounts: ['34 pages', '54 pages', '72 pages', '100 pages'],
  })
  const { generateReceipt, markReceiptShared } = useReceipt()

  const upsertLocalReadSignature = (applicationId: string, noteValue?: string | null) => {
    const signature = getNoteSignature(noteValue)
    setNoteReadSignatures((current) => {
      const next = { ...current }
      if (!signature) {
        delete next[applicationId]
      } else {
        next[applicationId] = signature
      }
      return next
    })
  }

  const fetchReadSignatures = async (recordIds: string[]) => {
    if (recordIds.length === 0) {
      setNoteReadSignatures({})
      return
    }

    try {
      const params = new URLSearchParams({
        context: 'pk-passport',
        recordIds: recordIds.join(','),
      })
      const response = await fetch(`/api/applications/notes-read?${params.toString()}`, {
        credentials: 'include',
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        return
      }

      setNoteReadSignatures(payload?.readSignatures || {})
    } catch {
      // Ignore transient failures and keep unread indicators conservative.
    }
  }

  useEffect(() => {
    const recordIds = initialApplications
      .filter((app) => Boolean(getNoteSignature(getPassportRecord(app)?.notes)))
      .map((app) => app.id)

    void fetchReadSignatures(recordIds)
  }, [initialApplications])

  const markNotesRead = async (
    applicationId: string,
    noteValue?: string | null,
    options: { silent?: boolean } = { silent: true },
  ) => {
    const signature = getNoteSignature(noteValue)
    upsertLocalReadSignature(applicationId, signature)

    try {
      await fetch('/api/applications/notes-read', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          context: 'pk-passport',
          recordId: applicationId,
          noteSignature: signature,
        }),
      })
    } catch {
      if (!options.silent) {
        toast.error('Could not save read state')
      }
    }
  }

  const markNotesUnread = async (applicationId: string) => {
    setNoteReadSignatures((current) => {
      if (typeof current[applicationId] === 'undefined') return current
      const next = { ...current }
      delete next[applicationId]
      return next
    })

    try {
      await fetch('/api/applications/notes-read', {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          context: 'pk-passport',
          recordId: applicationId,
        }),
      })
    } catch {
      toast.error('Could not mark note as unread')
    }
  }

  const isPassportNotesUnread = (item: Application) => {
    const passport = getPassportRecord(item)
    const signature = getNoteSignature(passport?.notes)
    if (!signature) return false
    return noteReadSignatures[item.id] !== signature
  }

  // --- HANDLERS ---
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    let { name, value, type } = e.target
    const checked = (e.target as HTMLInputElement).checked
    if (type === 'checkbox') {
      setFormData({ ...formData, [name]: checked })
      return
    }
    if (name === 'applicantCnic') value = formatCNIC(value)
    if (['trackingNumber', 'oldPassportNumber'].includes(name)) value = value.toUpperCase()

    setFormData({ ...formData, [name]: value })
    setFormErrors((prev) => ({ ...prev, [name]: undefined }))
  }

  const handleSubmit = async () => {
    const parsed = PakApplicationFormSchema.safeParse(formData)
    if (!parsed.success) {
      const errors: PakApplicationFormErrors = {}
      parsed.error.issues.forEach((err) => {
        if (err.path[0]) {
          errors[err.path[0] as keyof PakApplicationFormData] = err.message
        }
      })
      setFormErrors(errors)
      toast.error('Please fix validation errors')
      return
    }
    setFormErrors({})
    setIsSubmitting(true)
    // Pass currentUserId to the API
    const result = await pakPassportApi.addApplication({ ...formData, currentUserId })
    setIsSubmitting(false)

    if (result.ok) {
      toast.success('Passport application saved')
      setShowForm(false)
      router.refresh()
    } else {
      toast.error(result.error || 'Failed to save')
    }
  }

  // --- ACTIONS ---
  const handleUpdateRecord = async (id: string, data: PakUpdateRecordPayload) => {
    // This is used by RowItem to save Passport #, Collection status, etc.
    const result = await pakPassportApi.updateStatus(id, data.status, currentUserId, data)
    if (result.ok) {
      toast.success('Record Updated')
      router.refresh()
    } else {
      toast.error(result.error || 'Update Failed')
    }
  }

  const openEditModal = (item: Application) => {
    const pp = getPassportRecord(item)
    const applicant = getApplicantRecord(item)
    setEditFormData({
      id: item.id, // Application id
      passportId: pp?.id,
      applicantId: applicant?.id,
      applicantName: `${applicant?.first_name || ''} ${applicant?.last_name || ''}`.trim(),
      applicantCnic: applicant?.citizen_number,
      applicantEmail: applicant?.email || '',
      applicantPhone: applicant?.phone_number || '',
      familyHeadEmail: pp?.family_head_email || '',
      trackingNumber: item.tracking_number,
      oldPassportNumber: pp?.old_passport_number || '',
      applicationType: pp?.application_type,
      category: pp?.category,
      speed: pp?.speed,
      status: pp?.status,
      // Add other fields as needed for your EditModal
    })
    setEditModal(true)
  }

  const handleEditSubmit = async () => {
    if (!editFormData?.id) {
      toast.error('No record selected')
      return
    }

    const payload = {
      ...editFormData,
      applicationId: editFormData.id,
      passportId: editFormData.passportId,
    }

    const result = await pakPassportApi.updateRecord(editFormData.id, payload, currentUserId)
    if (result.ok) {
      toast.success('Application updated')
      setEditModal(false)
      router.refresh()
    } else {
      toast.error(result.error || 'Update failed')
    }
  }

  const handleDelete = async () => {
    // Implement delete logic
  }

  const handleViewHistory = async (appId: string, trackingNo: string) => {
    const data = (await pakPassportApi.getStatusHistory(appId)) as
      | { history?: StatusHistoryEntry[] }
      | null
    if (data) {
      setStatusHistory(data.history || [])
      setHistoryModal({ trackingNumber: trackingNo })
    }
  }

  const handleOpenArrival = (item: Application) => {
    const pp = getPassportRecord(item)
    setNewPassportNum(pp?.new_passport_number || '')
    setArrivalModal({ passportId: pp?.id, trackingNumber: item.tracking_number })
  }

  const handleSaveArrival = async () => {
    if (!arrivalModal?.passportId) {
      toast.error('No passport record selected')
      return
    }

    if (!newPassportNum.trim()) {
      toast.error('Please enter a passport number')
      return
    }

    const result = await pakPassportApi.updateStatus(
      arrivalModal.passportId,
      'Passport Arrived',
      currentUserId,
      { newPassportNo: newPassportNum },
    )
    if (result.ok) {
      toast.success('Passport number saved')
      setArrivalModal(null)
      setNewPassportNum('')
      router.refresh()
    } else {
      toast.error(result.error || 'Failed to save')
    }
  }

  const handleManageDocuments = (applicationId: string, trackingNumber?: string) => {
    if (!applicationId) {
      toast.error('Cannot manage documents for this application')
      return
    }
    router.push(`/dashboard/applications/passports/documents/${applicationId}`)
  }

  const handleGenerateReceipt = async (item: Application) => {
    const passport = getPassportRecord(item)
    if (!passport?.id) {
      toast.error('No passport record found for receipt generation')
      return
    }

    const status = String(passport.status || '')
      .trim()
      .toLowerCase()

    let receiptType: 'biometrics' | 'collection' | 'refund' | null = null
    if (passport.is_refunded) {
      receiptType = 'refund'
    } else if (status === 'biometrics taken') {
      receiptType = 'biometrics'
    } else if (status === 'collected') {
      receiptType = 'collection'
    }

    if (!receiptType) {
      toast.error('Receipt is available for Biometrics Taken, Collected, or Refunded records')
      return
    }

    try {
      const payload = await generateReceipt({
        serviceType: 'pk_passport',
        serviceRecordId: passport.id,
        receiptType,
        generatedBy: currentUserId,
      })

      const text = payload?.receipt?.plainText || ''
      if (text && typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text)
        toast.success('Receipt copied to clipboard')
      } else {
        toast.success('Receipt generated successfully')
      }

      await markReceiptShared({ receiptId: payload.receipt.id, channel: 'clipboard' })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to generate receipt')
    }
  }

  const handleOpenNotes = async (applicationId: string, trackingNumber?: string) => {
    setNotesModal({ applicationId, trackingNumber })
    setNotesText('')
    setIsNotesLoading(true)

    const data = (await pakPassportApi.getNotes(applicationId)) as
      | { notes?: string }
      | null
    let loadedNotes = ''
    if (data && typeof data.notes === 'string') {
      loadedNotes = data.notes
      setNotesText(data.notes)
    }

    await markNotesRead(applicationId, loadedNotes, { silent: true })

    setIsNotesLoading(false)
  }

  const handleSaveNotes = async () => {
    if (!notesModal?.applicationId) {
      toast.error('No application selected for notes')
      return
    }

    setIsNotesSaving(true)
    const result = await pakPassportApi.saveNotes(
      notesModal.applicationId,
      notesText,
      currentUserId,
    )
    setIsNotesSaving(false)

    if (result.ok) {
      await markNotesRead(notesModal.applicationId, notesText, { silent: true })
      toast.success('Notes saved')
      setNotesModal(null)
      router.refresh()
      return
    }

    toast.error(result.error || 'Failed to save notes')
  }

  const { filteredApps, totalPages, startIdx, pageItems } = usePassportListFiltering({
    initialApplications,
    attentionMode,
    searchQuery,
    startDate,
    endDate,
    currentPage,
    pageSize,
    setCurrentPage,
  })

  useEffect(() => {
    const loadMetadata = async () => {
      try {
        const res = await fetch('/api/passports/pak/metadata', { credentials: 'include' })
        if (!res.ok) return
        const data = await res.json()

        if (data?.categories?.length) {
          setMetadata((prev) => ({ ...prev, categories: data.categories }))
        }
        if (data?.speeds?.length) {
          setMetadata((prev) => ({ ...prev, speeds: data.speeds }))
        }
        if (data?.applicationTypes?.length) {
          setMetadata((prev) => ({ ...prev, applicationTypes: data.applicationTypes }))
        }
        if (data?.pageCounts?.length) {
          setMetadata((prev) => ({ ...prev, pageCounts: data.pageCounts }))
        }
      } catch (error) {
        console.error('[PakPassportClient] Failed to load metadata', error)
      }
    }

    loadMetadata()
  }, [])

  useEffect(() => {
    Promise.resolve().then(() => {
      setFormData((prev) => ({
        ...prev,
        category: metadata.categories.includes(prev.category)
          ? prev.category
          : metadata.categories[0] || prev.category,
        speed: metadata.speeds.includes(prev.speed)
          ? prev.speed
          : metadata.speeds[0] || prev.speed,
        applicationType: metadata.applicationTypes.includes(prev.applicationType)
          ? prev.applicationType
          : metadata.applicationTypes[0] || prev.applicationType,
        pageCount: metadata.pageCounts.includes(prev.pageCount)
          ? prev.pageCount
          : metadata.pageCounts[0] || prev.pageCount,
      }))
    })
  }, [metadata])

  return (
    <div className="space-y-6">
      {attentionMode && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800">
          Attention mode is active: showing only records with status Passport Arrived.
        </div>
      )}

      <PassportsToolbar
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        startDate={startDate}
        setStartDate={setStartDate}
        endDate={endDate}
        setEndDate={setEndDate}
        showForm={showForm}
        setShowForm={setShowForm}
      />

      {/* NEW FORM */}
      {showForm && (
        <NewApplicationForm
          formData={formData}
          isSubmitting={isSubmitting}
          onChange={handleInputChange}
          onSubmit={handleSubmit}
          errors={formErrors}
          onBlur={() => {}}
          metadata={metadata}
        />
      )}

      <PassportsTable
        filteredAppsLength={filteredApps.length}
        pageItems={pageItems}
        onOpenEdit={openEditModal}
        onUpdateRecord={handleUpdateRecord}
        onViewHistory={handleViewHistory}
        onOpenArrival={handleOpenArrival}
        onGenerateReceipt={handleGenerateReceipt}
        onOpenReceiptHistory={(item) => {
          const applicant = getApplicantRecord(item)
          setReceiptHistoryApplicantId(applicant?.id || null)
        }}
        onManageDocuments={handleManageDocuments}
        onOpenNotes={handleOpenNotes}
        isNotesUnread={isPassportNotesUnread}
      />

      <ReceiptHistoryModal
        isOpen={!!receiptHistoryApplicantId}
        onClose={() => setReceiptHistoryApplicantId(null)}
        applicantId={receiptHistoryApplicantId}
        serviceType="pk_passport"
        title="PK Passport Receipt History"
      />

      <PassportsPagination
        filteredCount={filteredApps.length}
        startIdx={startIdx}
        pageSize={pageSize}
        currentPage={currentPage}
        totalPages={totalPages}
        onPrev={() => setCurrentPage((p) => Math.max(1, p - 1))}
        onNext={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
      />

      <EditModal
        open={!!editModal}
        onClose={() => setEditModal(false)}
        editFormData={editFormData}
        setEditFormData={setEditFormData}
        deleteAuthCode={deleteAuthCode}
        setDeleteAuthCode={setDeleteAuthCode}
        onSubmit={handleEditSubmit}
        onDelete={handleDelete}
      />

      <HistoryModal
        open={!!historyModal}
        onClose={() => setHistoryModal(null)}
        trackingNumber={historyModal?.trackingNumber}
        statusHistory={statusHistory}
      />

      <ArrivalModal
        open={!!arrivalModal}
        onClose={() => setArrivalModal(null)}
        newPassportNum={newPassportNum}
        setNewPassportNum={setNewPassportNum}
        onSave={handleSaveArrival}
      />

      <NotesModal
        open={!!notesModal}
        onClose={() => setNotesModal(null)}
        trackingNumber={notesModal?.trackingNumber}
        notes={notesText}
        setNotes={setNotesText}
        onSave={handleSaveNotes}
        onMarkUnread={async () => {
          if (!notesModal?.applicationId) return
          await markNotesUnread(notesModal.applicationId)
          toast.success('Marked as unread')
        }}
        canMarkUnread={Boolean(notesModal?.applicationId && getNoteSignature(notesText))}
        isSaving={isNotesSaving}
        isLoading={isNotesLoading}
      />
    </div>
  )
}
