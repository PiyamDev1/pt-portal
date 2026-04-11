/**
 * British Passports Client
 * Provides search, add/edit operations, ledger rendering,
 * and history workflows for GB passport applications.
 */
'use client'

import { useState, useEffect, useMemo } from 'react'
import type { ChangeEvent } from 'react'
import { toast } from 'sonner'
import FormSection from './components/FormSection'
import EditModal from './components/EditModal'
import HistoryModal from './components/HistoryModal'
import LedgerTable from './components/LedgerTable'
import SearchHeader from './components/SearchHeader'
import { useRouter, useSearchParams } from 'next/navigation'
import { useReceipt, type GeneratedReceipt } from '@/hooks'
import ReceiptViewerModal from '@/app/dashboard/applications/components/ReceiptViewerModal'
import ReceiptHistoryModal from '@/app/dashboard/applications/components/ReceiptHistoryModal'
import type { GbEditFormData, GbHistoryLog, GbMetadata, GbPassportItem } from './components/types'

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

type GbPassportsClientProps = {
  initialData: GbPassportItem[]
  currentUserId: string | number
}

export default function GbPassportsClient({ initialData, currentUserId }: GbPassportsClientProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const attentionMode = searchParams.get('focus') === 'attention'
  const [searchTerm, setSearchTerm] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // New: Store database options
  const [metadata, setMetadata] = useState<GbMetadata>({
    ages: [],
    pages: [],
    services: [],
    pricing: [],
  })

  // Edit modal state
  const [editModal, setEditModal] = useState<GbPassportItem | null>(null)
  const [editFormData, setEditFormData] = useState<GbEditFormData>({
    id: '',
    applicantName: '',
    applicantPassport: '',
    dateOfBirth: '',
    phoneNumber: '',
    pexNumber: '',
    status: 'Pending Submission',
  })
  const [isEditSaving, setIsEditSaving] = useState(false)
  const [deleteAuthCode, setDeleteAuthCode] = useState('')
  const { generateReceipt } = useReceipt()
  const [receiptViewerOpen, setReceiptViewerOpen] = useState(false)
  const [activeReceipt, setActiveReceipt] = useState<GeneratedReceipt | null>(null)

  // History modal state
  const [selectedHistory, setSelectedHistory] = useState<GbPassportItem | null>(null)
  const [receiptHistoryApplicantId, setReceiptHistoryApplicantId] = useState<string | null>(null)
  const [historyLogs, setHistoryLogs] = useState<GbHistoryLog[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)

  // Fetch metadata on mount
  useEffect(() => {
    fetch('/api/passports/gb/metadata')
      .then((res) => res.json())
      .then((data) => setMetadata(data))
      .catch(() => {
        // Silently fail - will use defaults
      })
  }, [])

  // Fetch history when selected
  useEffect(() => {
    if (selectedHistory?.id) {
      setLoadingHistory(true)
      fetch(`/api/passports/gb/status-history?passportId=${selectedHistory.id}`)
        .then((res) => res.json())
        .then((data) => setHistoryLogs(data.history || []))
        .catch((err) => toast.error('Failed to load history'))
        .finally(() => setLoadingHistory(false))
    }
  }, [selectedHistory])

  const [formData, setFormData] = useState<FormData>({
    applicantName: '',
    applicantPassport: '',
    dateOfBirth: '',
    phoneNumber: '',
    pexNumber: '',
    ageGroup: '', // empty default
    pages: '', // empty default
    serviceType: '', // empty default
  })

  const handleInputChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    setFormData({ ...formData, [name]: value })
  }

  const handleSubmit = async () => {
    if (
      !formData.applicantName ||
      !formData.pexNumber ||
      !formData.ageGroup ||
      !formData.pages ||
      !formData.serviceType
    ) {
      toast.error('Please fill all required fields')
      return
    }

    setIsSubmitting(true)
    try {
      const res = await fetch('/api/passports/gb/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, currentUserId }),
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
        serviceType: '',
      })
      setShowForm(false)
      router.refresh()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setIsSubmitting(false)
    }
  }

  const openEditModal = (item: GbPassportItem) => {
    setEditFormData({
      id: item.id,
      applicantName: `${item.applicants?.first_name} ${item.applicants?.last_name}`,
      applicantPassport: item.applicants?.passport_number || '',
      dateOfBirth: item.applicants?.date_of_birth || '',
      phoneNumber: item.applicants?.phone_number || '',
      pexNumber: item.pex_number || '',
      status: item.status || 'Pending Submission',
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
          userId: currentUserId,
        }),
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to update status')
      }

      toast.success('Status Updated')
      router.refresh()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to update status')
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
          userId: currentUserId,
        }),
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to update')
      }

      toast.success('Application Updated Successfully')
      setEditModal(null)
      setEditFormData({
        id: '',
        applicantName: '',
        applicantPassport: '',
        dateOfBirth: '',
        phoneNumber: '',
        pexNumber: '',
        status: 'Pending Submission',
      })
      router.refresh()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to update')
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
          userId: currentUserId,
        }),
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to delete')
      }

      toast.success('Application Deleted Successfully')
      setEditModal(null)
      setEditFormData({
        id: '',
        applicantName: '',
        applicantPassport: '',
        dateOfBirth: '',
        phoneNumber: '',
        pexNumber: '',
        status: 'Pending Submission',
      })
      setDeleteAuthCode('')
      router.refresh()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to delete')
    }
  }

  const handleGenerateReceipt = async (item: GbPassportItem) => {
    if (!item?.id) {
      toast.error('No GB application record found for receipt generation')
      return
    }

    try {
      const payload = await generateReceipt({
        serviceType: 'gb_passport',
        serviceRecordId: item.id,
        receiptType: 'submission',
        generatedBy: String(currentUserId),
      })

      setActiveReceipt(payload.receipt)
      setReceiptViewerOpen(true)
      toast.success('Receipt generated successfully')
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to generate receipt')
    }
  }

  const searchTermLower = useMemo(() => searchTerm.toLowerCase(), [searchTerm])

  const filtered = useMemo(
    () =>
      initialData.filter((item) => {
        const matchesSearch = JSON.stringify(item).toLowerCase().includes(searchTermLower)
        const matchesAttention =
          !attentionMode || (item.status || 'Pending Submission') === 'Pending Submission'
        return matchesSearch && matchesAttention
      }),
    [initialData, searchTermLower, attentionMode],
  )

  return (
    <div className="space-y-6">
      {attentionMode && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800">
          Attention mode is active: showing only records with status Pending Submission.
        </div>
      )}

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

      <ReceiptViewerModal
        isOpen={receiptViewerOpen}
        onClose={() => setReceiptViewerOpen(false)}
        receipt={activeReceipt}
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
        onGenerateReceipt={handleGenerateReceipt}
        onOpenReceiptHistory={(item) => setReceiptHistoryApplicantId(item.applicants?.id || null)}
      />

      <ReceiptHistoryModal
        isOpen={!!receiptHistoryApplicantId}
        onClose={() => setReceiptHistoryApplicantId(null)}
        applicantId={receiptHistoryApplicantId}
        serviceType="gb_passport"
        title="GB Passport Receipt History"
      />

      {/* Edit Modal */}
      <EditModal
        isOpen={!!editModal}
        editFormData={editFormData}
        setEditFormData={setEditFormData}
        onSave={handleEditSave}
        onClose={() => {
          setEditModal(null)
          setEditFormData({
            id: '',
            applicantName: '',
            applicantPassport: '',
            dateOfBirth: '',
            phoneNumber: '',
            pexNumber: '',
            status: 'Pending Submission',
          })
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
