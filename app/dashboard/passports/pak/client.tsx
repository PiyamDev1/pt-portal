'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'

// Helper: Auto-format CNIC
const formatCNIC = (value: string) => {
  const digits = value.replace(/\D/g, '').slice(0, 13)
  if (digits.length <= 5) return digits
  if (digits.length <= 12) return `${digits.slice(0, 5)}-${digits.slice(5)}`
  return `${digits.slice(0, 5)}-${digits.slice(5, 12)}-${digits.slice(12, 13)}`
}

// Helper: Status Color Mapping
const getStatusColor = (status: string) => {
  switch (status) {
    case 'Collected': return 'bg-emerald-100 text-emerald-800 border-emerald-200'
    case 'Passport Arrived': return 'bg-indigo-100 text-indigo-800 border-indigo-200'
    case 'Processing': return 'bg-yellow-100 text-yellow-800 border-yellow-200'
    case 'Biometrics Taken': return 'bg-blue-100 text-blue-800 border-blue-200'
    case 'Pending Submission': return 'bg-gray-100 text-gray-800 border-gray-200'
    case 'Cancelled': return 'bg-red-100 text-red-800 border-red-200'
    default: return 'bg-amber-50 text-amber-800 border-amber-200'
  }
}

// Mini Vertical Stepper Component
const MiniTracking = ({ steps, currentStep }: { steps: any[], currentStep: number }) => {
  return (
    <div className="flex flex-col space-y-1">
      {steps.map((step: any, idx: number) => (
        <div key={idx} className="flex items-center space-x-2">
          <div className={`w-1.5 h-1.5 rounded-full ${idx <= currentStep ? 'bg-blue-600' : 'bg-gray-200'}`}></div>
          <span className={`text-[10px] uppercase tracking-wider ${idx <= currentStep ? 'text-gray-700 font-semibold' : 'text-gray-400'}`}>
            {step.status}
          </span>
        </div>
      ))}
    </div>
  )
}

