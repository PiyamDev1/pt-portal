'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'

// Auto-format CNIC
const formatCNIC = (value: string) => {
  const digits = value.replace(/\D/g, '').slice(0, 13)
  if (digits.length <= 5) return digits
  if (digits.length <= 12) return `${digits.slice(0, 5)}-${digits.slice(5)}`
  return `${digits.slice(0, 5)}-${digits.slice(5, 12)}-${digits.slice(12, 13)}`
}

export default function PakPassportClient({ initialApplications, currentUserId }: any) {
  const router = useRouter()
  const [showForm, setShowForm] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  
  // NEW PASSPORT ENTRY STATE
  const [arrivalModal, setArrivalModal] = useState<any>(null)
  const [newPassportNum, setNewPassportNum] = useState('')

  const [formData, setFormData] = useState({
    familyHeadName: '', familyHeadCnic: '',
    applicantName: '', applicantCnic: '', applicantEmail: '',
    applicationType: 'Renewal', // Default
    category: 'Adult 10 Year',
    pageCount: '34 pages',
    speed: 'Normal',
    trackingNumber: '',
    oldPassportNumber: '' // Critical for renewals
  })

  // --- HANDLERS ---
  const handleInputChange = (e: any) => {
    let { name, value } = e.target
    if (['familyHeadCnic', 'applicantCnic'].includes(name)) value = formatCNIC(value)
    if (name === 'trackingNumber' || name === 'oldPassportNumber') value = value.toUpperCase()
    setFormData({ ...formData, [name]: value })
  }

  const handleSubmit = async () => {
    if (!formData.applicantCnic || !formData.trackingNumber) {
      toast.error('Required fields missing')
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
        router.refresh()
        // Reset form...
      } else {
        const d = await res.json()
        toast.error(d.error || 'Failed to save')
      }
    } catch (e) { toast.error('Network error') } 
    finally { setIsSubmitting(false) }
  }

  const handleReturnCustody = async (passportId: string) => {
    if (!confirm('Confirm you are handing over the Old Passport to the customer? This action is logged.')) return
    
    const toastId = toast.loading('Updating custody record...')
    try {
      const res = await fetch('/api/passports/pak/update-custody', {
        method: 'POST',
        body: JSON.stringify({ passportId, action: 'return_old', userId: currentUserId })
      })
      if (res.ok) {
        toast.success('Custody updated: Returned to Customer', { id: toastId })
        router.refresh()
      } else {
        toast.error('Failed to update custody', { id: toastId })
      }
    } catch (e) { toast.error('Error', { id: toastId }) }
  }

  const handleSaveNewPassport = async () => {
    if (!newPassportNum) return toast.error('Enter the new passport number')
    
    try {
      const res = await fetch('/api/passports/pak/update-custody', {
        method: 'POST',
        body: JSON.stringify({ 
          passportId: arrivalModal.pakistani_passport_applications.id, 
          action: 'record_new', 
          newNumber: newPassportNum,
          userId: currentUserId 
        })
      })
      if (res.ok) {
        toast.success('New Passport Recorded')
        setArrivalModal(null)
        setNewPassportNum('')
        router.refresh()
      }
    } catch(e) { toast.error('Error saving') }
  }

  // --- FILTER & GROUP LOGIC (Same as Nadra) ---
  const filteredApps = initialApplications.filter((item: any) => 
    JSON.stringify(item).toLowerCase().includes(searchQuery.toLowerCase())
  )
  const groupedData = filteredApps.reduce((acc: any, item: any) => {
    const headCnic = item.family_heads?.citizen_number || 'Independent'
    if (!acc[headCnic]) acc[headCnic] = { head: item.family_heads, members: [] }
    acc[headCnic].members.push(item)
    return acc
  }, {})

  return (
    <div className="space-y-6">
      {/* SEARCH & ACTION BAR */}
      <div className="flex justify-between items-center gap-4">
        <div className="relative flex-grow max-w-lg">
           <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
           <input 
             value={searchQuery} 
             onChange={e => setSearchQuery(e.target.value)}
             placeholder="Search ledger..." 
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

      {/* CREATE FORM */}
      {showForm && (
        <div className="bg-white p-6 rounded-xl border-t-4 border-green-600 shadow-xl animate-fade-in-down">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-4">
               <h4 className="text-xs font-black uppercase text-slate-400 tracking-widest">1. Applicant</h4>
               <input name="familyHeadName" onChange={handleInputChange} placeholder="Family Head Name" className="w-full p-2 border rounded text-sm" />
               <input name="familyHeadCnic" onChange={handleInputChange} value={formData.familyHeadCnic} placeholder="Family Head CNIC" className="w-full p-2 border rounded text-sm font-mono" />
               <div className="h-px bg-slate-100 my-2" />
               <input name="applicantName" onChange={handleInputChange} placeholder="Applicant Name" className="w-full p-2 border rounded text-sm" />
               <input name="applicantCnic" onChange={handleInputChange} value={formData.applicantCnic} placeholder="Applicant CNIC" className="w-full p-2 border rounded text-sm font-mono" />
               <input name="applicantEmail" onChange={handleInputChange} placeholder="Email" className="w-full p-2 border rounded text-sm" />
            </div>
            
            <div className="space-y-4">
               <h4 className="text-xs font-black uppercase text-slate-400 tracking-widest">2. Passport Details</h4>
               <div className="grid grid-cols-2 gap-3">
                 <select name="applicationType" onChange={handleInputChange} className="p-2 border rounded text-sm">
                    <option>First Time</option><option>Renewal</option><option>Modification</option><option>Lost</option>
                 </select>
                 <select name="speed" onChange={handleInputChange} className="p-2 border rounded text-sm font-bold text-amber-600">
                    <option>Normal</option><option>Executive</option>
                 </select>
                 <select name="category" onChange={handleInputChange} className="p-2 border rounded text-sm"><option>Adult 5 Year</option><option>Adult 10 Year</option><option>Child 5 Year</option></select>
                 <select name="pageCount" onChange={handleInputChange} className="p-2 border rounded text-sm"><option>34 pages</option><option>54 pages</option><option>72 pages</option><option>100 pages</option></select>
               </div>
               
               <input name="oldPassportNumber" onChange={handleInputChange} value={formData.oldPassportNumber} placeholder="Old Passport Number (For Custody)" className="w-full p-2 border border-amber-200 bg-amber-50 rounded text-sm font-mono" />
               
               <div className="flex gap-2">
                 <input name="trackingNumber" onChange={handleInputChange} value={formData.trackingNumber} placeholder="Tracking ID" className="w-full p-2 border rounded text-sm font-mono" />
               </div>
            </div>
          </div>
          <div className="mt-6">
             <button onClick={handleSubmit} disabled={isSubmitting} className="w-full bg-slate-800 text-white py-3 rounded-lg font-bold hover:bg-black transition">
               {isSubmitting ? 'Saving...' : 'Save & Record Custody'}
             </button>
          </div>
        </div>
      )}

      {/* LEDGER */}
      <div className="space-y-6">
        {Object.entries(groupedData).map(([headCnic, group]: any) => (
          <div key={headCnic} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
             {/* HEADER (Same as Nadra) */}
             <div className="bg-slate-50 px-6 py-3 border-b border-slate-200 flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 bg-green-100 text-green-700 rounded-full flex items-center justify-center font-bold">P</div>
                  <div>
                    <h4 className="font-bold text-slate-800 text-sm">{group.head ? `${group.head.first_name} ${group.head.last_name}` : 'Independent'}</h4>
                    <p className="text-[10px] text-slate-500 font-mono">{headCnic}</p>
                  </div>
                </div>
             </div>
             
             <table className="w-full text-left text-sm">
               <thead className="bg-slate-50 text-slate-500 text-[10px] uppercase tracking-wider">
                 <tr>
                   <th className="p-4">Applicant</th>
                   <th className="p-4">Details</th>
                   <th className="p-4">Old Passport (Custody)</th>
                   <th className="p-4">New Passport</th>
                   <th className="p-4 text-right">Actions</th>
                 </tr>
               </thead>
               <tbody className="divide-y divide-slate-100">
                 {group.members.map((item: any) => {
                   const pp = item.pakistani_passport_applications
                   return (
                     <tr key={item.id} className="hover:bg-slate-50/50">
                       <td className="p-4">
                         <div className="font-bold text-slate-700">{item.applicants?.first_name}</div>
                         <div className="text-[10px] text-slate-500 font-mono">{item.applicants?.citizen_number}</div>
                       </td>
                       <td className="p-4">
                         <div className="font-bold text-slate-700">{pp.application_type}</div>
                         <div className="text-[10px] text-slate-500">{pp.category} • {pp.page_count}</div>
                         <div className={`text-[10px] font-bold uppercase ${pp.speed === 'Executive' ? 'text-amber-600' : 'text-slate-400'}`}>{pp.speed}</div>
                       </td>
                       
                       {/* CUSTODY COLUMN */}
                       <td className="p-4">
                         {pp.old_passport_number ? (
                           <div>
                             <div className="font-mono text-slate-600 font-bold">{pp.old_passport_number}</div>
                             {pp.is_old_passport_returned ? (
                               <span className="inline-flex items-center gap-1 text-[10px] font-bold text-green-600 bg-green-50 px-2 py-0.5 rounded-full mt-1">
                                 ✓ Returned
                               </span>
                             ) : (
                               <button 
                                 onClick={() => handleReturnCustody(pp.id)}
                                 className="mt-1 text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-bold hover:bg-amber-200 border border-amber-200 transition"
                                 title="Click to mark as returned to customer"
                               >
                                 ⚠ In Custody (Return?)
                               </button>
                             )}
                           </div>
                         ) : (
                           <span className="text-slate-300 text-xs italic">None</span>
                         )}
                       </td>

                       {/* NEW PASSPORT COLUMN */}
                       <td className="p-4">
                         <div className="font-mono text-slate-500 text-xs mb-1">{item.tracking_number}</div>
                         {pp.new_passport_number ? (
                           <div className="font-mono font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded border border-blue-100 inline-block">
                             {pp.new_passport_number}
                           </div>
                         ) : (
                           <button 
                             onClick={() => setArrivalModal(item)}
                             className="text-[10px] border border-dashed border-slate-300 text-slate-400 px-2 py-1 rounded hover:border-blue-300 hover:text-blue-500 transition"
                           >
                             + Record Arrival
                           </button>
                         )}
                       </td>
                       <td className="p-4 text-right">
                         <span className="text-[10px] font-bold bg-slate-100 px-2 py-1 rounded text-slate-600">{pp.status}</span>
                       </td>
                     </tr>
                   )
                 })}
               </tbody>
             </table>
          </div>
        ))}
      </div>

      {/* ARRIVAL MODAL */}
      {arrivalModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 animate-in fade-in">
           <div className="bg-white p-6 rounded-xl shadow-2xl w-full max-w-sm">
              <h3 className="font-bold text-slate-800 mb-2">New Passport Arrived</h3>
              <p className="text-sm text-slate-500 mb-4">
                Enter the new passport number for <b>{arrivalModal.applicants.first_name}</b>.
              </p>
              <input 
                className="w-full p-3 border rounded-lg font-mono text-lg mb-4 uppercase"
                placeholder="AB1234567"
                autoFocus
                value={newPassportNum}
                onChange={e => setNewPassportNum(e.target.value.toUpperCase())}
              />
              <div className="flex gap-2">
                <button onClick={() => setArrivalModal(null)} className="flex-1 py-2 text-slate-500 font-bold hover:bg-slate-50 rounded">Cancel</button>
                <button onClick={handleSaveNewPassport} className="flex-1 py-2 bg-blue-600 text-white font-bold rounded hover:bg-blue-700">Record Arrival</button>
              </div>
           </div>
        </div>
      )}
    </div>
  )
}
