'use client'
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
  
  // New Passport Arrival State
  const [arrivalModal, setArrivalModal] = useState<any>(null)
  const [newPassportNum, setNewPassportNum] = useState('')

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

  // --- LOGIC: FLAT LIST (No Grouping) ---
  const filteredApps = initialApplications.filter((item: any) => 
    JSON.stringify(item).toLowerCase().includes(searchQuery.toLowerCase())
  )

  // Status history and fingerprints
  const [historyModal, setHistoryModal] = useState<any>(null)
  const [statusHistory, setStatusHistory] = useState<any[]>([])

  const handleReturnCustody = async (passportId: string) => {
    if (!confirm('Confirm you are handing over the Old Passport to the customer? This action is logged.')) return
    const toastId = toast.loading('Updating custody record...')
    try {
      const res = await fetch('/api/passports/pak/update-custody', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passportId, action: 'return_old', userId: currentUserId })
      })
      if (res.ok) {
        toast.success('Custody updated: Returned to Customer', { id: toastId })
        router.refresh()
      } else {
        const d = await res.json().catch(() => null)
        toast.error(d?.error || 'Failed to update custody', { id: toastId })
      }
    } catch (e: any) { toast.error(e?.message || 'Error', { id: toastId }) }
  }

  const handleToggleFingerprints = async (passportId: string, currentStatus: boolean) => {
    const toastId = toast.loading('Updating biometrics...')
    try {
      const res = await fetch('/api/passports/pak/update-custody', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passportId, action: 'toggle_fingerprints', userId: currentUserId })
      })
      if (res.ok) {
        toast.success(currentStatus ? 'Biometrics marked incomplete' : 'Biometrics marked complete', { id: toastId })
        router.refresh()
      } else {
        const d = await res.json().catch(() => null)
        toast.error(d?.error || 'Failed to update biometrics', { id: toastId })
      }
    } catch (e: any) { toast.error(e?.message || 'Error', { id: toastId }) }
  }

  const handleViewHistory = async (applicationId: string, trackingNumber: string) => {
    try {
      const res = await fetch(`/api/passports/pak/status-history?applicationId=${applicationId}`)
      if (res.ok) {
        const data = await res.json()
        setStatusHistory(data.history || [])
        setHistoryModal({ applicationId, trackingNumber })
      } else {
        toast.error('Failed to load status history')
      }
    } catch (e: any) {
      toast.error('Error loading history')
    }
  }
  
  const handleSaveNewPassport = async () => {
    if (!newPassportNum) return toast.error('Enter the new passport number')
    const ppId = Array.isArray(arrivalModal?.pakistani_passport_applications) ? arrivalModal.pakistani_passport_applications[0]?.id : arrivalModal?.pakistani_passport_applications?.id
    try {
      const res = await fetch('/api/passports/pak/update-custody', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passportId: ppId, action: 'record_new', newNumber: newPassportNum, userId: currentUserId })
      })
      if (res.ok) {
        toast.success('New Passport Recorded')
        setArrivalModal(null)
        setNewPassportNum('')
        router.refresh()
      } else {
        const d = await res.json().catch(() => null)
        toast.error(d?.error || 'Failed to save')
      }
    } catch(e: any) { toast.error(e?.message || 'Error saving') }
  }

  return (
    <div className="space-y-6">
      {/* SEARCH BAR */}
      <div className="flex justify-between items-center gap-4">
        <div className="relative flex-grow max-w-lg">
           <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
           <input 
             value={searchQuery} 
             onChange={e => setSearchQuery(e.target.value)}
             placeholder="Search applicants, tracking, or passports..." 
             className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-lg shadow-sm"
           />
        </div>
        <button 
          onClick={() => setShowForm(!showForm)}
          className="bg-green-600 text-white px-6 py-3 rounded-lg font-bold hover:bg-green-700 shadow-sm transition flex items-center gap-2"
        >
          {showForm ? 'Close Form' : '+ New Application'}
        </button>
      </div>

      {/* CREATE FORM (No Family Head) */}
      {showForm && (
        <div className="bg-white p-6 rounded-xl border-t-4 border-green-600 shadow-xl animate-fade-in-down">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-4">
               <h4 className="text-xs font-black uppercase text-slate-400 tracking-widest">1. Applicant Details</h4>
               <input name="applicantName" onChange={handleInputChange} value={formData.applicantName} placeholder="Full Name" className="w-full p-2 border rounded text-sm" />
               <input name="applicantCnic" onChange={handleInputChange} value={formData.applicantCnic} placeholder="CNIC (Auto-formatted)" className="w-full p-2 border rounded text-sm font-mono" />
               <input name="applicantEmail" onChange={handleInputChange} value={formData.applicantEmail} placeholder="Email Address" className="w-full p-2 border rounded text-sm" />
               
               {/* FINGERPRINTS TOGGLE */}
               <div className="flex items-center gap-3 bg-slate-50 p-3 rounded border border-slate-200 mt-2">
                 <input 
                   type="checkbox" 
                   name="fingerprintsCompleted" 
                   checked={formData.fingerprintsCompleted} 
                   onChange={handleInputChange} 
                   className="h-5 w-5 text-green-600 rounded focus:ring-green-500 cursor-pointer"
                   id="fp_check"
                 />
                 <label htmlFor="fp_check" className="text-sm font-bold text-slate-700 cursor-pointer">
                   Biometrics / Fingerprints Completed?
                 </label>
               </div>
            </div>
            
            <div className="space-y-4">
               <h4 className="text-xs font-black uppercase text-slate-400 tracking-widest">2. Passport Specs</h4>
              <div className="grid grid-cols-2 gap-3">
                <select name="applicationType" onChange={handleInputChange} className="p-2 border rounded text-sm" value={formData.applicationType}>
                  <option value="First Time">First Time</option>
                  <option value="Renewal">Renewal</option>
                  <option value="Modification">Modification</option>
                  <option value="Lost">Lost</option>
                </select>
                <select name="speed" onChange={handleInputChange} className="p-2 border rounded text-sm font-bold text-amber-600" value={formData.speed}>
                  <option value="Normal">Normal</option>
                  <option value="Executive">Executive</option>
                </select>
                <select name="category" onChange={handleInputChange} className="p-2 border rounded text-sm" value={formData.category}>
                  <option value="Adult 5 Year">Adult 5 Year</option>
                  <option value="Adult 10 Year">Adult 10 Year</option>
                  <option value="Child 5 Year">Child 5 Year</option>
                </select>
                <select name="pageCount" onChange={handleInputChange} className="p-2 border rounded text-sm" value={formData.pageCount}>
                  <option value="34 pages">34 pages</option>
                  <option value="54 pages">54 pages</option>
                  <option value="72 pages">72 pages</option>
                  <option value="100 pages">100 pages</option>
                </select>
              </div>
               
               <input name="oldPassportNumber" onChange={handleInputChange} value={formData.oldPassportNumber} placeholder="Old Passport Number (Required for Renewal)" className="w-full p-2 border border-amber-200 bg-amber-50 rounded text-sm font-mono" />
               <input name="trackingNumber" onChange={handleInputChange} value={formData.trackingNumber} placeholder="Tracking ID" className="w-full p-2 border rounded text-sm font-mono" />
            </div>
          </div>
          <button onClick={handleSubmit} disabled={isSubmitting} className="w-full mt-6 bg-slate-800 text-white py-3 rounded-lg font-bold hover:bg-black transition">
             {isSubmitting ? 'Saving...' : 'Save Application'}
          </button>
        </div>
      )}

      {/* FLAT LEDGER TABLE */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
         <table className="w-full text-left">
           <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wider border-b border-slate-200 font-semibold">
             <tr>
               <th className="p-4">Applicant</th>
               <th className="p-4">Passport Details</th>
               <th className="p-4 text-center">Biometrics</th>
               <th className="p-4">Custody (Old)</th>
               <th className="p-4">Tracking (New)</th>
               <th className="p-4 text-right">Status</th>
             </tr>
           </thead>
           <tbody className="divide-y divide-slate-100">
             {filteredApps.length === 0 ? (
                <tr><td colSpan={6} className="p-8 text-center text-slate-400 italic">No records found.</td></tr>
             ) : (
                filteredApps.map((item: any) => {
                   const pp = getPassportRecord(item)
                   if (!pp) return null
                   return (
                     <tr key={item.id} className="hover:bg-slate-50/50">
                       <td className="p-4">
                         <div className="font-bold text-base text-slate-800">{item.applicants?.first_name} {item.applicants?.last_name}</div>
                         <div className="text-sm text-slate-500 font-mono">{item.applicants?.citizen_number}</div>
                       </td>
                       <td className="p-4">
                         <div className="font-bold text-base text-slate-700">{pp.application_type}</div>
                         <div className="text-sm text-slate-500">{pp.category} • {pp.page_count}</div>
                         <div className={`text-sm font-bold uppercase ${pp.speed === 'Executive' ? 'text-amber-600' : 'text-slate-400'}`}>{pp.speed}</div>
                       </td>
                       
                       {/* FINGERPRINTS STATUS - CLICKABLE */}
                       <td className="p-4 text-center">
                         <button
                           onClick={() => handleToggleFingerprints(pp.id, pp.fingerprints_completed)}
                           className={`inline-block px-3 py-1.5 text-sm font-bold rounded-full cursor-pointer transition ${
                             pp.fingerprints_completed
                               ? 'bg-green-100 text-green-700 hover:bg-green-200'
                               : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                           }`}
                           title="Click to toggle biometrics status"
                         >
                           {pp.fingerprints_completed ? 'YES' : 'NO'}
                         </button>
                       </td>

                       {/* CUSTODY */}
                       <td className="p-4">
                         {pp.old_passport_number ? (
                           <div>
                             <div className="font-mono text-slate-700 font-bold text-base">{pp.old_passport_number}</div>
                             {pp.is_old_passport_returned ? (
                               <span className="text-sm font-bold text-green-600">✓ Returned</span>
                             ) : (
                               <button 
                                 onClick={() => handleReturnCustody(pp?.id)}
                                 className="text-sm bg-amber-100 text-amber-700 px-3 py-1 rounded-full font-bold hover:bg-amber-200 mt-1"
                               >
                                 ⚠ In Custody
                               </button>
                             )}
                           </div>
                         ) : <span className="text-slate-300">-</span>}
                       </td>

                       {/* TRACKING - CLICKABLE FOR HISTORY */}
                       <td className="p-4">
                         <button
                           onClick={() => handleViewHistory(item.id, item.tracking_number)}
                           className="font-mono font-bold text-blue-600 hover:text-blue-800 text-base underline cursor-pointer"
                           title="Click to view status history"
                         >
                           {item.tracking_number}
                         </button>
                         {pp.new_passport_number ? (
                           <div className="font-mono font-bold text-green-600 text-base mt-1">{pp.new_passport_number}</div>
                         ) : (
                           <button onClick={() => setArrivalModal(item)} className="text-sm text-slate-400 hover:text-blue-500 border border-dashed px-2 py-1 rounded mt-1">
                             + Arrival
                           </button>
                         )}
                       </td>
                       <td className="p-4 text-right">
                         <span className="text-sm font-bold bg-slate-100 px-3 py-1.5 rounded text-slate-700">{pp.status}</span>
                       </td>
                     </tr>
                   )
                })
             )}
           </tbody>
         </table>
      </div>

      {/* ARRIVAL MODAL */}
      {arrivalModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
           <div className="bg-white p-6 rounded-xl shadow-2xl w-full max-w-sm">
              <h3 className="font-bold text-lg text-slate-800 mb-2">New Passport Arrived</h3>
              <input 
                className="w-full p-3 border rounded-lg font-mono text-lg mb-4 uppercase"
                placeholder="New Passport #"
                autoFocus
                value={newPassportNum}
                onChange={e => setNewPassportNum(e.target.value.toUpperCase())}
              />
              <div className="flex gap-2">
                <button onClick={() => setArrivalModal(null)} className="flex-1 py-2 text-slate-500 font-bold">Cancel</button>
                <button onClick={handleSaveNewPassport} className="flex-1 py-2 bg-blue-600 text-white font-bold rounded">Save</button>
              </div>
           </div>
        </div>
      )}

      {/* STATUS HISTORY MODAL */}
      {historyModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
           <div className="bg-white p-6 rounded-xl shadow-2xl w-full max-w-lg max-h-96 overflow-y-auto">
              <h3 className="font-bold text-lg text-slate-800 mb-1">Status History</h3>
              <p className="text-sm text-slate-500 mb-4">Tracking: <span className="font-mono font-bold text-slate-700">{historyModal.trackingNumber}</span></p>
              
              {statusHistory.length === 0 ? (
                <p className="text-center text-slate-400 py-8">No status updates recorded yet.</p>
              ) : (
                <div className="space-y-3">
                  {statusHistory.map((entry: any, idx: number) => (
                    <div key={idx} className="border-l-4 border-blue-400 bg-slate-50 p-3 rounded">
                      <div className="font-bold text-slate-800">{entry.status || entry.action || 'Update'}</div>
                      <div className="text-sm text-slate-600">{entry.description || ''}</div>
                      <div className="text-xs text-slate-500 mt-1">
                        {entry.updated_at ? new Date(entry.updated_at).toLocaleString() : entry.timestamp ? new Date(entry.timestamp).toLocaleString() : 'Unknown time'}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              
              <button onClick={() => setHistoryModal(null)} className="w-full mt-4 py-2 bg-slate-200 text-slate-700 font-bold rounded hover:bg-slate-300">
                Close
              </button>
           </div>
        </div>
      )}
    </div>
  )
}
