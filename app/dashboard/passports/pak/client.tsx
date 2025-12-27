'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import RowItem from './components/RowItem'
import EditModal from './components/EditModal'
import HistoryModal from './components/HistoryModal'
import ArrivalModal from './components/ArrivalModal'
import NewApplicationForm from './components/NewApplicationForm'
import { formatCNIC, getPassportRecord } from './components/utils'
import type { PakApplicationFormData } from './components/types'
import { PakApplicationFormSchema } from './components/schemas'
import type { PakApplicationFormErrors } from './components/schemas'
import { pakPassportApi } from './components/api'

export default function PakPassportClient({ initialApplications, currentUserId }: any) {
  const router = useRouter()
  const [showForm, setShowForm] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  
  // Modals
  const [historyModal, setHistoryModal] = useState<any>(null)
  const [editModal, setEditModal] = useState<any>(null)
  const [arrivalModal, setArrivalModal] = useState<any>(null)
  const [newPassportNum, setNewPassportNum] = useState('')
  const [statusHistory, setStatusHistory] = useState<any[]>([])
  
  // Form Data
  const [formErrors, setFormErrors] = useState<PakApplicationFormErrors>({})
  const [editFormData, setEditFormData] = useState<any>({})
  const [deleteAuthCode, setDeleteAuthCode] = useState('')

  const [formData, setFormData] = useState<PakApplicationFormData>({
    applicantName: '', applicantCnic: '', applicantEmail: '',
    applicationType: 'Renewal', category: 'Adult 10 Year', pageCount: '34 pages', speed: 'Normal',
    trackingNumber: '', oldPassportNumber: '', fingerprintsCompleted: false
  })

  // --- HANDLERS ---
  const handleInputChange = (e: any) => {
    let { name, value, type, checked } = e.target
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
        toast.error('Please fix validation errors')
        return
    }
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
  const handleUpdateRecord = async (id: string, data: any) => {
    // This is used by RowItem to save Passport #, Collection status, etc.
    const result = await pakPassportApi.updateStatus(id, data.status, currentUserId, data)
    if (result.ok) {
        toast.success('Record Updated')
        router.refresh()
    } else {
        toast.error(result.error || 'Update Failed')
    }
  }

  const openEditModal = (item: any) => {
    const pp = getPassportRecord(item)
    setEditFormData({
      id: pp?.id, // Use the passport ID specifically
      applicantId: item.applicants?.id,
      applicantName: `${item.applicants?.first_name} ${item.applicants?.last_name}`,
      applicantCnic: item.applicants?.citizen_number,
      trackingNumber: item.tracking_number,
      applicationType: pp?.application_type,
      category: pp?.category,
      speed: pp?.speed,
      status: pp?.status,
      // Add other fields as needed for your EditModal
    })
    setEditModal(true)
  }

  const handleEditSubmit = async () => {
    // Implement your edit logic here calling pakPassportApi.updateRecord
    toast.info("Save logic implemented in API")
    setEditModal(false) 
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

  const handleOpenArrival = (item: any) => {
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
             className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl shadow-sm outline-none focus:ring-2 focus:ring-green-500"
           />
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
        />
      )}

      {/* MAIN TABLE */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
         <table className="w-full text-left border-collapse">
           <thead className="bg-slate-50 text-slate-500 text-[11px] uppercase tracking-wider font-bold border-b border-slate-200">
             <tr>
               <th className="p-4">Applicant</th>
               <th className="p-4">Tracking & Progress</th>
               <th className="p-4 bg-blue-50/50 border-l border-r border-blue-100">Passports</th>
               <th className="p-4">Details</th>
               <th className="p-4 text-center">Status</th>
               <th className="p-4 text-right">Actions</th>
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
                    onUpdateRecord={handleUpdateRecord}
                    onViewHistory={handleViewHistory}
                    onOpenArrival={handleOpenArrival}
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
    </div>
  )
}
