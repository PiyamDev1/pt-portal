'use client'
import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'

const getStatusColor = (status: string) => {
  switch (status) {
    case 'Completed': return 'bg-emerald-100 text-emerald-700 border-emerald-200'
    case 'In Progress': return 'bg-blue-100 text-blue-700 border-blue-200'
    case 'Submitted': return 'bg-purple-100 text-purple-700 border-purple-200'
    case 'Cancelled': return 'bg-red-100 text-red-700 border-red-200'
    default: return 'bg-amber-50 text-amber-700 border-amber-200'
  }
}

export default function NadraClient({ initialApplications, currentUserId }: any) {
  const router = useRouter()
  const [showForm, setShowForm] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [selectedHistory, setSelectedHistory] = useState<any>(null)
  const [isUpdating, setIsUpdating] = useState(false)
  const [historyLogs, setHistoryLogs] = useState<any[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  
  // Form state
  const [formData, setFormData] = useState({
    familyHeadName: '',
    familyHeadCnic: '',
    applicantName: '',
    applicantCnic: '',
    applicantEmail: '',
    serviceType: 'NICOP/CNIC',
    serviceOption: 'Normal',
    trackingNumber: '',
    pin: ''
  })

  const handleAddMember = (familyHead: any) => {
    setFormData({
      ...formData,
      familyHeadName: `${familyHead.first_name} ${familyHead.last_name}`,
      familyHeadCnic: familyHead.citizen_number,
      applicantName: '',
      applicantCnic: '',
      applicantEmail: '',
      trackingNumber: '',
      pin: ''
    })
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleInputChange = (e: any) => {
    setFormData({ ...formData, [e.target.name]: e.target.value })
  }

  const handleSubmit = async () => {
    // Validate required fields
    if (!formData.applicantCnic || !formData.trackingNumber) {
      toast.error('Applicant CNIC and Tracking Number are required')
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
          applicantEmail: '',
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

  // Fetch history when popup opens
  useEffect(() => {
    if (selectedHistory?.nadra_services?.id) {
      setLoadingHistory(true)
      fetch(`/api/nadra/status-history?nadraId=${selectedHistory.nadra_services.id}`)
        .then(res => res.json())
        .then(data => {
          if (data.history) {
            setHistoryLogs(data.history)
          }
        })
        .catch(err => console.error(err))
        .finally(() => setLoadingHistory(false))
    } else {
      setHistoryLogs([])
    }
  }, [selectedHistory])

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
                <input 
                  name="applicantEmail"
                  value={formData.applicantEmail}
                  onChange={handleInputChange}
                  placeholder="Applicant Email" 
                  type="email"
                  className="w-full p-2 border rounded text-sm" 
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
                  * Fill in all required fields above to save.
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
                <div className="flex items-center gap-3">
                  <span className="text-[10px] bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full font-bold">
                    {group.members.length} Applications
                  </span>
                  {group.head && (
                    <button
                      onClick={() => handleAddMember(group.head)}
                      className="text-xs bg-white border border-slate-300 text-slate-700 px-3 py-1.5 rounded-md hover:bg-slate-50 font-bold transition flex items-center gap-1"
                    >
                      <span>+</span> Add Member
                    </button>
                  )}
                </div>
              </div>

              {/* MEMBER APPLICATIONS TABLE */}
              <table className="w-full text-left text-sm">
                <tbody className="divide-y divide-slate-100">
                  {group.members.map((item: any) => {
                    const nadraRecord = Array.isArray(item.nadra_services) ? item.nadra_services[0] : item.nadra_services
                    const details = Array.isArray(nadraRecord?.nicop_cnic_details)
                      ? nadraRecord?.nicop_cnic_details[0]
                      : nadraRecord?.nicop_cnic_details

                    const statusClass = getStatusColor(nadraRecord?.status || 'Pending Submission')

                    return (
                      <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="p-4 pl-12 align-top">
                          <div className="flex items-start gap-3">
                            <span className="text-slate-300 font-light">¬</span>
                            <div>
                              <div className="font-bold text-slate-800 text-base">{item.applicants?.first_name} {item.applicants?.last_name}</div>
                              <div className="text-sm text-slate-600 font-mono mt-0.5 tracking-wide">{item.applicants?.citizen_number}</div>
                              <div className="text-xs text-blue-500 mt-1">{item.applicants?.email}</div>
                            </div>
                          </div>
                        </td>
                        <td className="p-4 align-top">
                          <div className="font-bold text-slate-700">{nadraRecord?.service_type}</div>
                          <div className="text-xs text-slate-500 font-medium mt-1">
                            {details?.service_option || 'Standard Processing'}
                          </div>
                        </td>
                        <td className="p-4 align-top">
                          <button
                            onClick={() => setSelectedHistory(item)}
                            className="font-mono text-slate-800 font-bold tracking-wide text-sm hover:underline block"
                          >
                            {item.tracking_number}
                          </button>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs text-slate-400 font-bold uppercase">PIN:</span>
                            <span className="bg-slate-100 px-2 py-0.5 rounded text-sm font-mono font-bold text-slate-700 border border-slate-200">
                              {nadraRecord?.application_pin || 'N/A'}
                            </span>
                          </div>
                        </td>
                        <td className="p-4 align-top">
                          <select
                            disabled={isUpdating}
                            value={nadraRecord?.status || 'Pending Submission'}
                            onChange={(e) => handleStatusChange(nadraRecord?.id, e.target.value)}
                            className={`text-xs font-bold px-3 py-1.5 rounded-full border cursor-pointer focus:ring-0 ${statusClass}`}
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

      {/* STATUS HISTORY POPUP */}
      {selectedHistory && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
            
            {/* Header */}
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <div>
                <h3 className="font-bold text-slate-800">Status History</h3>
                <p className="text-xs text-slate-500 font-mono mt-1">
                  Tracking: {selectedHistory.tracking_number}
                </p>
              </div>
              <button 
                onClick={() => setSelectedHistory(null)} 
                className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-slate-200 transition text-slate-400"
              >
                ✕
              </button>
            </div>

            {/* Timeline Body */}
            <div className="p-6 overflow-y-auto">
              {loadingHistory ? (
                <div className="text-center py-8 text-slate-400 text-sm">Loading history...</div>
              ) : historyLogs.length === 0 ? (
                <div className="text-center py-8 text-slate-400 text-sm italic">
                  No history recorded yet.
                </div>
              ) : (
                <div className="relative pl-4 border-l-2 border-slate-100 space-y-8 ml-2">
                  {historyLogs.map((log, index) => (
                    <div key={log.id} className="relative">
                      {/* Timeline Dot */}
                      <div className={`absolute -left-[23px] top-1 h-3 w-3 rounded-full border-2 border-white shadow-sm ${
                        index === 0 ? 'bg-green-500 ring-4 ring-green-50' : 'bg-slate-300'
                      }`} />
                      
                      <div className="flex justify-between items-start">
                        <div>
                          <p className={`text-sm font-bold ${
                            index === 0 ? 'text-slate-800' : 'text-slate-500'
                          }`}>
                            {log.status}
                          </p>
                          <p className="text-[10px] text-slate-400 mt-0.5">
                            by {log.changed_by}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] text-slate-400 font-mono">
                            {new Date(log.date).toLocaleDateString()}
                          </p>
                          <p className="text-[10px] text-slate-300">
                            {new Date(log.date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            
            {/* Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-100 text-center">
               <span className="text-[10px] text-slate-400">
                 Current Status: <span className="font-bold text-slate-600">
                   {Array.isArray(selectedHistory.nadra_services) 
                     ? selectedHistory.nadra_services[0]?.status 
                     : selectedHistory.nadra_services?.status}
                 </span>
               </span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}