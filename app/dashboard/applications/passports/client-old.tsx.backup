'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import MiniTracking from './components/MiniTracking'
import RowItem from './components/RowItem'
import EditModal from './components/EditModal'
import ArrivalModal from './components/ArrivalModal'
import HistoryModal from './components/HistoryModal'
import NewApplicationForm from './components/NewApplicationForm'
import { formatCNIC, getStatusColor, getPassportRecord, getTrackingSteps, getCurrentStepIndex } from './components/utils'
import type { PakApplicationFormData } from './components/types'
import { PakApplicationFormSchema } from './components/schemas'
import type { PakApplicationFormErrors } from './components/schemas'
import { pakPassportApi } from './components/api'

export default function PakPassportClient({ initialApplications, currentUserId }: any) {
  const router = useRouter()
  const [showForm, setShowForm] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  
  // Modals State
  const [arrivalModal, setArrivalModal] = useState<any>(null)
  const [historyModal, setHistoryModal] = useState<any>(null)
  const [editModal, setEditModal] = useState<any>(null)
  
  // Data States
  const [newPassportNum, setNewPassportNum] = useState('')
  const [statusHistory, setStatusHistory] = useState<any[]>([])
  const [formErrors, setFormErrors] = useState<PakApplicationFormErrors>({})
  
  // Edit Form States
  const [editFormData, setEditFormData] = useState<any>({})
  const [deleteAuthCode, setDeleteAuthCode] = useState('')

  const [formData, setFormData] = useState<PakApplicationFormData>({
    applicantName: '', applicantCnic: '', applicantEmail: '',
    applicationType: 'Renewal', 
    category: 'Adult 10 Year',
    pageCount: '34 pages',
    speed: 'Normal',
    trackingNumber: '',
    oldPassportNumber: '',
    fingerprintsCompleted: false
  })

  // Tracking workflow helper functions
  const getTrackingSteps = (pp: any) => {
    return [
      { status: 'Pending', completed: pp?.status !== 'Pending Submission' },
      { status: 'Biometrics', completed: pp?.fingerprints_completed },
      { status: 'Processing', completed: ['Processing', 'Passport Arrived', 'Collected'].includes(pp?.status) },
      { status: 'Arrived', completed: !!pp?.new_passport_number },
      { status: 'Collected', completed: pp?.status === 'Collected' }
    ]
  }

  const getCurrentStepIndex = (pp: any) => {
    if (pp?.status === 'Collected') return 4
    if (pp?.new_passport_number) return 3
    if (['Processing', 'Passport Arrived'].includes(pp?.status)) return 2
    if (pp?.fingerprints_completed) return 1
    return 0
  }

  // --- HANDLERS ---
  const handleInputChange = (e: any) => {
    let { name, value, type, checked } = e.target
    
    if (type === 'checkbox') {
      setFormData({ ...formData, [name]: checked })
      setFormErrors(prev => ({ ...prev, [name]: undefined }))
      return
    }

    if (name === 'applicantCnic') value = formatCNIC(value)
    if (['trackingNumber', 'oldPassportNumber'].includes(name)) value = value.toUpperCase()
    
    setFormData({ ...formData, [name]: value })
    setFormErrors(prev => ({ ...prev, [name]: undefined }))
  }

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const { name } = e.target
    const fieldSchema = PakApplicationFormSchema.shape[name as keyof PakApplicationFormData]
    if (!fieldSchema) return

    const result = fieldSchema.safeParse(formData[name as keyof PakApplicationFormData])
    if (!result.success) {
      setFormErrors(prev => ({ ...prev, [name]: result.error.issues[0]?.message }))
    }
  }

  const handleSubmit = async () => {
    const parsed = PakApplicationFormSchema.safeParse(formData)
    if (!parsed.success) {
      const fieldErrors: PakApplicationFormErrors = {}
      parsed.error.issues.forEach(issue => {
        const key = issue.path[0] as keyof PakApplicationFormData
        fieldErrors[key] = issue.message
      })
      setFormErrors(fieldErrors)
      toast.error('Please fix the highlighted errors')
      return
    }
    setIsSubmitting(true)
    const result = await pakPassportApi.addApplication({ ...formData, currentUserId })
    setIsSubmitting(false)

    if (result.ok) {
      toast.success('Passport application saved')
      setShowForm(false)
      setFormData({
        applicantName: '', applicantCnic: '', applicantEmail: '',
        applicationType: 'Renewal', category: 'Adult 10 Year', pageCount: '34 pages', speed: 'Normal',
        trackingNumber: '', oldPassportNumber: '', fingerprintsCompleted: false
      })
      setFormErrors({})
      router.refresh()
    } else {
      toast.error(result.error || 'Failed to save')
    }
  }

  // --- EDIT & DELETE HANDLERS ---
  const openEditModal = (item: any) => {
    const pp = getPassportRecord(item)
    setEditFormData({
      id: item.id,
      applicantId: item.applicants?.id,
      applicantName: `${item.applicants?.first_name} ${item.applicants?.last_name}`,
      applicantCnic: item.applicants?.citizen_number,
      applicantEmail: item.applicants?.email || '',
      trackingNumber: item.tracking_number,
      
      applicationType: pp?.application_type,
      category: pp?.category,
      pageCount: pp?.page_count,
      speed: pp?.speed,
      oldPassportNumber: pp?.old_passport_number || '',
      fingerprintsCompleted: pp?.fingerprints_completed || false
    })
    setDeleteAuthCode('')
    setEditModal(true)
  }

  const handleEditSubmit = async () => {
    const toastId = toast.loading('Updating record...')
    const result = await pakPassportApi.updateRecord(editFormData.id, editFormData, currentUserId)
    
    if (result.ok) {
      toast.success('Record updated successfully', { id: toastId })
      setEditModal(false)
      router.refresh()
    } else {
      toast.error(result.error || 'Update failed', { id: toastId })
    }
  }

  const handleDelete = async () => {
    if (!deleteAuthCode) return toast.error('Auth code is required')
    
    const toastId = toast.loading('Deleting record...')
    const result = await pakPassportApi.deleteRecord(editFormData.id, deleteAuthCode, currentUserId)
    
    if (result.ok) {
      toast.success('Record deleted permanently', { id: toastId })
      setEditModal(false)
      router.refresh()
    } else {
      toast.error(result.error || 'Delete failed', { id: toastId })
    }
  }

  const handleViewHistory = async (applicationId: string, trackingNumber: string) => {
    const data = await pakPassportApi.getStatusHistory(applicationId)
    if (data) {
      setStatusHistory(data.history || [])
      setHistoryModal({ applicationId, trackingNumber })
    } else {
      toast.error('Failed to load history')
    }
  }
  
  const handleSaveNewPassport = async () => {
    if (!newPassportNum) return toast.error('Enter new passport number')
    const item = arrivalModal
    const ppId = getPassportRecord(item)?.id
    const result = await pakPassportApi.updateCustody(ppId, 'record_new', currentUserId, newPassportNum)
    
    if (result.ok) {
      toast.success('Recorded')
      setArrivalModal(null)
      setNewPassportNum('')
      router.refresh()
    } else {
      toast.error(result.error || 'Failed')
    }
  }

  const handleMarkCollected = async (passportId: string) => {
    const toastId = toast.loading('Marking as collected...')
    const result = await pakPassportApi.updateStatus(passportId, 'Collected', currentUserId)
    
    if (result.ok) {
      toast.success('Marked as collected', { id: toastId })
      router.refresh()
    } else {
      toast.error(result.error || 'Failed', { id: toastId })
    }
  }

  const handleReturnCustody = async (passportId: string) => {
    if (!confirm('Confirm return of Old Passport?')) return
    const toastId = toast.loading('Updating custody...')
    const result = await pakPassportApi.updateCustody(passportId, 'return_old', currentUserId)
    
    if (result.ok) {
      toast.success('Custody updated', { id: toastId })
      router.refresh()
    } else {
      toast.error(result.error || 'Failed', { id: toastId })
    }
  }

  const handleToggleFingerprints = async (passportId: string, currentStatus: boolean) => {
    const toastId = toast.loading('Updating...')
    const result = await pakPassportApi.updateCustody(passportId, 'toggle_fingerprints', currentUserId)
    
    if (result.ok) {
      toast.success('Updated', { id: toastId })
      router.refresh()
    } else {
      toast.error(result.error || 'Failed', { id: toastId })
    }
  }

  const handleStatusChange = async (passportId: string, newStatus: string) => {
    const toastId = toast.loading('Updating status...')
    const result = await pakPassportApi.updateStatus(passportId, newStatus, currentUserId)
    
    if (result.ok) {
      toast.success('Status updated', { id: toastId })
      router.refresh()
    } else {
      toast.error(result.error || 'Failed', { id: toastId })
    }
  }

  const filteredApps = initialApplications.filter((item: any) => 
    JSON.stringify(item).toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div className="space-y-6">
      {/* HEADER & SEARCH */}
      <div className="flex flex-col md:flex-row justify-between items-center gap-4">
        <div className="relative flex-grow w-full md:max-w-md">
           <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
           <input 
             value={searchQuery} 
             onChange={e => setSearchQuery(e.target.value)}
             placeholder="Search tracking, CNIC, or names..." 
             className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl shadow-sm focus:ring-2 focus:ring-green-500 outline-none transition"
           />
        </div>
        <button 
          onClick={() => setShowForm(!showForm)}
          className="w-full md:w-auto bg-green-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-green-700 shadow-md shadow-green-200 transition flex items-center justify-center gap-2"
        >
          {showForm ? 'Close Form' : '+ New Application'}
        </button>
      </div>

      {/* CREATE FORM */}
      {showForm && (
        <NewApplicationForm
          formData={formData}
          isSubmitting={isSubmitting}
          onChange={handleInputChange}
          onBlur={handleBlur}
          onSubmit={handleSubmit}
          errors={formErrors}
        />
      )}

      {/* LEDGER TABLE */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
         <table className="w-full text-left border-collapse">
           <thead className="bg-slate-50 text-slate-500 text-[11px] uppercase tracking-wider font-bold border-b border-slate-200">
             <tr>
               <th className="p-5">Applicant</th>
               <th className="p-5">Passport Details</th>
               <th className="p-5 w-48">Tracking History</th>
               <th className="p-5 bg-blue-50/50 border-l border-r border-blue-100 w-56">Arrival & Collection</th>
               <th className="p-5 text-center">Current Status</th>
               <th className="p-5 text-right">Actions</th>
             </tr>
           </thead>
           <tbody className="divide-y divide-slate-100">
             {filteredApps.length === 0 ? (
                <tr><td colSpan={6} className="p-12 text-center text-slate-400 italic">No records found.</td></tr>
             ) : (
                filteredApps.map((item: any) => (
                  <RowItem
                    key={item.id}
                    item={item}
                    onOpenEdit={openEditModal}
                    onOpenArrival={setArrivalModal}
                    onViewHistory={handleViewHistory}
                    onStatusChange={handleStatusChange}
                    onToggleFingerprints={handleToggleFingerprints}
                    onReturnCustody={handleReturnCustody}
                    onMarkCollected={handleMarkCollected}
                  />
                ))
             )}
           </tbody>
         </table>
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

      <ArrivalModal
        open={!!arrivalModal}
        onClose={() => setArrivalModal(null)}
        newPassportNum={newPassportNum}
        setNewPassportNum={setNewPassportNum}
        onSave={handleSaveNewPassport}
      />

      <HistoryModal
        open={!!historyModal}
        onClose={() => setHistoryModal(null)}
        trackingNumber={historyModal?.trackingNumber}
        statusHistory={statusHistory}
      />
    </div>
  )
}
