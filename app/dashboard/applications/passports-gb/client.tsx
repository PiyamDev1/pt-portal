'use client'

import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import FormSection from './components/FormSection'
import EditModal from './components/EditModal'
import HistoryModal from './components/HistoryModal'
import LedgerTable from './components/LedgerTable'
import SearchHeader from './components/SearchHeader'
import { useRouter } from 'next/navigation'

interface FormData {
  applicantName: string
  applicantPassport: string
  dateOfBirth: string
  phoneNumber: string
  pexNumber: string
  ageGroup: string
  pages: string
  serviceType: string
}

export default function GbPassportsClient({ initialData, currentUserId }: any) {
  const router = useRouter()
  const [searchTerm, setSearchTerm] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  
  // New: Store database options
  const [metadata, setMetadata] = useState<any>({ ages: [], pages: [], services: [], pricing: [] })

  // Edit modal state
  const [editModal, setEditModal] = useState<any>(null)
  const [editFormData, setEditFormData] = useState<any>({})
  const [isEditSaving, setIsEditSaving] = useState(false)
  const [deleteAuthCode, setDeleteAuthCode] = useState('')

  // History modal state
  const [selectedHistory, setSelectedHistory] = useState<any>(null)
  const [historyLogs, setHistoryLogs] = useState<any[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)

  // Fetch metadata on mount
  useEffect(() => {
    fetch('/api/passports/gb/metadata')
      .then(res => res.json())
      .then(data => setMetadata(data))
      .catch(err => console.error("Failed to load GB metadata", err))
  }, [])

  // Fetch history when selected
  useEffect(() => {
    if (selectedHistory?.id) {
      setLoadingHistory(true)
      fetch(`/api/passports/gb/status-history?passportId=${selectedHistory.id}`)
        .then(res => res.json())
        .then(data => setHistoryLogs(data.history || []))
        .catch(err => toast.error("Failed to load history"))
        .finally(() => setLoadingHistory(false))
    }
  }, [selectedHistory])

  const [formData, setFormData] = useState<FormData>({
    applicantName: '',
    applicantPassport: '',
    dateOfBirth: '',
    phoneNumber: '',
    pexNumber: '',
    ageGroup: '',    // empty default
    pages: '',       // empty default
    serviceType: ''  // empty default
  })

  const handleInputChange = (e: any) => {
    const { name, value } = e.target
    setFormData({ ...formData, [name]: value })
  }

  const handleSubmit = async () => {
    if (!formData.applicantName || !formData.pexNumber || !formData.ageGroup || !formData.pages || !formData.serviceType) {
      toast.error('Please fill all required fields')
      return
    }

    setIsSubmitting(true)
    try {
      const res = await fetch('/api/passports/gb/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, currentUserId })
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to save')
      }

      toast.success('GB Application Created Successfully')
      // Reset form
      setFormData({
        applicantName: '',
        applicantPassport: '',
        dateOfBirth: '',
        phoneNumber: '',
        pexNumber: '',
        ageGroup: '',
        pages: '',
        serviceType: ''
      })
      setShowForm(false)
      router.refresh()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const openEditModal = (item: any) => {
    setEditFormData({
      id: item.id,
      applicantName: `${item.applicants?.first_name} ${item.applicants?.last_name}`,
      applicantPassport: item.applicants?.passport_number || '',
      dateOfBirth: item.applicants?.date_of_birth || '',
      phoneNumber: item.applicants?.phone_number || '',
      pexNumber: item.pex_number || '',
      status: item.status || 'Pending Submission'
    })
    setEditModal(item)
  }

  const handleStatusChange = async (id: string, newStatus: string) => {
    try {
      const res = await fetch('/api/passports/gb/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          status: newStatus,
          userId: currentUserId
        })
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to update status')
      }

      toast.success('Status Updated')
      router.refresh()
    } catch (e: any) {
      toast.error(e.message)
    }
  }

  const handleEditSave = async () => {
    setIsEditSaving(true)
    try {
      const res = await fetch('/api/passports/gb/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editFormData.id,
          applicantName: editFormData.applicantName,
          applicantPassport: editFormData.applicantPassport,
          dateOfBirth: editFormData.dateOfBirth,
          phoneNumber: editFormData.phoneNumber,
          pexNumber: editFormData.pexNumber,
          status: editFormData.status,
          userId: currentUserId
        })
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to update')
      }

      toast.success('Application Updated Successfully')
      setEditModal(null)
      setEditFormData({})
      router.refresh()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setIsEditSaving(false)
    }
  }

  const handleDeleteRecord = async (authCode: string) => {
    try {
      const res = await fetch('/api/passports/gb/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editFormData.id,
          authCode,
          userId: currentUserId
        })
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to delete')
      }

      toast.success('Application Deleted Successfully')
      setEditModal(null)
      setEditFormData({})
      setDeleteAuthCode('')
      router.refresh()
    } catch (e: any) {
      toast.error(e.message)
    }
  }

  const filtered = initialData.filter((item: any) =>
    JSON.stringify(item).toLowerCase().includes(searchTerm.toLowerCase())
  )

  return (
    <div className="space-y-6">
      {/* Page Title */}
      <div>
        <h1 className="text-3xl font-bold text-slate-900">British Passport Applications</h1>
        <p className="text-sm text-slate-500 mt-1">Manage and track all GB passport applications</p>
      </div>

      {/* Search & Header */}
      <SearchHeader 
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        showForm={showForm}
        onToggleForm={() => setShowForm(!showForm)}
      />

      {/* Form Section - Passing Metadata */}
      <FormSection
        showForm={showForm}
        formData={formData}
        isSubmitting={isSubmitting}
        onInputChange={handleInputChange}
        onSubmit={handleSubmit}
        onToggle={() => setShowForm(!showForm)}
        metadata={metadata}
      />

      {/* Ledger Table */}
      <LedgerTable 
        items={filtered}
        onStatusChange={handleStatusChange}
        onViewHistory={(item) => setSelectedHistory(item)}
        onEdit={openEditModal}
      />

      {/* Edit Modal */}
      <EditModal
        isOpen={!!editModal}
        editFormData={editFormData}
        setEditFormData={setEditFormData}
        onSave={handleEditSave}
        onClose={() => {
          setEditModal(null)
          setEditFormData({})
          setDeleteAuthCode('')
        }}
        isSaving={isEditSaving}
        onDelete={handleDeleteRecord}
      />

      {/* History Modal */}
      <HistoryModal
        isOpen={!!selectedHistory} 
        onClose={() => setSelectedHistory(null)}
        data={historyLogs}
        isLoading={loadingHistory}
        title={`${selectedHistory?.applicants?.first_name || ''} ${selectedHistory?.applicants?.last_name || ''}`}
      />
    </div>
  )
}