// Normalize passport join (array vs object)
const getPassportRecord = (item: any) => {
  const value = item?.pakistani_passport_applications
  return Array.isArray(value) ? value[0] : value
}

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
  
  // Edit Form States
  const [editFormData, setEditFormData] = useState<any>({})
  const [deleteAuthCode, setDeleteAuthCode] = useState('')

  const [formData, setFormData] = useState({
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
      return
    }

    if (name === 'applicantCnic') value = formatCNIC(value)
    if (['trackingNumber', 'oldPassportNumber'].includes(name)) value = value.toUpperCase()
    
    setFormData({ ...formData, [name]: value })
  }

  const handleSubmit = async () => {
    if (!formData.applicantName || !formData.applicantCnic || !formData.trackingNumber) {
      toast.error('Name, CNIC, and Tracking Number are required')
      return
    }
    setIsSubmitting(true)
    try {
      const res = await fetch('/api/passports/pak/add-application', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, currentUserId })
      })
      if (res.ok) {
        toast.success('Passport application saved')
        setShowForm(false)
        setFormData({
          applicantName: '', applicantCnic: '', applicantEmail: '',
          applicationType: 'Renewal', category: 'Adult 10 Year', pageCount: '34 pages', speed: 'Normal',
          trackingNumber: '', oldPassportNumber: '', fingerprintsCompleted: false
        })
        router.refresh()
      } else {
        const d = await res.json().catch(() => null)
        toast.error(d?.error || d?.details || 'Failed to save')
      }
    } catch (e: any) { toast.error(e?.message || 'Network error') } 
    finally { setIsSubmitting(false) }
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
    try {
      const res = await fetch('/api/passports/pak/manage-record', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update',
          id: editFormData.id,
          data: editFormData,
          userId: currentUserId
        })
      })
      
      if (res.ok) {
        toast.success('Record updated successfully', { id: toastId })
        setEditModal(false)
        router.refresh()
      } else {
        const d = await res.json()
        toast.error(d?.error || 'Update failed', { id: toastId })
      }
    } catch (e) { toast.error('Error updating record', { id: toastId }) }
  }

  const handleDelete = async () => {
    if (!deleteAuthCode) return toast.error('Auth code is required')
    
    const toastId = toast.loading('Deleting record...')
    try {
      const res = await fetch('/api/passports/pak/manage-record', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'delete',
          id: editFormData.id,
          authCode: deleteAuthCode,
          userId: currentUserId
        })
      })
      
      if (res.ok) {
        toast.success('Record deleted permanently', { id: toastId })
        setEditModal(false)
        router.refresh()
      } else {
        const d = await res.json()
        toast.error(d?.error || 'Delete failed', { id: toastId })
      }
    } catch (e) { toast.error('Error deleting record', { id: toastId }) }
  }

  const handleViewHistory = async (applicationId: string, trackingNumber: string) => {
    try {
      const res = await fetch(`/api/passports/pak/status-history?applicationId=${applicationId}`)
      if (res.ok) {
        const data = await res.json()
        setStatusHistory(data.history || [])
        setHistoryModal({ applicationId, trackingNumber })
      } else { toast.error('Failed to load history') }
    } catch (e) { toast.error('Error loading history') }
  }
  
  const handleSaveNewPassport = async () => {
    if (!newPassportNum) return toast.error('Enter new passport number')
    const item = arrivalModal
    const ppId = getPassportRecord(item)?.id
    try {
      const res = await fetch('/api/passports/pak/update-custody', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passportId: ppId, action: 'record_new', newNumber: newPassportNum, userId: currentUserId })
      })
      if (res.ok) { toast.success('Recorded'); setArrivalModal(null); setNewPassportNum(''); router.refresh(); }
      else { toast.error('Failed'); }
    } catch(e) { toast.error('Error') }
  }

  const handleMarkCollected = async (passportId: string) => {
    const toastId = toast.loading('Marking as collected...')
    try {
      const res = await fetch('/api/passports/pak/update-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passportId, status: 'Collected', userId: currentUserId })
      })
      if (res.ok) { toast.success('Marked as collected', { id: toastId }); router.refresh(); }
      else { toast.error('Failed', { id: toastId }); }
    } catch (e) { toast.error('Error', { id: toastId }) }
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
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-xl animate-fade-in-down">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-5">
               <h4 className="text-xs font-black uppercase text-slate-400 tracking-widest border-b border-slate-100 pb-2">Applicant Information</h4>
               <input name="applicantName" onChange={handleInputChange} value={formData.applicantName} placeholder="Full Legal Name" className="w-full p-3 bg-slate-50 border-none rounded-lg text-sm focus:ring-2 focus:ring-green-500" />
               <input name="applicantCnic" onChange={handleInputChange} value={formData.applicantCnic} placeholder="CNIC (Auto-formatted)" className="w-full p-3 bg-slate-50 border-none rounded-lg text-sm font-mono focus:ring-2 focus:ring-green-500" />
               <input name="applicantEmail" onChange={handleInputChange} value={formData.applicantEmail} placeholder="Email Address" className="w-full p-3 bg-slate-50 border-none rounded-lg text-sm focus:ring-2 focus:ring-green-500" />
               
               <div className="flex items-center gap-3 bg-green-50 p-3 rounded-lg border border-green-100 mt-2">
                 <input type="checkbox" name="fingerprintsCompleted" checked={formData.fingerprintsCompleted} onChange={handleInputChange} className="h-5 w-5 text-green-600 rounded focus:ring-green-500 cursor-pointer" id="fp_check" />
                 <label htmlFor="fp_check" className="text-sm font-bold text-green-800 cursor-pointer">Biometrics Completed?</label>
               </div>
            </div>
            
            <div className="space-y-5">
               <h4 className="text-xs font-black uppercase text-slate-400 tracking-widest border-b border-slate-100 pb-2">Passport Specs</h4>
               <div className="grid grid-cols-2 gap-3">
                 <select name="applicationType" onChange={handleInputChange} className="p-3 bg-slate-50 border-none rounded-lg text-sm" value={formData.applicationType}><option value="First Time">First Time</option><option value="Renewal">Renewal</option><option value="Modification">Modification</option><option value="Lost">Lost</option></select>
                 <select name="speed" onChange={handleInputChange} className="p-3 bg-slate-50 border-none rounded-lg text-sm font-bold text-slate-700" value={formData.speed}><option value="Normal">Normal</option><option value="Executive">Executive</option></select>
                 <select name="category" onChange={handleInputChange} className="p-3 bg-slate-50 border-none rounded-lg text-sm" value={formData.category}><option value="Adult 10 Year">Adult 10 Year</option><option value="Adult 5 Year">Adult 5 Year</option><option value="Child 5 Year">Child 5 Year</option></select>
                 <select name="pageCount" onChange={handleInputChange} className="p-3 bg-slate-50 border-none rounded-lg text-sm" value={formData.pageCount}><option value="34 pages">34 pages</option><option value="54 pages">54 pages</option><option value="72 pages">72 pages</option><option value="100 pages">100 pages</option></select>
               </div>
               <input name="oldPassportNumber" onChange={handleInputChange} value={formData.oldPassportNumber} placeholder="Old Passport #" className="w-full p-3 bg-slate-50 border-none rounded-lg text-sm font-mono uppercase" />
               <input name="trackingNumber" onChange={handleInputChange} value={formData.trackingNumber} placeholder="Tracking ID (Required)" className="w-full p-3 bg-slate-50 border-none rounded-lg text-sm font-mono uppercase font-bold text-slate-700" />
            </div>
          </div>
          <button onClick={handleSubmit} disabled={isSubmitting} className="w-full mt-8 bg-slate-900 text-white py-4 rounded-xl font-bold hover:bg-black transition shadow-lg">
             {isSubmitting ? 'Saving Application...' : 'Save Application to Ledger'}
          </button>
        </div>
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
                filteredApps.map((item: any) => {
                   const pp = getPassportRecord(item)
                   if (!pp) return null
                   const steps = getTrackingSteps(pp)
                   const currentStep = getCurrentStepIndex(pp)
                   
                   return (
                     <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                       <td className="p-5">
                         <div className="font-bold text-base text-slate-800">{item.applicants?.first_name} {item.applicants?.last_name}</div>
                         <div className="text-xs text-slate-500 font-mono mt-1">{item.applicants?.citizen_number}</div>
                       </td>
                       <td className="p-5">
                         <div className="flex flex-col gap-1.5">
                           <span className="font-bold text-slate-700">{pp.application_type}</span>
                           {pp.speed === 'Executive' ? (
                             <span className="text-[10px] bg-purple-100 text-purple-700 px-2 py-0.5 rounded font-bold border border-purple-200 w-fit">Executive</span>
                           ) : (
                             <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-medium border border-slate-200 w-fit">Normal</span>
                           )}
                           <div className="text-xs text-slate-500">{pp.category} • {pp.page_count}</div>
                         </div>
                       </td>
                       <td className="p-5">
                         <MiniTracking steps={steps} currentStep={currentStep} />
                       </td>
                       <td className="p-5 bg-blue-50/30 border-l border-r border-blue-100">
                         <div className="space-y-3">
                           <div>
                             <label className="text-[10px] text-slate-500 uppercase font-bold block mb-1">New Passport #</label>
                             {pp.new_passport_number ? (
                               <div className="font-mono text-sm font-bold text-slate-700 bg-white px-2 py-1.5 rounded border border-slate-200">
                                 {pp.new_passport_number}
                               </div>
                             ) : (
                               <button
                                 onClick={() => setArrivalModal(item)}
                                 className="w-full text-left px-2 py-1.5 text-sm border border-dashed border-slate-300 rounded text-slate-400 hover:border-blue-400 hover:text-blue-600 transition bg-white"
                               >
                                 Enter Number
                               </button>
                             )}
                           </div>
                           <div className="flex items-center">
                            <input
                              type="checkbox"
                              checked={pp.status === 'Collected'}
                              onChange={(e) => {
                                if (!pp.new_passport_number) {
                                  toast.error('Enter new passport number first')
                                  return
                                }
                                handleMarkCollected(pp.id)
                              }}
                              disabled={!pp.new_passport_number}
                              id={`collected-${pp.id}`}
                              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                            />
                             <label htmlFor={`collected-${pp.id}`} className={`ml-2 text-sm cursor-pointer ${!pp.new_passport_number ? 'text-slate-400' : 'text-slate-700'}`}>
                               Collected by Customer
                             </label>
                           </div>
                         </div>
                       </td>
                       <td className="p-5 text-center">
                         <div className="flex flex-col items-center gap-2">
                           <span className={`text-[10px] font-bold uppercase rounded-md py-1 px-2 border ${getStatusColor(pp.status)}`}>
                             {pp.status || 'Pending'}
                           </span>
                           <button onClick={() => handleViewHistory(item.id, item.tracking_number)} className="text-xs text-blue-600 hover:text-blue-700 font-medium">
                             View History
                           </button>
                         </div>
                       </td>
                       <td className="p-5 text-right">
                         <div className="flex justify-end gap-2">
                            <button 
                              onClick={() => openEditModal(item)}
                              className="w-8 h-8 flex items-center justify-center rounded-lg bg-white border border-slate-200 text-slate-400 hover:text-blue-600 hover:border-blue-200 transition shadow-sm"
                              title="Edit Record"
                            >
                              ✏️
                            </button>
                         </div>
                       </td>
                     </tr>
                   )
                })
             )}
           </tbody>
         </table>
      </div>

      {/* EDIT MODAL */}
      {editModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in">
           <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh]">
              <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                 <h3 className="font-bold text-lg text-slate-800">Edit Application</h3>
                 <button onClick={() => setEditModal(false)} className="text-slate-400 hover:text-slate-600">✕</button>
              </div>
              
              <div className="p-6 overflow-y-auto space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                     <div className="col-span-2">
                        <label className="text-[10px] uppercase font-bold text-slate-400">Applicant Name</label>
                        <input className="w-full p-2 border rounded text-sm" value={editFormData.applicantName || ''} onChange={e => setEditFormData({...editFormData, applicantName: e.target.value})} />
                     </div>
                     <div>
                        <label className="text-[10px] uppercase font-bold text-slate-400">CNIC</label>
                        <input 
                          className="w-full p-2 border rounded text-sm font-mono bg-gray-100 text-gray-500 cursor-not-allowed" 
                          value={editFormData.applicantCnic || ''} 
                          disabled={true}
                          title="Citizen Number cannot be changed"
                        />
                     </div>
                     <div>
                        <label className="text-[10px] uppercase font-bold text-slate-400">Tracking #</label>
                        <input className="w-full p-2 border rounded text-sm font-mono" value={editFormData.trackingNumber || ''} onChange={e => setEditFormData({...editFormData, trackingNumber: e.target.value.toUpperCase()})} />
                     </div>
                     <div>
                        <label className="text-[10px] uppercase font-bold text-slate-400">Old Passport #</label>
                        <input className="w-full p-2 border rounded text-sm font-mono" value={editFormData.oldPassportNumber || ''} onChange={e => setEditFormData({...editFormData, oldPassportNumber: e.target.value.toUpperCase()})} />
                     </div>
                     <div>
                        <label className="text-[10px] uppercase font-bold text-slate-400">Speed</label>
                        <select className="w-full p-2 border rounded text-sm" value={editFormData.speed || 'Normal'} onChange={e => setEditFormData({...editFormData, speed: e.target.value})}>
                           <option>Normal</option><option>Executive</option>
                        </select>
                     </div>
                  </div>

                  <div className="flex items-center gap-3 bg-blue-50 p-3 rounded-lg border border-blue-100">
                    <input
                      type="checkbox"
                      checked={editFormData.fingerprintsCompleted || false}
                      onChange={e => setEditFormData({...editFormData, fingerprintsCompleted: e.target.checked})}
                      className="h-5 w-5 text-blue-600 rounded focus:ring-blue-500 cursor-pointer"
                      id="edit_fp_check"
                    />
                    <label htmlFor="edit_fp_check" className="text-sm font-bold text-blue-800 cursor-pointer">Biometrics Completed?</label>
                  </div>

                  <button onClick={handleEditSubmit} className="w-full py-3 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 transition">
                     Update Record
                  </button>

                  <div className="border-t border-red-100 pt-6 mt-6">
                     <div className="bg-red-50 p-4 rounded-xl border border-red-100">
                        <h4 className="text-xs font-bold text-red-700 uppercase mb-2">Danger Zone</h4>
                        <p className="text-xs text-red-600 mb-3">Enter auth code to permanently delete this record.</p>
                        <div className="flex gap-2">
                           <input 
                             type="password" 
                             placeholder="Auth Code" 
                             className="flex-1 p-2 border border-red-200 rounded text-sm bg-white"
                             value={deleteAuthCode}
                             onChange={e => setDeleteAuthCode(e.target.value)}
                           />
                           <button onClick={handleDelete} className="bg-white text-red-600 border border-red-200 px-4 py-2 rounded font-bold hover:bg-red-600 hover:text-white transition">
                             Delete
                           </button>
                        </div>
                     </div>
                  </div>
              </div>
           </div>
        </div>
      )}

      {/* ARRIVAL MODAL */}
      {arrivalModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
           <div className="bg-white p-6 rounded-xl shadow-2xl w-full max-w-sm">
              <h3 className="font-bold text-lg text-slate-800 mb-2">New Passport Arrived</h3>
              <input className="w-full p-3 border rounded-lg font-mono text-lg mb-4 uppercase" placeholder="New Passport #" autoFocus value={newPassportNum} onChange={e => setNewPassportNum(e.target.value.toUpperCase())} />
              <div className="flex gap-2"><button onClick={() => setArrivalModal(null)} className="flex-1 py-2 text-slate-500 font-bold">Cancel</button><button onClick={handleSaveNewPassport} className="flex-1 py-2 bg-blue-600 text-white font-bold rounded">Save</button></div>
           </div>
        </div>
      )}

      {/* STATUS HISTORY MODAL - Timeline View */}
      {historyModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
           <div className="bg-white p-6 rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-y-auto">
              <h3 className="font-bold text-xl text-slate-800 mb-1">Status Timeline</h3>
              <p className="text-sm text-slate-500 mb-6">Tracking: <span className="font-mono font-bold text-slate-700">{historyModal.trackingNumber}</span></p>
              
              {statusHistory.length === 0 ? (
                <p className="text-center text-slate-400 py-8">No status updates recorded yet.</p>
              ) : (
                <div className="relative">
                  <div className="absolute left-6 top-3 bottom-3 w-0.5 bg-slate-200"></div>
                  
                  <div className="space-y-6">
                    {statusHistory.map((entry: any, idx: number) => (
                      <div key={entry.id || idx} className="relative pl-16">
                        <div className={`absolute left-4 top-1 w-5 h-5 rounded-full border-4 border-white shadow-md ${
                          idx === 0 ? 'bg-green-500' : 'bg-blue-400'
                        }`}></div>
                        
                        <div className="bg-slate-50 rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow">
                          <div className="flex items-start justify-between mb-2">
                            <div>
                              <div className="font-bold text-lg text-slate-800">{entry.status}</div>
                              {entry.description && (
                                <div className="text-sm text-slate-600 mt-1">{entry.description}</div>
                              )}
                            </div>
                            {idx === 0 && (
                              <span className="bg-green-100 text-green-700 text-xs font-bold px-2 py-1 rounded-full">Current</span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 text-xs text-slate-500">
                            {entry.changed_by && (
                              <span className="flex items-center gap-1">
                                <span className="font-medium text-slate-700">👤 {entry.changed_by}</span>
                              </span>
                            )}
                            <span className="flex items-center gap-1">
                              <span>🕒</span>
                              <span>{entry.date ? new Date(entry.date).toLocaleString() : 'Unknown time'}</span>
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              <button onClick={() => setHistoryModal(null)} className="w-full mt-6 py-3 bg-slate-800 text-white font-bold rounded-lg hover:bg-slate-900 transition">
                Close
              </button>
           </div>
        </div>
      )}
    </div>
  )
}
