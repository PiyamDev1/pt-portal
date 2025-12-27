'use client'

import { useState } from 'react'
import { Search, Plus, User, FileText, Check, X, Save, MoreHorizontal } from 'lucide-react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { pakPassportApi } from './components/api'
import { getPassportRecord } from './components/utils'
import EditModal from './components/EditModal'
import HistoryModal from './components/HistoryModal'

// Status mapping to match backend
const STATUS_MAP = {
  PENDING: 'Pending Submission',
  PROCESSING: 'Processing',
  ARRIVED: 'Passport Arrived',
  COLLECTED: 'Collected',
}

const STATUS_LABELS = {
  [STATUS_MAP.PENDING]: 'Pending Submission',
  [STATUS_MAP.PROCESSING]: 'Processing',
  [STATUS_MAP.ARRIVED]: 'Passport Arrived',
  [STATUS_MAP.COLLECTED]: 'Collected',
}

export default function PakPassportClient({ initialApplications, currentUserId }: any) {
  const router = useRouter()
  const [searchTerm, setSearchTerm] = useState('')
  const [editModal, setEditModal] = useState<any>(null)
  const [historyModal, setHistoryModal] = useState<any>(null)
  const [statusHistory, setStatusHistory] = useState<any[]>([])
  const [editFormData, setEditFormData] = useState<any>({})
  const [deleteAuthCode, setDeleteAuthCode] = useState('')

  // Status color helper
  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      [STATUS_MAP.PENDING]: 'bg-gray-100 text-gray-800',
      [STATUS_MAP.PROCESSING]: 'bg-yellow-100 text-yellow-800',
      [STATUS_MAP.ARRIVED]: 'bg-indigo-100 text-indigo-800',
      [STATUS_MAP.COLLECTED]: 'bg-green-100 text-green-800',
    }
    return colors[status] || 'bg-gray-100 text-gray-800'
  }

  // Handlers
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

  const handleToggleFingerprints = async (passportId: string) => {
    const toastId = toast.loading('Updating...')
    const result = await pakPassportApi.updateCustody(passportId, 'toggle_fingerprints', currentUserId)
    
    if (result.ok) {
      toast.success('Updated', { id: toastId })
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

  const handleMarkCollected = async (passportId: string, hasPassport: boolean) => {
    if (!hasPassport) {
      toast.error('Enter new passport number first')
      return
    }
    const toastId = toast.loading('Marking as collected...')
    const result = await pakPassportApi.updateStatus(passportId, 'Collected', currentUserId)
    
    if (result.ok) {
      toast.success('Marked as collected', { id: toastId })
      router.refresh()
    } else {
      toast.error(result.error || 'Failed', { id: toastId })
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

  // Filter applications
  const filteredApps = initialApplications.filter((item: any) => 
    JSON.stringify(item).toLowerCase().includes(searchTerm.toLowerCase())
  )

  // Mini tracking workflow component
  const MiniTracking = ({ pp }: any) => {
    const workflow = [
      { key: 'pending', label: 'Pending', completed: pp?.status !== 'Pending Submission' },
      { key: 'biometrics', label: 'Biometrics', completed: pp?.fingerprints_completed },
      { key: 'processing', label: 'Processing', completed: ['Processing', 'Passport Arrived', 'Collected'].includes(pp?.status) },
      { key: 'arrived', label: 'Arrived', completed: !!pp?.new_passport_number },
      { key: 'collected', label: 'Collected', completed: pp?.status === 'Collected' }
    ]

    return (
      <div className="flex flex-col space-y-1.5">
        {workflow.map((step) => (
          <div key={step.key} className="flex items-center space-x-2">
            <div className={`w-2 h-2 rounded-full ring-1 ring-offset-1 ${
              step.completed ? 'bg-blue-500 ring-blue-500' : 'bg-transparent ring-gray-300'
            }`}></div>
            <span className={`text-[10px] uppercase tracking-wider font-medium ${
              step.completed ? 'text-gray-700' : 'text-gray-400'
            }`}>
              {step.label}
            </span>
          </div>
        ))}
        
        {!pp?.old_passport_custody && pp?.old_passport_number && (
          <div className="flex items-center space-x-2 mt-1 pl-0.5">
            <Check className="w-3 h-3 text-green-600" />
            <span className="text-[10px] uppercase tracking-wider font-medium text-green-700">Old PP Returned</span>
          </div>
        )}
      </div>
    )
  }

  // Biometrics Toggle
  const BiometricsToggle = ({ pp }: any) => {
    const isTaken = pp?.fingerprints_completed
    
    return (
      <button 
        onClick={() => !isTaken && handleToggleFingerprints(pp.id)}
        disabled={isTaken}
        className={`relative w-10 h-5 transition-colors rounded-full focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 ${
          isTaken ? 'bg-blue-600 cursor-default' : 'bg-gray-300 hover:bg-gray-400'
        }`}
      >
        <span className={`absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full transition-transform transform shadow-sm ${
          isTaken ? 'translate-x-5' : 'translate-x-0'
        }`} />
      </button>
    )
  }

  return (
    <div className="p-6 bg-gray-50 min-h-screen font-sans">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-800">Pakistani Passport Application Tracker</h1>
        <p className="text-gray-500 text-sm">Manage submissions, biometrics, and collections</p>
      </div>

      {/* Action Bar */}
      <div className="flex justify-between items-center mb-6 bg-white p-4 rounded-xl shadow-sm border border-gray-100">
        <div className="relative w-96">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search by tracking number, CNIC, or name..."
            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <button 
          onClick={() => router.push('/dashboard/passports/pak/new')}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center transition-colors"
        >
          <Plus className="h-4 w-4 mr-2" />
          New Application
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead className="bg-gray-50 text-gray-500 text-xs uppercase font-semibold">
            <tr>
              <th className="px-6 py-4">Applicant</th>
              <th className="px-6 py-4">Passport Details</th>
              <th className="px-6 py-4 w-48">Workflow Step</th>
              <th className="px-6 py-4 w-56">Tracking History</th>
              <th className="px-6 py-4 bg-blue-50/50 border-l border-r border-blue-100 w-72">
                Record Arrival & Collection
              </th>
              <th className="px-6 py-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filteredApps.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-gray-400 italic">
                  No records found.
                </td>
              </tr>
            ) : (
              filteredApps.map((item: any) => {
                const pp = getPassportRecord(item)
                if (!pp) return null

                return (
                  <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                    {/* 1. Applicant */}
                    <td className="px-6 py-4">
                      <div className="flex items-center">
                        <div className="h-9 w-9 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 mr-3">
                          <User className="h-4 w-4" />
                        </div>
                        <div>
                          <div className="font-medium text-gray-900">
                            {item.applicants?.first_name} {item.applicants?.last_name}
                          </div>
                          <div className="text-xs text-gray-500 font-mono">{item.applicants?.citizen_number}</div>
                        </div>
                      </div>
                    </td>

                    {/* 2. Passport Details */}
                    <td className="px-6 py-4">
                      <div className="flex flex-col items-start space-y-1">
                        <span className="text-sm text-gray-700 font-medium">{pp.application_type}</span>
                        {pp.speed === 'Executive' ? (
                          <span className="px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800 border border-purple-200">
                            Executive
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">
                            Normal
                          </span>
                        )}
                        <div className="text-xs text-gray-500">{pp.category} • {pp.page_count}</div>
                      </div>
                    </td>

                    {/* 3. Workflow Control */}
                    <td className="px-6 py-4">
                      <div className="flex flex-col space-y-2">
                        <div className="flex items-center justify-between text-sm text-gray-600">
                          <span>Biometrics</span>
                          <BiometricsToggle pp={pp} />
                        </div>
                        {pp.fingerprints_completed && (
                          <button 
                            onClick={() => handleStatusChange(pp.id, STATUS_MAP.PROCESSING)}
                            disabled={pp.status === STATUS_MAP.PROCESSING || pp.status === STATUS_MAP.ARRIVED || pp.status === STATUS_MAP.COLLECTED}
                            className={`text-xs px-2 py-1 rounded border ${
                              pp.status === STATUS_MAP.PROCESSING || pp.status === STATUS_MAP.ARRIVED || pp.status === STATUS_MAP.COLLECTED
                                ? 'bg-green-50 text-green-700 border-green-200' 
                                : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                            }`}
                          >
                            {pp.status === STATUS_MAP.PROCESSING || pp.status === STATUS_MAP.ARRIVED || pp.status === STATUS_MAP.COLLECTED ? "Processing..." : "Start Processing"}
                          </button>
                        )}
                      </div>
                    </td>

                    {/* 4. Tracking History */}
                    <td className="px-6 py-4">
                      <button
                        onClick={() => handleViewHistory(item.id, item.tracking_number)}
                        className="text-xs font-mono font-bold text-gray-600 bg-gray-100 px-2 py-1 rounded border border-gray-200 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700 transition cursor-pointer mb-2 block"
                      >
                        {item.tracking_number}
                      </button>
                      <MiniTracking pp={pp} />
                    </td>

                    {/* 5. Record Arrival (Blue Column) */}
                    <td className="px-6 py-4 bg-blue-50/30 border-l border-r border-blue-100">
                      <div className="space-y-3">
                        {/* New Passport Number */}
                        <div>
                          <label className="text-[10px] text-gray-500 uppercase font-bold block mb-1">New Passport #</label>
                          <div className="relative">
                            <FileText className="h-3 w-3 absolute left-2 top-2 text-gray-400"/>
                            <input 
                              type="text" 
                              defaultValue={pp.new_passport_number}
                              placeholder="Enter Number"
                              className="w-full pl-6 pr-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 bg-white font-mono"
                              disabled
                            />
                          </div>
                        </div>

                        {/* Old Passport Returned */}
                        {pp.old_passport_number && (
                          <div className="flex items-center">
                            <input 
                              type="checkbox" 
                              checked={!pp.old_passport_custody}
                              onChange={() => handleReturnCustody(pp.id)}
                              id={`old-pp-${pp.id}`}
                              className="h-3.5 w-3.5 text-blue-600 rounded cursor-pointer"
                            />
                            <label htmlFor={`old-pp-${pp.id}`} className="ml-2 text-xs text-gray-700 cursor-pointer">
                              Old Passport Returned
                            </label>
                          </div>
                        )}

                        {/* Collected Checkbox */}
                        <div className="flex items-center pt-1 border-t border-blue-200/50">
                          <input 
                            type="checkbox" 
                            checked={pp.status === 'Collected'}
                            disabled={!pp.new_passport_number}
                            onChange={() => handleMarkCollected(pp.id, !!pp.new_passport_number)}
                            id={`collected-${pp.id}`}
                            className="h-4 w-4 text-green-600 rounded cursor-pointer disabled:opacity-50"
                          />
                          <label htmlFor={`collected-${pp.id}`} className={`ml-2 text-sm font-medium ${
                            pp.status === 'Collected' ? 'text-green-700' : 'text-gray-700'
                          }`}>
                            Collected by Customer
                          </label>
                        </div>
                      </div>
                    </td>

                    {/* 6. Actions */}
                    <td className="px-6 py-4 text-right">
                      <button 
                        onClick={() => openEditModal(item)}
                        className="text-gray-400 hover:text-blue-600 transition-colors"
                      >
                        <MoreHorizontal className="h-5 w-5" />
                      </button>
                    </td>
                  </tr>
                )
              })
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
    </div>
  )
}
