'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'

export default function NadraClient({ initialApplications, currentUserId }: any) {
  const router = useRouter()
  const [showForm, setShowForm] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [selectedHistory, setSelectedHistory] = useState<any>(null)
  const [isUpdating, setIsUpdating] = useState(false)
  const [historyItems, setHistoryItems] = useState<any[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  
  // Form state
  const [formData, setFormData] = useState({
    familyHeadName: '',
    familyHeadCnic: '',
    applicantName: '',
    applicantCnic: '',
    serviceType: 'NICOP/CNIC',
    serviceOption: 'Normal',
    trackingNumber: '',
    pin: ''
  })

  const handleInputChange = (e: any) => {
    setFormData({ ...formData, [e.target.name]: e.target.value })
  }

  const handleSubmit = async () => {
    // Validate required fields
    if (!formData.applicantCnic || !formData.serviceType || !formData.trackingNumber) {
      toast.error('Please fill in Applicant CNIC, Service Type, and Tracking Number')
      return
    }

    setIsSubmitting(true)
    try {
      const response = await fetch('/api/nadra/add-application', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          ...formData,
          currentUserId
        })
      })

      const result = await response.json()

      if (response.ok) {
        toast.success('Application saved to ledger successfully!')
        setFormData({
          familyHeadName: '',
          familyHeadCnic: '',
          applicantName: '',
          applicantCnic: '',
          serviceType: 'NICOP/CNIC',
          serviceOption: 'Normal',
          trackingNumber: '',
          pin: ''
        })
        setShowForm(false)
        router.refresh() // Refresh the page to show new data
      } else {
        toast.error(result.error || 'Failed to save application')
      }
    } catch (error) {
      toast.error('An error occurred while saving')
      console.error(error)
    } finally {
      setIsSubmitting(false)
    }
  }

  // 1. Logic to Group by Family Head
  const groupedData = initialApplications.reduce((acc: any, item: any) => {
    const headCnic = item.family_heads?.citizen_number || 'Independent'
    if (!acc[headCnic]) {
      acc[headCnic] = {
        head: item.family_heads,
        members: []
      }
    }
    acc[headCnic].members.push(item)
    return acc
  }, {})

  // 2. Status Update Function
  const handleStatusChange = async (nadraId: string, newStatus: string) => {
    setIsUpdating(true)
    try {
      const res = await fetch('/api/nadra/update-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ nadraId, status: newStatus, userId: currentUserId })
      })
      if (res.ok) {
        toast.success('Status updated')
        router.refresh()
      } else {
        toast.error('Failed to update status')
      }
    } catch (error) {
      toast.error('Error updating status')
      console.error(error)
    } finally {
      setIsUpdating(false)
    }
  }

  const loadHistory = async (nadraId: string) => {
    try {
      setLoadingHistory(true)
      const res = await fetch(`/api/nadra/status-history?nadraId=${encodeURIComponent(nadraId)}`)
      const json = await res.json()
      if (res.ok) {
        setHistoryItems(json.items || [])
      } else {
        toast.error(json.error || 'Failed to load history')
      }
    } catch (e) {
      toast.error('Network error loading history')
    } finally {
      setLoadingHistory(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* MULTI-SEARCH SYSTEM */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
          <input 
            type="text"
            placeholder="Search by CNIC, Name, or Tracking Number..."
            className="w-full pl-10 pr-4 py-3 bg-slate-50 border-none rounded-lg focus:ring-2 focus:ring-green-500 transition"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      <div className="flex justify-between items-center">
        <h3 className="font-bold text-slate-700 uppercase text-xs tracking-widest">Application Ledger</h3>
        <button 
          onClick={() => setShowForm(!showForm)}
          className="bg-green-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-green-700 transition flex items-center gap-2 text-sm"
        >
          {showForm ? 'Close Form' : '+ New Family Entry'}
        </button>
      </div>

      {/* DATA ENTRY FORM */}
      {showForm && (
        <div className="bg-white p-6 rounded-xl border-t-4 border-green-600 shadow-md animate-fade-in-down space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            
            {/* Left Column: People Details */}
            <div className="space-y-4">
              <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-widest">1. Hierarchy</h4>
              <div className="space-y-2">
                <input 
                  name="familyHeadName"
                  value={formData.familyHeadName}
                  onChange={handleInputChange}
                  placeholder="Family Head Name" 
                  className="w-full p-2 border rounded text-sm" 
                />
                <input 
                  name="familyHeadCnic"
                  value={formData.familyHeadCnic}
                  onChange={handleInputChange}
                  placeholder="Family Head CNIC" 
                  className="w-full p-2 border rounded text-sm font-mono" 
                />
              </div>
              <div className="pt-2 space-y-2">
                <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-widest">2. Applicant</h4>
                <input 
                  name="applicantName"
                  value={formData.applicantName}
                  onChange={handleInputChange}
                  placeholder="Applicant Name" 
                  className="w-full p-2 border rounded text-sm" 
                />
                <input 
                  name="applicantCnic"
                  value={formData.applicantCnic}
                  onChange={handleInputChange}
                  placeholder="Applicant CNIC" 
                  className="w-full p-2 border rounded text-sm font-mono" 
                  required
                />
              </div>
            </div>
            
            {/* Right Column: Service & Credentials */}
            <div className="space-y-4">
              <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-widest">3. Service & Urgency</h4>
              
              {/* TWO COLUMN SPLIT FOR SERVICE AND URGENCY */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-slate-400 font-bold uppercase mb-1 block">Service Type</label>
                  <select 
                    name="serviceType"
                    value={formData.serviceType}
                    onChange={handleInputChange}
                    className="w-full p-2 border rounded text-sm bg-white"
                  >
                    <option value="NICOP/CNIC">NICOP / CNIC</option>
                    <option value="POC">POC</option>
                    <option value="FRC">FRC</option>
                    <option value="CRC">CRC</option>
                    <option value="POA">POA</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 font-bold uppercase mb-1 block">Service Option</label>
                  <select 
                    name="serviceOption"
                    value={formData.serviceOption}
                    onChange={handleInputChange}
                    className="w-full p-2 border rounded text-sm bg-white font-medium"
                  >
                    <option value="Normal">Normal</option>
                    <option value="Executive">Executive</option>
                    <option value="Upgrade to Fast">Upgrade to Fast</option>
                    <option value="Modification">Modification</option>
                    <option value="Reprint">Reprint</option>
                    <option value="Cancellation">Cancellation</option>
                  </select>
                </div>
              </div>

              <div className="pt-2 space-y-4">
                <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-widest">4. Access Credentials</h4>
                <div className="flex gap-2">
                  <input 
                    name="trackingNumber"
                    value={formData.trackingNumber}
                    onChange={handleInputChange}
                    placeholder="Tracking ID" 
                    className="w-2/3 p-2 border rounded text-sm font-mono" 
                    required
                  />
                  <input 
                    name="pin"
                    value={formData.pin}
                    onChange={handleInputChange}
                    placeholder="PIN" 
                    className="w-1/3 p-2 border rounded text-sm font-bold text-center" 
                  />
                </div>
                <p className="text-[10px] text-slate-400 italic">
                  * Applicant email will be retrieved from existing profile.
                </p>
              </div>
            </div>
          </div>
          
          <button 
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="w-full bg-slate-800 text-white py-3 rounded-lg font-bold hover:bg-black transition disabled:bg-slate-400 disabled:cursor-not-allowed"
          >
            {isSubmitting ? 'Saving...' : 'Save Application to Ledger'}
          </button>
        </div>
      )}

      {/* GROUPED LEDGER BY FAMILY HEAD */}
      <div className="space-y-4">
        {Object.entries(groupedData).length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-12 text-center text-slate-400 italic">
            No records in the ledger.
          </div>
        ) : (
          Object.entries(groupedData).map(([headCnic, group]: any) => (
            <div key={headCnic} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              {/* FAMILY HEAD HEADER */}
              <div className="bg-slate-50 px-6 py-3 border-b border-slate-200 flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <span className="text-xl">🏠</span>
                  <div>
                    <h4 className="font-bold text-slate-800 text-sm">
                      {group.head ? `${group.head.first_name} ${group.head.last_name}` : 'No Family Head'}
                    </h4>
                    <p className="text-[10px] text-slate-500 font-mono uppercase">{headCnic}</p>
                  </div>
                </div>
                <span className="text-[10px] bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full font-bold">
                  {group.members.length} Applications
                </span>
              </div>

              {/* MEMBER APPLICATIONS TABLE */}
              <table className="w-full text-left text-sm">
                <tbody className="divide-y divide-slate-100">
                  {group.members.map((item: any) => {
                    // Safe access to the nadra service record (it might be an array or object depending on join)
                    const nadraRecord = Array.isArray(item.nadra_services) ? item.nadra_services[0] : item.nadra_services
                    const details = Array.isArray(nadraRecord?.nicop_cnic_details) 
                      ? nadraRecord?.nicop_cnic_details[0] 
                      : nadraRecord?.nicop_cnic_details

                    return (
                      <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="p-4 pl-12">
                          <div className="flex items-center gap-3">
                            <span className="text-slate-300 font-light">¬</span>
                            <div>
                              <div className="font-bold text-slate-700">{item.applicants?.first_name} {item.applicants?.last_name}</div>
                              <div className="text-[10px] text-slate-400 font-mono">{item.applicants?.citizen_number}</div>
                            </div>
                          </div>
                        </td>
                        <td className="p-4">
                          <div className="font-bold text-slate-700">{nadraRecord?.service_type}</div>
                          <div className="text-[10px] text-slate-400 font-bold uppercase">
                            {details?.service_option || 'Standard'}
                          </div>
                        </td>
                        <td className="p-4">
                          <button 
                            onClick={() => { setSelectedHistory(item); if (nadraRecord?.id) loadHistory(nadraRecord.id) }}
                            className="font-mono text-blue-600 font-bold hover:underline block"
                          >
                            {item.tracking_number}
                          </button>
                          {/* PIN DISPLAY FIX */}
                          <div className="text-[10px] font-bold text-slate-500">
                            PIN: {nadraRecord?.application_pin || 'N/A'}
                          </div>
                        </td>
                        <td className="p-4">
                          <select 
                            disabled={isUpdating}
                            value={nadraRecord?.status || 'Pending Submission'}
                            onChange={(e) => handleStatusChange(nadraRecord?.id, e.target.value)}
                            className="text-[10px] font-black bg-orange-50 text-orange-700 px-3 py-1.5 rounded-full uppercase border border-orange-100 cursor-pointer focus:ring-0"
                          >
                            <option value="Pending Submission">Pending Submission</option>
                            <option value="Submitted">Submitted</option>
                            <option value="In Progress">In Progress</option>
                            <option value="Completed">Completed</option>
                            <option value="Cancelled">Cancelled</option>
                          </select>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ))
        )}
      </div>

      {/* STATUS HISTORY POPUP (Simple Modal) */}
      {selectedHistory && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="font-bold text-slate-800">Status History</h3>
              <button onClick={() => setSelectedHistory(null)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>
            <div className="p-6 max-h-[400px] overflow-y-auto space-y-4">
              {loadingHistory ? (
                <div className="text-sm text-slate-500">Loading...</div>
              ) : historyItems.length === 0 ? (
                <div className="text-sm text-slate-500">No history yet.</div>
              ) : (
                historyItems.map((h) => (
                  <div key={h.id} className="flex gap-4 items-start">
                    <div className="w-2 h-2 rounded-full bg-green-500 mt-1.5 shrink-0" />
                    <div>
                      <p className="text-sm font-bold text-slate-800">{h.status}</p>
                      <p className="text-xs text-slate-500">{new Date(h.changed_at).toLocaleString()}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}