'use client'

import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import RowItem from './components/RowItem'
import EditModal from './components/EditModal'
import HistoryModal from './components/HistoryModal'
import ArrivalModal from './components/ArrivalModal'
import NotesModal from './components/NotesModal'
import NewApplicationForm from './components/NewApplicationForm'
import { formatCNIC, getPassportRecord } from './components/utils'
import type { PakApplicationFormData, Application, ModalState, Metadata } from './components/types'
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

export default function PakPassportClient({ initialApplications, currentUserId }: PakPassportClientProps) {
  const router = useRouter()
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
  const [notesText, setNotesText] = useState('')
  const [isNotesLoading, setIsNotesLoading] = useState(false)
  const [isNotesSaving, setIsNotesSaving] = useState(false)
  const [statusHistory, setStatusHistory] = useState<StatusHistoryEntry[]>([])
  
  // Form Data
  const [formErrors, setFormErrors] = useState<PakApplicationFormErrors>({})
  const [editFormData, setEditFormData] = useState<Record<string, any>>({})
  const [deleteAuthCode, setDeleteAuthCode] = useState('')

  const [formData, setFormData] = useState<PakApplicationFormData>({
    applicantName: '', applicantCnic: '', applicantEmail: '',
    biometricsEmail: '',
    applicantPhone: '',
    familyHeadEmail: '',
    applicationType: 'Renewal', category: 'Adult 10 Year', pageCount: '34 pages', speed: 'Normal',
    trackingNumber: '', oldPassportNumber: '', fingerprintsCompleted: false
  })

  const [metadata, setMetadata] = useState<Metadata>({
    categories: ['Adult 10 Year', 'Adult 5 Year', 'Child 5 Year'],
    speeds: ['Normal', 'Executive'],
    applicationTypes: ['First Time', 'Renewal', 'Modification', 'Lost'],
    pageCounts: ['34 pages', '54 pages', '72 pages', '100 pages']
  })

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
    setFormErrors(prev => ({ ...prev, [name]: undefined }))
  }

  const handleSubmit = async () => {
    const parsed = PakApplicationFormSchema.safeParse(formData)
    if (!parsed.success) {
        const errors: PakApplicationFormErrors = {}
        parsed.error.issues.forEach(err => {
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
  const handleUpdateRecord = async (id: string, data: Record<string, any>) => {
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
    setEditFormData({
      id: item.id, // Application id
      passportId: pp?.id,
      applicantId: item.applicants?.id,
      applicantName: `${item.applicants?.first_name} ${item.applicants?.last_name}`,
      applicantCnic: item.applicants?.citizen_number,
      applicantEmail: item.applicants?.email || '',
      biometricsEmail: pp?.biometrics_email || '',
      applicantPhone: item.applicants?.phone_number || '',
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
     const data = await pakPassportApi.getStatusHistory(appId)
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
    if (!newPassportNum.trim()) {
      toast.error('Please enter a passport number')
      return
    }
    const result = await pakPassportApi.updateStatus(
      arrivalModal.passportId,
      'Passport Arrived',
      currentUserId,
      { newPassportNo: newPassportNum }
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

  const handleOpenNotes = async (applicationId: string, trackingNumber?: string) => {
    setNotesModal({ applicationId, trackingNumber })
    setNotesText('')
    setIsNotesLoading(true)

    const data = await pakPassportApi.getNotes(applicationId)
    if (data && typeof data.notes === 'string') {
      setNotesText(data.notes)
    }

    setIsNotesLoading(false)
  }

  const handleSaveNotes = async () => {
    if (!notesModal?.applicationId) {
      toast.error('No application selected for notes')
      return
    }

    setIsNotesSaving(true)
    const result = await pakPassportApi.saveNotes(notesModal.applicationId, notesText, currentUserId)
    setIsNotesSaving(false)

    if (result.ok) {
      toast.success('Notes saved')
      setNotesModal(null)
      router.refresh()
      return
    }

    toast.error(result.error || 'Failed to save notes')
  }

  const getCreatedAt = (item: Application) => {
    const pp = getPassportRecord(item)
    return item?.created_at || item?.applications?.created_at || pp?.created_at || 0
  }

  const sortedApps = [...initialApplications].sort((a: Application, b: Application) => {
    const ad = new Date(getCreatedAt(a) || 0).getTime()
    const bd = new Date(getCreatedAt(b) || 0).getTime()
    return bd - ad // newest first
  })

  const filteredApps = sortedApps.filter((item: Application) => {
    const matchesSearch = JSON.stringify(item).toLowerCase().includes(searchQuery.toLowerCase())
    
    if (!matchesSearch) return false
    
    // Date range filter
    if (startDate || endDate) {
      const itemDate = new Date(getCreatedAt(item))
      if (startDate && itemDate < new Date(startDate)) return false
      if (endDate) {
        const endDateTime = new Date(endDate)
        endDateTime.setHours(23, 59, 59, 999) // Include end date fully
        if (itemDate > endDateTime) return false
      }
    }
    
    return true
  })

  const totalPages = Math.ceil(filteredApps.length / pageSize) || 1
  const startIdx = (currentPage - 1) * pageSize
  const pageItems = filteredApps.slice(startIdx, startIdx + pageSize)

  useEffect(() => { setCurrentPage(1) }, [searchQuery, startDate, endDate])

  useEffect(() => {
    const loadMetadata = async () => {
      try {
        const res = await fetch('/api/passports/pak/metadata', { credentials: 'include' })
        if (!res.ok) return
        const data = await res.json()

        if (data?.categories?.length) {
          setMetadata(prev => ({ ...prev, categories: data.categories }))
        }
        if (data?.speeds?.length) {
          setMetadata(prev => ({ ...prev, speeds: data.speeds }))
        }
        if (data?.applicationTypes?.length) {
          setMetadata(prev => ({ ...prev, applicationTypes: data.applicationTypes }))
        }
        if (data?.pageCounts?.length) {
          setMetadata(prev => ({ ...prev, pageCounts: data.pageCounts }))
        }
      } catch (error) {
        console.error('[PakPassportClient] Failed to load metadata', error)
      }
    }

    loadMetadata()
  }, [])

  useEffect(() => {
    setFormData((prev) => ({
      ...prev,
      category: metadata.categories.includes(prev.category) ? prev.category : (metadata.categories[0] || prev.category),
      speed: metadata.speeds.includes(prev.speed) ? prev.speed : (metadata.speeds[0] || prev.speed),
      applicationType: metadata.applicationTypes.includes(prev.applicationType)
        ? prev.applicationType
        : (metadata.applicationTypes[0] || prev.applicationType),
      pageCount: metadata.pageCounts.includes(prev.pageCount) ? prev.pageCount : (metadata.pageCounts[0] || prev.pageCount)
    }))
  }, [metadata])

  return (
    <div className="space-y-6">
      {/* HEADER & SEARCH */}
      <div className="flex flex-col md:flex-row justify-between items-center gap-4">
        <div className="flex-grow w-full flex flex-col md:flex-row gap-3">
          <div className="relative flex-grow md:max-w-md">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
            <input 
              value={searchQuery} 
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search tracking, CNIC, or names..." 
              className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl shadow-sm outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
          <div className="flex gap-2 items-center">
            <input 
              type="date" 
              value={startDate} 
              onChange={e => setStartDate(e.target.value)}
              className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm"
              placeholder="From"
            />
            <span className="text-slate-400">to</span>
            <input 
              type="date" 
              value={endDate} 
              onChange={e => setEndDate(e.target.value)}
              className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm"
              placeholder="To"
            />
            {(startDate || endDate) && (
              <button 
                onClick={() => { setStartDate(''); setEndDate('') }}
                className="text-xs text-slate-500 hover:text-slate-700 underline"
              >
                Clear
              </button>
            )}
          </div>
        </div>
        <button 
          onClick={() => setShowForm(!showForm)}
          className="bg-green-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-green-700 shadow-md transition"
        >
          {showForm ? 'Close Form' : '+ New Application'}
        </button>
      </div>

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

      {/* MAIN TABLE */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
         <table className="w-full text-left border-collapse">
           <thead className="bg-slate-50 text-slate-500 text-[11px] uppercase tracking-wider font-bold border-b border-slate-200">
             <tr>
               <th scope="col" className="p-4">Applicant</th>
               <th scope="col" className="p-4">Tracking & Progress</th>
               <th scope="col" className="p-4 bg-blue-50/50 border-l border-r border-blue-100 w-56">Passports</th>
               <th scope="col" className="p-4">Details</th>
               <th scope="col" className="p-4 text-right">Actions</th>
             </tr>
           </thead>
            <tbody className="divide-y divide-slate-100">
             {filteredApps.length === 0 ? (
               <tr><td colSpan={5} className="p-12 text-center text-slate-400 italic" role="status" aria-live="polite">No records found. Try adjusting filters or add a new application.</td></tr>
             ) : (
                pageItems.map((item: any) => (
                  <RowItem
                    key={item.id}
                    item={item}
                    onOpenEdit={openEditModal}
                    onUpdateRecord={handleUpdateRecord}
                    onViewHistory={handleViewHistory}
                    onOpenArrival={handleOpenArrival}
                    onManageDocuments={handleManageDocuments}
                    onOpenNotes={handleOpenNotes}
                  />
                ))
             )}
           </tbody>
         </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between mt-4">
        <div className="text-xs text-slate-500">
          Showing {filteredApps.length === 0 ? 0 : startIdx + 1}-{Math.min(startIdx + pageSize, filteredApps.length)} of {filteredApps.length}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            className={`px-3 py-1 rounded border text-sm ${currentPage === 1 ? 'opacity-50 cursor-not-allowed' : 'hover:bg-slate-100'} `}
            type="button"
            aria-label="Previous page"
          >
            ← Previous
          </button>
          <span className="text-xs text-slate-600">Page {currentPage} of {totalPages}</span>
          <button
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            disabled={currentPage >= totalPages}
            className={`px-3 py-1 rounded border text-sm ${currentPage >= totalPages ? 'opacity-50 cursor-not-allowed' : 'hover:bg-slate-100'} `}
            type="button"
            aria-label="Next page"
          >
            Next →
          </button>
        </div>
      </div>

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
        isSaving={isNotesSaving}
        isLoading={isNotesLoading}
      />
    </div>
  )
}
