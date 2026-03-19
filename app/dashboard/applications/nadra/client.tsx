/**
 * Module: app/dashboard/applications/nadra/client.tsx
 * Dashboard module for applications/nadra/client.tsx.
 */

'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { toast } from 'sonner'
import { useRouter, useSearchParams } from 'next/navigation'
import { getNadraRecord } from './components/helpers'
import { ConfirmationDialog } from '@/components/ConfirmationDialog'
import SearchAndFilter from './components/SearchAndFilter'
import FormSection from './components/FormSection'
import LedgerTable from './components/LedgerTable'
import EditModal from './components/EditModal'
import HistoryModal from './components/HistoryModal'
import NotesModal from './components/NotesModal'
import NadraCommandDeck from './components/NadraCommandDeck'
import NadraPagination from './components/NadraPagination'
import NadraComplaintModal from './components/NadraComplaintModal'
import useNadraApplicationFiltering from './components/useNadraApplicationFiltering'
import useNadraServiceMetadata from './components/useNadraServiceMetadata'
import useNadraEditManagement from './components/useNadraEditManagement'
import useNadraAuxiliaryManagement from './components/useNadraAuxiliaryManagement'
import useNadraFormManagement from './components/useNadraFormManagement'
import type {
  NadraApplication,
  NadraClientProps,
  NadraPerson,
  NadraServiceRecord,
} from '@/app/types/nadra'

