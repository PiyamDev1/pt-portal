'use client'
import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { formatCNIC, getNadraRecord, getDetails, normalizeStatus } from './components/helpers'
import StatsOverview from './components/StatsOverview'
import SearchAndFilter from './components/SearchAndFilter'
import FormSection from './components/FormSection'
import LedgerTable from './components/LedgerTable'
import EditModal from './components/EditModal'
import HistoryModal from './components/HistoryModal'
import NotesModal from './components/NotesModal'

type ServiceTypeMetadata = {
  id: string
  name: string
}

type ServiceOptionMetadata = {
  id: string
  name: string
  service_type_id: string | null
}

interface FormData {
  familyHeadName: string
  familyHeadCnic: string
  familyHeadPhone: string
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
  phone?: string
  serviceType?: string
  serviceOption?: string
  trackingNumber?: string
  pin?: string
  employeeId?: string
  employeeName?: string
  notes?: string
}

export default function NadraClient({ initialApplications, currentUserId }: any) {
  const router = useRouter()
  const [applications, setApplications] = useState(initialApplications)
  const [serviceTypes, setServiceTypes] = useState<ServiceTypeMetadata[]>([])
  const [serviceOptions, setServiceOptions] = useState<ServiceOptionMetadata[]>([])

  // FORM STATES
  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState<FormData>({
    familyHeadName: '',
    familyHeadCnic: '',
    familyHeadPhone: '',
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

  // NOTES STATES
  const [notesModal, setNotesModal] = useState<{ nadraId: string; note: string } | null>(null)
  const [notesText, setNotesText] = useState('')
  const [notesSaving, setNotesSaving] = useState(false)
  const [complaintModal, setComplaintModal] = useState<{ nadraId: string; trackingNumber: string } | null>(null)
  const [complaintNumber, setComplaintNumber] = useState('')
  const [complaintDetails, setComplaintDetails] = useState('')
  const [complaintSaving, setComplaintSaving] = useState(false)

  // EDIT/DELETE STATES
  const [editingRecord, setEditingRecord] = useState<any>(null)
  const [editType, setEditType] = useState<'application' | 'family_head' | null>(null)
  const [editFormData, setEditFormData] = useState<EditFormData>({})
  const [deleteAuthCode, setDeleteAuthCode] = useState('')
  const [isUpdating, setIsUpdating] = useState(false)
  const [agentOptions, setAgentOptions] = useState<{ id: string; name: string }[]>([])
  const [canChangeAgent, setCanChangeAgent] = useState(false)
  const [agentLoadError, setAgentLoadError] = useState('')
  const [complainedNadraIds, setComplainedNadraIds] = useState<Set<string>>(new Set())

  const normalizeLookupValue = useCallback((value: string | null | undefined) => String(value || '').trim().toLowerCase(), [])

  useEffect(() => {
    setApplications(initialApplications)
  }, [initialApplications])

  useEffect(() => {
    const loadMetadata = async () => {
      try {
        const response = await fetch('/api/nadra/metadata')
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}))
          throw new Error(payload?.error || 'Unable to load service metadata')
        }

        const payload = await response.json()
        setServiceTypes(payload.serviceTypes || [])
        setServiceOptions(payload.serviceOptions || [])
      } catch (error: any) {
        toast.error(error?.message || 'Failed to load NADRA metadata')
      }
    }

    const loadComplainedIds = async () => {
      try {
        const res = await fetch('/api/nadra/complained-ids')
        if (!res.ok) return
        const { ids } = await res.json()
        setComplainedNadraIds(new Set(ids || []))
      } catch {
        // non-critical — silently ignore
      }
    }

    loadMetadata()
    loadComplainedIds()
  }, [])

  const serviceTypeNameById = serviceTypes.reduce<Record<string, string>>((acc, serviceType) => {
    acc[serviceType.id] = serviceType.name
    return acc
  }, {})

  const filterServiceTypeOptions = serviceTypes.map((serviceType) => serviceType.name)
  const currentFilterServiceTypeId = serviceTypes.find(
    (serviceType) => normalizeLookupValue(serviceType.name) === normalizeLookupValue(serviceTypeFilter)
  )?.id
  const filterServiceOptionOptions = [...new Set(
    serviceOptions
      .filter((serviceOption) => {
        if (serviceTypeFilter === 'All') return true
        return serviceOption.service_type_id === currentFilterServiceTypeId
      })
      .map((serviceOption) => serviceOption.name)
  )]

  const currentFormServiceTypeId = serviceTypes.find(
    (serviceType) => normalizeLookupValue(serviceType.name) === normalizeLookupValue(formData.serviceType)
  )?.id
  const formServiceTypeOptions = filterServiceTypeOptions.length > 0 ? filterServiceTypeOptions : ['NICOP/CNIC']
  const formServiceOptionOptions = serviceOptions
    .filter((serviceOption) => {
      if (!currentFormServiceTypeId) return true
      return serviceOption.service_type_id === currentFormServiceTypeId
    })
    .map((serviceOption) => serviceOption.name)

  useEffect(() => {
    if (filterServiceTypeOptions.length === 0) return
    if (serviceTypeFilter === 'All') return

    const exists = filterServiceTypeOptions.some(
      (serviceType) => normalizeLookupValue(serviceType) === normalizeLookupValue(serviceTypeFilter)
    )

    if (!exists) {
      setServiceTypeFilter('All')
    }
  }, [filterServiceTypeOptions, normalizeLookupValue, serviceTypeFilter])

  useEffect(() => {
    if (filterServiceOptionOptions.length === 0) {
      if (serviceOptionFilter !== 'All') setServiceOptionFilter('All')
      return
    }

    if (serviceOptionFilter === 'All') return

    const exists = filterServiceOptionOptions.some(
      (serviceOption) => normalizeLookupValue(serviceOption) === normalizeLookupValue(serviceOptionFilter)
    )

    if (!exists) {
      setServiceOptionFilter('All')
    }
  }, [filterServiceOptionOptions, normalizeLookupValue, serviceOptionFilter])

  useEffect(() => {
    if (formServiceTypeOptions.length === 0) return

    const exists = formServiceTypeOptions.some(
      (serviceType) => normalizeLookupValue(serviceType) === normalizeLookupValue(formData.serviceType)
    )

    if (!exists) {
      setFormData((prev) => ({ ...prev, serviceType: formServiceTypeOptions[0] }))
    }
  }, [formData.serviceType, formServiceTypeOptions, normalizeLookupValue])

  useEffect(() => {
    if (formServiceOptionOptions.length === 0) return

    const exists = formServiceOptionOptions.some(
      (serviceOption) => normalizeLookupValue(serviceOption) === normalizeLookupValue(formData.serviceOption)
    )

    if (!exists) {
      setFormData((prev) => ({ ...prev, serviceOption: formServiceOptionOptions[0] }))
    }
  }, [formData.serviceOption, formServiceOptionOptions, normalizeLookupValue])

  const updateApplicationRecord = useCallback((nadraId: string, updater: (item: any, nadra: any) => any) => {
    setApplications((prev: any[]) => prev.map((item: any) => {
      const nadra = getNadraRecord(item)
      if (!nadra?.id || nadra.id !== nadraId) return item
      return updater(item, nadra)
    }))
  }, [])

  const fetchHistory = useCallback(async (nadraId: string) => {
    setLoadingHistory(true)
    try {
      const response = await fetch(`/api/nadra/status-history?nadraId=${nadraId}`)
      const data = await response.json()
      if (data.history) setHistoryLogs(data.history)
    } finally {
      setLoadingHistory(false)
    }
  }, [])

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

    if (name === 'serviceType') {
      const selectedTypeId = serviceTypes.find(
        (serviceType) => normalizeLookupValue(serviceType.name) === normalizeLookupValue(value)
      )?.id
      const nextServiceOptions = serviceOptions.filter((serviceOption) => serviceOption.service_type_id === selectedTypeId)
      const nextServiceOption = nextServiceOptions[0]?.name || ''

      setFormData((prev) => ({
        ...prev,
        serviceType: value,
        serviceOption: nextServiceOption || prev.serviceOption,
      }))
      return
    }

    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const handleAddMember = (familyHead: any) => {
    setFormData({
      ...formData,
      familyHeadName: `${familyHead.first_name} ${familyHead.last_name}`,
      familyHeadCnic: familyHead.citizen_number,
      familyHeadPhone: familyHead.phone_number || '',
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

  const handleManageDocuments = (familyHeadId: string, familyHeadName: string) => {
    if (!familyHeadId) {
      toast.error('Cannot manage documents for this family')
      return
    }
    router.push(`/dashboard/applications/nadra/documents/${familyHeadId}`)
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
          familyHeadPhone: '',
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

  const sortedApplications = [...applications].sort((a: any, b: any) => {
    const ad = new Date(getCreatedAt(a) || 0).getTime()
    const bd = new Date(getCreatedAt(b) || 0).getTime()
    return bd - ad // newest first
  })

  const filteredApplications = sortedApplications.filter((item: any) => {
    const query = searchQuery.toLowerCase()
    const nadra = getNadraRecord(item)
    const status = normalizeStatus(nadra?.status || 'Pending Submission')

    const matchesSearch =
      item.applicants?.first_name?.toLowerCase().includes(query) ||
      item.applicants?.last_name?.toLowerCase().includes(query) ||
      item.applicants?.citizen_number?.includes(query) ||
      item.tracking_number?.toLowerCase().includes(query) ||
      item.family_heads?.citizen_number?.includes(query)

    const matchesStatus = statusFilter === 'All' || status === normalizeStatus(statusFilter)
    
    // Service type filter
    const serviceType = nadra?.service_type || ''
    const matchesServiceType = serviceTypeFilter === 'All'
      || normalizeLookupValue(serviceType) === normalizeLookupValue(serviceTypeFilter)
    
    // Service option filter
    const details = getDetails(nadra)
    const serviceOption = details?.service_option || ''
    const matchesServiceOption = serviceOptionFilter === 'All'
      || normalizeLookupValue(serviceOption) === normalizeLookupValue(serviceOptionFilter)
    
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

  const groupedEntries = Object.entries(filteredApplications.reduce((acc: any, item: any) => {
    const headCnic = item.family_heads?.citizen_number || 'Independent'
    if (!acc[headCnic]) {
      acc[headCnic] = { head: item.family_heads, members: [] }
    }
    const hasRealMember = !!(item.applicants || item.nadra_services)
    if (hasRealMember) acc[headCnic].members.push(item)
    return acc
  }, {}))

  const totalPages = Math.ceil(groupedEntries.length / pageSize) || 1
  const startIdx = (currentPage - 1) * pageSize
  const pagedGroupedEntries = groupedEntries.slice(startIdx, startIdx + pageSize)

  useEffect(() => { setCurrentPage(1) }, [searchQuery, statusFilter, serviceTypeFilter, serviceOptionFilter, startDate, endDate, showEmptyFamilies])

  const groupedData = Object.fromEntries(pagedGroupedEntries)

  const filteredFamilyCount = new Set(
    filteredApplications
      .map((item: any) => item.family_heads?.citizen_number)
      .filter((value: string | undefined) => Boolean(value))
  ).size

  const complaintsSubmittedCount = filteredApplications.filter((item: any) => {
    const nadraId = getNadraRecord(item)?.id
    return nadraId && complainedNadraIds.has(nadraId)
  }).length

  const activeFilterCount = [
    statusFilter !== 'All',
    serviceTypeFilter !== 'All',
    serviceOptionFilter !== 'All',
    Boolean(startDate),
    Boolean(endDate),
    showEmptyFamilies,
  ].filter(Boolean).length

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
        updateApplicationRecord(nadraId, (item, nadra) => ({
          ...item,
          nadra_services: Array.isArray(item.nadra_services)
            ? [{ ...nadra, status: newStatus }]
            : { ...nadra, status: newStatus }
        }))
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
        fetchHistory(nadraId).catch(() => {
          // Error already shown via toast
        })
      }, 100)
      return () => clearTimeout(timer)
    }
    setHistoryLogs([])
  }, [selectedHistory, fetchHistory])

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
        cnic: record.citizen_number,
        phone: record.phone_number || ''
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
      employeeName: nadra?.employees?.full_name || '',
      notes: nadra?.notes || ''
    })
  }

  const openNotesModal = (record: any) => {
    const nadra = getNadraRecord(record)
    if (!nadra?.id) {
      toast.error('Notes are only available for saved applications')
      return
    }
    setNotesModal({ nadraId: nadra.id, note: nadra?.notes || '' })
    setNotesText(nadra?.notes || '')
  }

  const closeNotesModal = useCallback(() => {
    setNotesModal(null)
  }, [])

  const openComplaintModal = (record: any) => {
    const nadra = getNadraRecord(record)
    if (!nadra?.id) {
      toast.error('Complaints are only available for saved applications')
      return
    }

    setComplaintModal({
      nadraId: nadra.id,
      trackingNumber: nadra?.tracking_number || record?.tracking_number || 'N/A'
    })
    setComplaintNumber('')
    setComplaintDetails('')
  }

  const handleSaveComplaint = async () => {
    if (!complaintModal?.nadraId) return
    if (!complaintNumber.trim()) {
      toast.error('Complaint number is required')
      return
    }
    if (!complaintDetails.trim()) {
      toast.error('Complaint details are required')
      return
    }

    setComplaintSaving(true)
    try {
      const res = await fetch('/api/nadra/complaint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nadraId: complaintModal.nadraId,
          complaintNumber,
          details: complaintDetails,
          userId: currentUserId,
        })
      })

      if (res.ok) {
        toast.success('Complaint recorded')
        setComplaintModal(null)
        if (selectedHistory) {
          await fetchHistory(complaintModal.nadraId)
        }
      } else {
        const payload = await res.json()
        toast.error(payload?.error || 'Failed to record complaint')
      }
    } catch (e) {
      toast.error('Error recording complaint')
    } finally {
      setComplaintSaving(false)
    }
  }

  const handleSaveNotes = async () => {
    if (!notesModal?.nadraId) return
    setNotesSaving(true)
    try {
      const res = await fetch('/api/nadra/manage-record', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update',
          type: 'application',
          id: notesModal.nadraId,
          data: { notes: notesText },
          userId: currentUserId
        })
      })
      if (res.ok) {
        toast.success('Notes updated')
        setNotesModal(null)
        router.refresh()
      } else {
        const payload = await res.json()
        toast.error(payload?.error || 'Failed to update notes')
      }
    } catch (e) {
      toast.error('Error saving notes')
    } finally {
      setNotesSaving(false)
    }
  }

  const handleEditInputChange = useCallback((name: string, value: any) => {
    if (name === 'newBorn') {
      setEditFormData((prev: any) => ({ ...prev, newBorn: value, cnic: value ? '' : prev.cnic }))
      return
    }

    if (name === 'trackingNumber') value = value.toUpperCase()
    setEditFormData((prev: any) => ({ ...prev, [name]: value }))
  }, [])

  const handleEditSubmit = useCallback(async () => {
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
        if (editType === 'application') {
          const selectedAgentName = editFormData.employeeId
            ? agentOptions.find((agent) => agent.id === editFormData.employeeId)?.name || editFormData.employeeName || ''
            : editFormData.employeeName || ''

          updateApplicationRecord(editFormData.id, (item, nadra) => ({
            ...item,
            tracking_number: editFormData.trackingNumber ?? item.tracking_number,
            applicants: item.applicants
              ? {
                  ...item.applicants,
                  first_name: editFormData.firstName ?? item.applicants.first_name,
                  last_name: editFormData.lastName ?? item.applicants.last_name,
                  citizen_number: editFormData.newBorn ? null : (editFormData.cnic ?? item.applicants.citizen_number),
                  email: editFormData.email ?? item.applicants.email,
                }
              : item.applicants,
            nadra_services: Array.isArray(item.nadra_services)
              ? [{
                  ...nadra,
                  service_type: editFormData.serviceType ?? nadra.service_type,
                  tracking_number: editFormData.trackingNumber ?? nadra.tracking_number,
                  application_pin: editFormData.pin ?? nadra.application_pin,
                  employee_id: editFormData.employeeId ?? nadra.employee_id,
                  notes: editFormData.notes ?? nadra.notes,
                  nicop_cnic_details: Array.isArray(nadra.nicop_cnic_details)
                    ? [{ ...(nadra.nicop_cnic_details[0] || {}), service_option: editFormData.serviceOption ?? nadra.nicop_cnic_details[0]?.service_option }]
                    : nadra.nicop_cnic_details
                      ? { ...nadra.nicop_cnic_details, service_option: editFormData.serviceOption ?? nadra.nicop_cnic_details.service_option }
                      : { service_option: editFormData.serviceOption || 'Normal' },
                  employees: editFormData.employeeId
                    ? { ...(nadra.employees || {}), id: editFormData.employeeId, full_name: selectedAgentName }
                    : nadra.employees,
                }]
              : {
                  ...nadra,
                  service_type: editFormData.serviceType ?? nadra.service_type,
                  tracking_number: editFormData.trackingNumber ?? nadra.tracking_number,
                  application_pin: editFormData.pin ?? nadra.application_pin,
                  employee_id: editFormData.employeeId ?? nadra.employee_id,
                  notes: editFormData.notes ?? nadra.notes,
                  nicop_cnic_details: Array.isArray(nadra.nicop_cnic_details)
                    ? [{ ...(nadra.nicop_cnic_details[0] || {}), service_option: editFormData.serviceOption ?? nadra.nicop_cnic_details[0]?.service_option }]
                    : nadra.nicop_cnic_details
                      ? { ...nadra.nicop_cnic_details, service_option: editFormData.serviceOption ?? nadra.nicop_cnic_details.service_option }
                      : { service_option: editFormData.serviceOption || 'Normal' },
                  employees: editFormData.employeeId
                    ? { ...(nadra.employees || {}), id: editFormData.employeeId, full_name: selectedAgentName }
                    : nadra.employees,
                }
          }))
        }

        toast.success('Record updated')
        setEditingRecord(null)
        setEditType(null)
        setEditFormData({})
        setDeleteAuthCode('')
        router.refresh()
      } else {
        const payload = await res.json()
        toast.error(payload?.error || 'Update failed')
      }
    } catch (e) {
      toast.error('Error updating')
    }
  }, [agentOptions, currentUserId, editFormData, editType, router, updateApplicationRecord])

  const handleDelete = useCallback(async () => {
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
        setEditingRecord(null)
        setEditType(null)
        setEditFormData({})
        setDeleteAuthCode('')
        router.refresh()
      } else {
        const payload = await res.json()
        toast.error(payload?.error || 'Delete failed')
      }
    } catch (e) {
      toast.error('Error deleting')
    }
  }, [deleteAuthCode, editType, editFormData.id, currentUserId, router])

  const closeEditModal = useCallback(() => {
    setEditingRecord(null)
    setEditType(null)
    setEditFormData({})
    setDeleteAuthCode('')
  }, [])

  // =====================================================================
  // RENDER
  // =====================================================================

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-2xl border border-emerald-600/30 bg-gradient-to-br from-[#1a4a2e] via-[#1f5c38] to-[#162e20] px-4 py-3 shadow-xl shadow-[#1f5c38]/30">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_18%,rgba(74,222,128,0.08),transparent_36%),radial-gradient(circle_at_88%_14%,rgba(34,197,94,0.05),transparent_40%)]" />

        <div className="relative space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="inline-flex items-center rounded-full border border-emerald-500/40 bg-emerald-900/60 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-300 backdrop-blur-sm">
              NADRA Command Deck
            </span>

            <div className="flex flex-wrap gap-2 text-xs">
              <div className="rounded-lg border border-emerald-400/40 bg-emerald-800/60 px-3 py-1.5 text-white shadow-md shadow-black/20 backdrop-blur-sm flex items-center gap-2">
                <span className="text-[10px] uppercase tracking-[0.12em] text-emerald-300/80 font-semibold">Visible</span>
                <span className="font-black text-sm">{filteredApplications.length}</span>
              </div>
              <div className="rounded-lg border border-emerald-400/40 bg-emerald-800/60 px-3 py-1.5 text-white shadow-md shadow-black/20 backdrop-blur-sm flex items-center gap-2">
                <span className="text-[10px] uppercase tracking-[0.12em] text-emerald-300/80 font-semibold">Families</span>
                <span className="font-black text-sm">{filteredFamilyCount}</span>
              </div>
              <div className="rounded-lg border border-emerald-400/40 bg-emerald-800/60 px-3 py-1.5 text-white shadow-md shadow-black/20 backdrop-blur-sm flex items-center gap-2">
                <span className="text-[10px] uppercase tracking-[0.12em] text-emerald-300/80 font-semibold">Complaints</span>
                <span className="font-black text-sm">{complaintsSubmittedCount}</span>
              </div>
              <div className="rounded-lg border border-emerald-400/40 bg-emerald-800/60 px-3 py-1.5 text-white shadow-md shadow-black/20 backdrop-blur-sm flex items-center gap-2">
                <span className="text-[10px] uppercase tracking-[0.12em] text-emerald-300/80 font-semibold">Filters</span>
                <span className="font-black text-sm">{activeFilterCount}</span>
              </div>
            </div>
          </div>

          <StatsOverview applications={applications} />

          <SearchAndFilter
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            statusFilter={statusFilter}
            onStatusChange={setStatusFilter}
            serviceTypeFilter={serviceTypeFilter}
            onServiceTypeChange={setServiceTypeFilter}
            serviceOptionFilter={serviceOptionFilter}
            onServiceOptionChange={setServiceOptionFilter}
            serviceTypeOptions={filterServiceTypeOptions}
            serviceOptionOptions={filterServiceOptionOptions}
            startDate={startDate}
            onStartDateChange={setStartDate}
            endDate={endDate}
            onEndDateChange={setEndDate}
            showEmptyFamilies={showEmptyFamilies}
            onToggleEmptyFamilies={setShowEmptyFamilies}
          />
        </div>
      </section>

      <FormSection
        showForm={showForm}
        formData={formData}
        isSubmitting={isSubmitting}
        serviceTypeOptions={formServiceTypeOptions}
        serviceOptionOptions={formServiceOptionOptions}
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
        onOpenNotes={openNotesModal}
        onOpenComplaint={openComplaintModal}
        onManageDocuments={handleManageDocuments}
      />

      {/* Pagination */}
      <div className="flex items-center justify-between mt-4">
        <div className="text-xs text-slate-500">
          Showing {groupedEntries.length === 0 ? 0 : startIdx + 1}-{Math.min(startIdx + pageSize, groupedEntries.length)} of {groupedEntries.length} families
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
        serviceOptionOptions={serviceOptions.map((o) => o.name)}
      />

      <HistoryModal
        isOpen={!!selectedHistory}
        selectedHistory={selectedHistory}
        historyLogs={historyLogs}
        loadingHistory={loadingHistory}
        onClose={() => setSelectedHistory(null)}
      />

      <NotesModal
        isOpen={!!notesModal}
        note={notesText}
        onChange={setNotesText}
        onSave={handleSaveNotes}
        onClose={closeNotesModal}
        isSaving={notesSaving}
      />

      {complaintModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col" role="dialog" aria-modal="true" aria-label="Launch complaint">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <div>
                <h3 className="font-bold text-slate-800">Launch Complaint</h3>
                <p className="text-xs text-slate-500 font-mono mt-1">Tracking: {complaintModal.trackingNumber}</p>
              </div>
              <button
                onClick={() => setComplaintModal(null)}
                className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-slate-200 transition text-slate-400"
                type="button"
                aria-label="Close complaint modal"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label htmlFor="nadra-complaint-number" className="block text-xs font-bold uppercase text-slate-400 mb-2">Complaint Number</label>
                <input
                  id="nadra-complaint-number"
                  value={complaintNumber}
                  onChange={(e) => setComplaintNumber(e.target.value.toUpperCase())}
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-mono text-slate-800"
                  placeholder="Enter complaint reference"
                />
              </div>

              <div>
                <label htmlFor="nadra-complaint-details" className="block text-xs font-bold uppercase text-slate-400 mb-2">Complaint Details</label>
                <textarea
                  id="nadra-complaint-details"
                  value={complaintDetails}
                  onChange={(e) => setComplaintDetails(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-800 min-h-[140px]"
                  placeholder="Describe the complaint raised for this application"
                />
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setComplaintModal(null)}
                className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 font-medium hover:bg-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveComplaint}
                disabled={complaintSaving}
                className="px-4 py-2 rounded-lg bg-amber-600 text-white font-bold hover:bg-amber-700 disabled:bg-slate-400"
              >
                {complaintSaving ? 'Saving...' : 'Record Complaint'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
