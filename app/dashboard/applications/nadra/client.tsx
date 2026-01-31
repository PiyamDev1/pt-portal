'use client'
import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { formatCNIC, getNadraRecord, getDetails } from './components/helpers'
import StatsOverview from './components/StatsOverview'
import SearchAndFilter from './components/SearchAndFilter'
import FormSection from './components/FormSection'
import LedgerTable from './components/LedgerTable'
import EditModal from './components/EditModal'
import HistoryModal from './components/HistoryModal'

interface FormData {
  familyHeadName: string
  familyHeadCnic: string
  applicantName: string
  applicantCnic: string
  applicantEmail: string
  serviceType: string
  serviceOption: string
  trackingNumber: string
  pin: string
  newBorn: boolean
}

interface EditFormData {
  id?: string
  applicationId?: string
  applicantId?: string
  firstName?: string
  lastName?: string
  cnic?: string
  newBorn?: boolean
  email?: string
  serviceType?: string
  serviceOption?: string
  trackingNumber?: string
  pin?: string
  employeeId?: string
  employeeName?: string
}

export default function NadraClient({ initialApplications, currentUserId }: any) {
  const router = useRouter()

  // FORM STATES
  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState<FormData>({
    familyHeadName: '',
    familyHeadCnic: '',
    applicantName: '',
    applicantCnic: '',
    applicantEmail: '',
    serviceType: 'NICOP/CNIC',
    serviceOption: 'Normal',
    trackingNumber: '',
    pin: '',
    newBorn: false
  })
  const [isSubmitting, setIsSubmitting] = useState(false)

  // SEARCH & FILTER STATES
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')
  const [serviceTypeFilter, setServiceTypeFilter] = useState('All')
  const [serviceOptionFilter, setServiceOptionFilter] = useState('All')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [showEmptyFamilies, setShowEmptyFamilies] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 25

  // HISTORY STATES
  const [selectedHistory, setSelectedHistory] = useState<any>(null)
  const [historyLogs, setHistoryLogs] = useState<any[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)

  // EDIT/DELETE STATES
  const [editingRecord, setEditingRecord] = useState<any>(null)
  const [editType, setEditType] = useState<'application' | 'family_head' | null>(null)
  const [editFormData, setEditFormData] = useState<EditFormData>({})
  const [deleteAuthCode, setDeleteAuthCode] = useState('')
  const [isUpdating, setIsUpdating] = useState(false)
  const [agentOptions, setAgentOptions] = useState<{ id: string; name: string }[]>([])
  const [canChangeAgent, setCanChangeAgent] = useState(false)
  const [agentLoadError, setAgentLoadError] = useState('')

  // =====================================================================
  // FORM HANDLERS
  // =====================================================================

  const handleInputChange = (e: any) => {
    const { name, type, checked } = e.target
    let value = type === 'checkbox' ? checked : e.target.value

    if (name === 'newBorn') {
      setFormData((prev) => ({
        ...prev,
        newBorn: value,
        applicantCnic: value ? '' : prev.applicantCnic
      }))
      return
    }

    if (['familyHeadCnic', 'applicantCnic'].includes(name)) {
      value = formatCNIC(value)
    }

    if (name === 'trackingNumber') {
      value = value.toUpperCase()
    }

    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const handleAddMember = (familyHead: any) => {
    setFormData({
      ...formData,
      familyHeadName: `${familyHead.first_name} ${familyHead.last_name}`,
      familyHeadCnic: familyHead.citizen_number,
      applicantName: '',
      applicantCnic: '',
      applicantEmail: '',
      trackingNumber: '',
      pin: '',
      newBorn: false
    })
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleSubmit = async () => {
    if (!formData.trackingNumber || (!formData.applicantCnic && !formData.newBorn)) {
      toast.error('Tracking Number and Citizen Number are required unless New Born is selected')
      return
    }

    setIsSubmitting(true)
    try {
      const response = await fetch('/api/nadra/add-application', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ ...formData, currentUserId })
      })

      const result = await response.json()

      if (response.ok) {
        toast.success('Application saved to ledger!')
        setFormData({
          familyHeadName: '',
          familyHeadCnic: '',
          applicantName: '',
          applicantCnic: '',
          applicantEmail: '',
          serviceType: 'NICOP/CNIC',
          serviceOption: 'Normal',
          trackingNumber: '',
          pin: '',
          newBorn: false
        })
        setShowForm(false)
        router.refresh()
      } else {
        toast.error(result.error || 'Failed to save application')
      }
    } catch (error) {
      toast.error('An error occurred while saving')
    } finally {
      setIsSubmitting(false)
    }
  }

  // =====================================================================
  // FILTER & SEARCH LOGIC
  // =====================================================================

  const getCreatedAt = (item: any) => {
    const nadra = getNadraRecord(item)
    return nadra?.created_at || item?.created_at || 0
  }

  const sortedApplications = [...initialApplications].sort((a: any, b: any) => {
    const ad = new Date(getCreatedAt(a) || 0).getTime()
    const bd = new Date(getCreatedAt(b) || 0).getTime()
    return bd - ad // newest first
  })

  const filteredApplications = sortedApplications.filter((item: any) => {
    const query = searchQuery.toLowerCase()
    const nadra = getNadraRecord(item)
    const status = nadra?.status || 'Pending Submission'

    const matchesSearch =
      item.applicants?.first_name?.toLowerCase().includes(query) ||
      item.applicants?.last_name?.toLowerCase().includes(query) ||
      item.applicants?.citizen_number?.includes(query) ||
      item.tracking_number?.toLowerCase().includes(query) ||
      item.family_heads?.citizen_number?.includes(query)

    const matchesStatus = statusFilter === 'All' || status === statusFilter
    
    // Service type filter
    const serviceType = nadra?.service_type || ''
    const matchesServiceType = serviceTypeFilter === 'All' || serviceType === serviceTypeFilter
    
    // Service option filter
    const details = getDetails(nadra)
    const serviceOption = details?.service_option || 'Normal'
    const matchesServiceOption = serviceOptionFilter === 'All' || serviceOption === serviceOptionFilter
    
    // Date range filter
    if (startDate || endDate) {
      const itemDate = new Date(getCreatedAt(item))
      if (startDate && itemDate < new Date(startDate)) return false
      if (endDate) {
        const endDateTime = new Date(endDate)
        endDateTime.setHours(23, 59, 59, 999)
        if (itemDate > endDateTime) return false
      }
    }
    
    // Filter out family heads with no members unless checkbox is enabled
    const hasRealMember = !!(item.applicants || item.nadra_services)
    if (!showEmptyFamilies && !hasRealMember) return false

    return matchesSearch && matchesStatus && matchesServiceType && matchesServiceOption
  })

  const totalPages = Math.ceil(filteredApplications.length / pageSize) || 1
  const startIdx = (currentPage - 1) * pageSize
  const pageItems = filteredApplications.slice(startIdx, startIdx + pageSize)

  useEffect(() => { setCurrentPage(1) }, [searchQuery, statusFilter, startDate, endDate, showEmptyFamilies])

  const groupedData = pageItems.reduce((acc: any, item: any) => {
    const headCnic = item.family_heads?.citizen_number || 'Independent'
    if (!acc[headCnic]) {
      acc[headCnic] = { head: item.family_heads, members: [] }
    }
    const hasRealMember = !!(item.applicants || item.nadra_services)
    if (hasRealMember) acc[headCnic].members.push(item)
    return acc
  }, {})

  // =====================================================================
  // STATUS UPDATE
  // =====================================================================

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
    } finally {
      setIsUpdating(false)
    }
  }

  // =====================================================================
  // HISTORY FETCHING
  // =====================================================================

  useEffect(() => {
    const nadraArr = Array.isArray(selectedHistory?.nadra_services)
      ? selectedHistory?.nadra_services
      : selectedHistory?.nadra_services
        ? [selectedHistory?.nadra_services]
        : []

    const nadraId = nadraArr[0]?.id

    if (nadraId) {
      setLoadingHistory(true)
      const timer = setTimeout(() => {
        fetch(`/api/nadra/status-history?nadraId=${nadraId}`)
          .then((res) => res.json())
          .then((data) => {
            if (data.history) setHistoryLogs(data.history)
          })
          .catch(() => {
            // Error already shown via toast
          })
          .finally(() => setLoadingHistory(false))
      }, 100)
      return () => clearTimeout(timer)
    }
    setHistoryLogs([])
  }, [selectedHistory])

  useEffect(() => {
    const loadAgents = async () => {
      try {
        const res = await fetch(`/api/nadra/agent-options?userId=${currentUserId}`)
        if (!res.ok) {
          const payload = await res.json()
          throw new Error(payload?.error || 'Unable to load agents')
        }
        const payload = await res.json()
        setAgentOptions(payload.agentOptions || [])
        setCanChangeAgent(!!payload.canChangeAgent)
      } catch (error: any) {
        setAgentLoadError(error?.message || 'Failed to load agents')
      }
    }

    loadAgents()
  }, [currentUserId])

  useEffect(() => {
    if (agentLoadError) {
      toast.error(agentLoadError)
    }
  }, [agentLoadError])

  // =====================================================================
  // EDIT/DELETE HANDLERS
  // =====================================================================

  const openEditModal = (record: any, type: 'application' | 'family_head') => {
    setEditType(type)
    setEditingRecord(record)
    setDeleteAuthCode('')

    if (type === 'family_head') {
      setEditFormData({
        id: record.id,
        firstName: record.first_name,
        lastName: record.last_name,
        cnic: record.citizen_number
      })
      return
    }

    const nadra = getNadraRecord(record)
    const details = getDetails(nadra)
    const rawCnic = record.applicants?.citizen_number
    const isNewBorn = !rawCnic || rawCnic?.startsWith('00000')

    setEditFormData({
      id: nadra?.id,
      applicationId: record.id,
      applicantId: record.applicants?.id,
      firstName: record.applicants?.first_name,
      lastName: record.applicants?.last_name,
      cnic: isNewBorn ? '' : rawCnic,
      newBorn: isNewBorn,
      email: record.applicants?.email || '',
      serviceType: nadra?.service_type,
      serviceOption: details?.service_option || 'Normal',
      trackingNumber: record.tracking_number,
      pin: nadra?.application_pin,
      employeeId: nadra?.employee_id || '',
      employeeName: nadra?.employees?.full_name || ''
    })
  }

  const handleEditInputChange = (name: string, value: any) => {
    if (name === 'newBorn') {
      setEditFormData((prev: any) => ({ ...prev, newBorn: value, cnic: value ? '' : prev.cnic }))
      return
    }

    if (name === 'trackingNumber') value = value.toUpperCase()
    setEditFormData((prev: any) => ({ ...prev, [name]: value }))
  }

  const handleEditSubmit = async () => {
    if (!editType || !editFormData?.id) {
      toast.error('Select a record to modify')
      return
    }
    try {
      const res = await fetch('/api/nadra/manage-record', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update',
          type: editType,
          id: editFormData.id,
          data: editFormData,
          userId: currentUserId
        })
      })
      if (res.ok) {
        toast.success('Record updated')
        closeEditModal()
        router.refresh()
      } else {
        const payload = await res.json()
        toast.error(payload?.error || 'Update failed')
      }
    } catch (e) {
      toast.error('Error updating')
    }
  }

  const handleDelete = async () => {
    if (!deleteAuthCode) {
      toast.error('Auth code required for deletion')
      return
    }
    try {
      const res = await fetch('/api/nadra/manage-record', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'delete',
          type: editType,
          id: editFormData.id,
          authCode: deleteAuthCode,
          userId: currentUserId
        })
      })
      if (res.ok) {
        toast.success('Record deleted permanently')
        closeEditModal()
        router.refresh()
      } else {
        const payload = await res.json()
        toast.error(payload?.error || 'Delete failed')
      }
    } catch (e) {
      toast.error('Error deleting')
    }
  }

  const closeEditModal = () => {
    setEditingRecord(null)
    setEditType(null)
    setEditFormData({})
    setDeleteAuthCode('')
  }

  // =====================================================================
  // RENDER
  // =====================================================================

  return (
    <div className="space-y-6">
      <StatsOverview applications={initialApplications} />

      <SearchAndFilter
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        statusFilter={statusFilter}
        onStatusChange={setStatusFilter}
        serviceTypeFilter={serviceTypeFilter}
        onServiceTypeChange={setServiceTypeFilter}
        serviceOptionFilter={serviceOptionFilter}
        onServiceOptionChange={setServiceOptionFilter}
        startDate={startDate}
        onStartDateChange={setStartDate}
        endDate={endDate}
        onEndDateChange={setEndDate}
        showEmptyFamilies={showEmptyFamilies}
        onToggleEmptyFamilies={setShowEmptyFamilies}
      />

      <FormSection
        showForm={showForm}
        formData={formData}
        isSubmitting={isSubmitting}
        onInputChange={handleInputChange}
        onSubmit={handleSubmit}
        onToggle={() => setShowForm(!showForm)}
      />

      <LedgerTable
        groupedData={groupedData}
        isUpdating={isUpdating}
        onStatusChange={handleStatusChange}
        onEditApplication={(item) => openEditModal(item, 'application')}
        onEditHead={(head) => openEditModal(head, 'family_head')}
        onAddMember={handleAddMember}
        onViewHistory={setSelectedHistory}
      />

      {/* Pagination */}
      <div className="flex items-center justify-between mt-4">
        <div className="text-xs text-slate-500">
          Showing {filteredApplications.length === 0 ? 0 : startIdx + 1}-{Math.min(startIdx + pageSize, filteredApplications.length)} of {filteredApplications.length}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            className={`px-3 py-1 rounded border text-sm ${currentPage === 1 ? 'opacity-50 cursor-not-allowed' : 'hover:bg-slate-100'} `}
          >
            ← Previous
          </button>
          <span className="text-xs text-slate-600">Page {currentPage} of {totalPages}</span>
          <button
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            disabled={currentPage >= totalPages}
            className={`px-3 py-1 rounded border text-sm ${currentPage >= totalPages ? 'opacity-50 cursor-not-allowed' : 'hover:bg-slate-100'} `}
          >
            Next →
          </button>
        </div>
      </div>

      <EditModal
        isOpen={!!editingRecord}
        editType={editType}
        editFormData={editFormData}
        deleteAuthCode={deleteAuthCode}
        onInputChange={handleEditInputChange}
        onAuthCodeChange={setDeleteAuthCode}
        onSave={handleEditSubmit}
        onDelete={handleDelete}
        onClose={closeEditModal}
        agentOptions={agentOptions}
        canChangeAgent={canChangeAgent}
      />

      <HistoryModal
        isOpen={!!selectedHistory}
        selectedHistory={selectedHistory}
        historyLogs={historyLogs}
        loadingHistory={loadingHistory}
        onClose={() => setSelectedHistory(null)}
      />
    </div>
  )
}