export default function NadraClient({
  initialApplications,
  currentUserId,
  initialComplainedNadraIds = [],
}: NadraClientProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [applications, setApplications] = useState<NadraApplication[]>(initialApplications)

  // SEARCH & FILTER STATES (grouped)
  type FilterState = {
    searchQuery: string
    statusFilter: string
    serviceTypeFilter: string
    serviceOptionFilter: string
    startDate: string
    endDate: string
    showEmptyFamilies: boolean
    currentPage: number
  }
  const [filters, setFilters] = useState<FilterState>({
    searchQuery: '',
    statusFilter: 'All',
    serviceTypeFilter: 'All',
    serviceOptionFilter: 'All',
    startDate: '',
    endDate: '',
    showEmptyFamilies: false,
    currentPage: 1,
  })
  const {
    searchQuery, statusFilter, serviceTypeFilter, serviceOptionFilter,
    startDate, endDate, showEmptyFamilies, currentPage,
  } = filters
  const pageSize = 25

  const [refundTargetId, setRefundTargetId] = useState<string | null>(null)

  const [isUpdating, setIsUpdating] = useState(false)
  const isAttentionFocus = searchParams.get('focus') === 'attention'

  const normalizeLookupValue = useCallback(
    (value: string | null | undefined) =>
      String(value || '')
        .trim()
        .toLowerCase(),
    [],
  )

  useEffect(() => {
    setApplications(initialApplications)
  }, [initialApplications])

  useEffect(() => {
    if (searchParams.get('focus') === 'attention') {
      setFilters((prev) => ({ ...prev, statusFilter: 'Pending Submission' }))
    }
  }, [searchParams])

  const refreshData = useCallback(() => {
    router.refresh()
  }, [router])

  // Stable filter-setter callbacks consumed by child hooks
  const setSearchQuery = useCallback(
    (v: string) => setFilters((prev) => ({ ...prev, searchQuery: v, currentPage: 1 })),
    [],
  )
  const setStatusFilter = useCallback(
    (v: string) => setFilters((prev) => ({ ...prev, statusFilter: v, currentPage: 1 })),
    [],
  )
  const setServiceTypeFilter = useCallback(
    (v: string) => setFilters((prev) => ({ ...prev, serviceTypeFilter: v, currentPage: 1 })),
    [],
  )
  const setServiceOptionFilter = useCallback(
    (v: string) => setFilters((prev) => ({ ...prev, serviceOptionFilter: v, currentPage: 1 })),
    [],
  )
  const setStartDate = useCallback(
    (v: string) => setFilters((prev) => ({ ...prev, startDate: v, currentPage: 1 })),
    [],
  )
  const setEndDate = useCallback(
    (v: string) => setFilters((prev) => ({ ...prev, endDate: v, currentPage: 1 })),
    [],
  )
  const setShowEmptyFamilies = useCallback(
    (v: boolean) => setFilters((prev) => ({ ...prev, showEmptyFamilies: v, currentPage: 1 })),
    [],
  )
  const setCurrentPage = useCallback(
    (value: number | ((prev: number) => number)) =>
      setFilters((prev) => ({
        ...prev,
        currentPage: typeof value === 'function' ? value(prev.currentPage) : value,
      })),
    [],
  )

  const {
    serviceTypes,
    serviceOptions,
    filterServiceTypeOptions,
    filterServiceOptionOptions,
    formServiceTypeOptions,
    formServiceOptionOptions,
  } = useNadraServiceMetadata({
    serviceTypeFilter,
    serviceOptionFilter,
    formServiceType: 'NICOP/CNIC',
    formServiceOption: 'Normal',
    normalizeLookupValue,
    setServiceTypeFilter,
    setServiceOptionFilter,
    setFormServiceType: () => {},
    setFormServiceOption: () => {},
  })

  const {
    showForm,
    setShowForm,
    formData,
    isSubmitting,
    setFormServiceType,
    setFormServiceOption,
    handleInputChange,
    handleAddMember,
    handleSubmit,
  } = useNadraFormManagement({
    currentUserId,
    serviceTypes,
    serviceOptions,
    normalizeLookupValue,
    onRefresh: refreshData,
  })

  const updateApplicationRecord = useCallback(
    (
      nadraId: string,
      updater: (item: NadraApplication, nadra: NadraServiceRecord) => NadraApplication,
    ) => {
      setApplications((prev) =>
        prev.map((item) => {
          const nadra = getNadraRecord(item)
          if (!nadra?.id || nadra.id !== nadraId) return item
          return updater(item, nadra)
        }),
      )
    },
    [],
  )

  const {
    selectedHistory,
    setSelectedHistory,
    historyLogs,
    loadingHistory,
    notesModal,
    notesText,
    setNotesText,
    notesSaving,
    openNotesModal,
    closeNotesModal,
    handleSaveNotes,
    complaintModal,
    complaintNumber,
    setComplaintNumber,
    complaintDetails,
    setComplaintDetails,
    complaintSaving,
    openComplaintModal,
    closeComplaintModal,
    handleSaveComplaint,
    agentOptions,
    canChangeAgent,
    complainedNadraIds,
  } = useNadraAuxiliaryManagement({
    currentUserId,
    initialComplainedNadraIds,
    onRefresh: refreshData,
  })

  const {
    editingRecord,
    editType,
    editFormData,
    deleteAuthCode,
    setDeleteAuthCode,
    openEditModal,
    handleEditInputChange,
    handleEditSubmit,
    handleDelete,
    closeEditModal,
  } = useNadraEditManagement({
    currentUserId,
    agentOptions,
    updateApplicationRecord,
    onRefresh: refreshData,
  })

  const handleManageDocuments = (familyHeadId: string, familyHeadName: string) => {
    if (!familyHeadId) {
      toast.error('Cannot manage documents for this family')
      return
    }
    router.push(`/dashboard/applications/nadra/documents/${familyHeadId}`)
  }

  const {
    filteredApplications,
    groupedEntries,
    groupedData,
    filteredFamilyCount,
    complaintsSubmittedCount,
    activeFilterCount,
    totalPages,
    startIdx,
  } = useNadraApplicationFiltering({
    applications,
    searchQuery,
    statusFilter,
    serviceTypeFilter,
    serviceOptionFilter,
    startDate,
    endDate,
    showEmptyFamilies,
    complainedNadraIds,
    currentPage,
    pageSize,
    setCurrentPage,
    normalizeLookupValue,
  })

  const serviceOptionNames = useMemo(() => serviceOptions.map((option) => option.name), [
    serviceOptions,
  ])

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
        body: JSON.stringify({ nadraId, status: newStatus, userId: currentUserId }),
      })
      if (res.ok) {
        updateApplicationRecord(nadraId, (item, nadra) => ({
          ...item,
          nadra_services: Array.isArray(item.nadra_services)
            ? [{ ...nadra, status: newStatus }]
            : { ...nadra, status: newStatus },
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

  const handleMarkRefund = async (nadraId: string) => {
    if (!nadraId) return
    setRefundTargetId(nadraId)
  }

  const confirmMarkRefund = async () => {
    if (!refundTargetId) return

    setIsUpdating(true)
    try {
      const res = await fetch('/api/nadra/refund', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nadraId: refundTargetId, userId: currentUserId }),
      })

      const payload = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(payload?.error || 'Failed to mark refund')
        return
      }

      updateApplicationRecord(refundTargetId, (item, nadra) => ({
        ...item,
        nadra_services: Array.isArray(item.nadra_services)
          ? [
              {
                ...nadra,
                is_refunded: true,
                refunded_at: payload?.refundedAt || new Date().toISOString(),
              },
            ]
          : {
              ...nadra,
              is_refunded: true,
              refunded_at: payload?.refundedAt || new Date().toISOString(),
            },
      }))

      toast.success(payload?.alreadyRefunded ? 'Already marked as refunded' : 'Refund recorded')
      router.refresh()
    } catch (error) {
      toast.error('Error processing refund')
    } finally {
      setIsUpdating(false)
      setRefundTargetId(null)
    }
  }

  // =====================================================================
  // RENDER
  // =====================================================================

  return (
    <div className="space-y-6">
      {isAttentionFocus && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800">
          Attention mode is active: status filter set to Pending Submission.
        </div>
      )}

      <NadraCommandDeck
        applications={applications}
        visibleCount={filteredApplications.length}
        familyCount={filteredFamilyCount}
        complaintsCount={complaintsSubmittedCount}
        activeFilterCount={activeFilterCount}
      >
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
      </NadraCommandDeck>

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
        onMarkRefund={handleMarkRefund}
        onEditApplication={(item) => openEditModal(item, 'application')}
        onEditHead={(head) => openEditModal(head, 'family_head')}
        onAddMember={handleAddMember}
        onViewHistory={setSelectedHistory}
        onOpenNotes={openNotesModal}
        onOpenComplaint={openComplaintModal}
        onManageDocuments={handleManageDocuments}
      />

      <NadraPagination
        groupedEntriesLength={groupedEntries.length}
        startIdx={startIdx}
        pageSize={pageSize}
        currentPage={currentPage}
        totalPages={totalPages}
        onPrevious={() => setCurrentPage((page) => Math.max(1, page - 1))}
        onNext={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
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
        agentOptions={agentOptions}
        canChangeAgent={canChangeAgent}
        serviceOptionOptions={serviceOptionNames}
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

      <ConfirmationDialog
        isOpen={!!refundTargetId}
        onClose={() => setRefundTargetId(null)}
        onConfirm={confirmMarkRefund}
        isLoading={isUpdating}
        type="warning"
        title="Confirm Refund"
        message="Mark this cancelled NADRA application as refunded? This action cannot be undone."
        confirmLabel="Mark Refunded"
        cancelLabel="Cancel"
      />

      <NadraComplaintModal
        isOpen={Boolean(complaintModal)}
        trackingNumber={complaintModal?.trackingNumber || 'N/A'}
        complaintNumber={complaintNumber}
        complaintDetails={complaintDetails}
        complaintSaving={complaintSaving}
        onComplaintNumberChange={setComplaintNumber}
        onComplaintDetailsChange={setComplaintDetails}
        onSave={handleSaveComplaint}
        onClose={closeComplaintModal}
      />
    </div>
  )
}
