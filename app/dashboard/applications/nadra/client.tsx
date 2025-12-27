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
}

interface EditFormData {
  id?: string
  applicationId?: string
  applicantId?: string
  firstName?: string
  lastName?: string
  cnic?: string
  email?: string
  serviceType?: string
  serviceOption?: string
  trackingNumber?: string
  pin?: string
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
    pin: ''
  })
  const [isSubmitting, setIsSubmitting] = useState(false)

  // SEARCH & FILTER STATES
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')

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

  // =====================================================================
  // FORM HANDLERS
  // =====================================================================

  const handleInputChange = (e: any) => {
    let { name, value } = e.target

    if (['familyHeadCnic', 'applicantCnic'].includes(name)) {
      value = formatCNIC(value)
    }

    if (name === 'trackingNumber') {
      value = value.toUpperCase()
    }

    setFormData({ ...formData, [name]: value })
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
      pin: ''
    })
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleSubmit = async () => {
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
          pin: ''
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

  const filteredApplications = initialApplications.filter((item: any) => {
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

    return matchesSearch && matchesStatus
  })

  const groupedData = filteredApplications.reduce((acc: any, item: any) => {
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
          .catch((err) => console.error(err))
          .finally(() => setLoadingHistory(false))
      }, 100)
      return () => clearTimeout(timer)
    }
    setHistoryLogs([])
  }, [selectedHistory])

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

    setEditFormData({
      id: nadra?.id,
      applicationId: record.id,
      applicantId: record.applicants?.id,
      firstName: record.applicants?.first_name,
      lastName: record.applicants?.last_name,
      cnic: record.applicants?.citizen_number,
      email: record.applicants?.email || '',
      serviceType: nadra?.service_type,
      serviceOption: details?.service_option || 'Normal',
      trackingNumber: record.tracking_number,
      pin: nadra?.application_pin
    })
  }

  const handleEditInputChange = (name: string, value: string) => {
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
