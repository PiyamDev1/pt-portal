/**
 * Module: app/dashboard/applications/nadra/components/useNadraEditManagement.ts
 * Dashboard module for applications/nadra/components/useNadraEditManagement.ts.
 */

import { useCallback, useState } from 'react'
import { toast } from 'sonner'
import { getDetails, getNadraRecord } from './helpers'
import type {
  NadraApplication,
  NadraEditFormData,
  NadraEditType,
  NadraPerson,
  NadraServiceRecord,
} from '@/app/types/nadra'

type AgentOption = {
  id: string
  name: string
}

type UseNadraEditManagementParams = {
  currentUserId: string
  agentOptions: AgentOption[]
  updateApplicationRecord: (
    nadraId: string,
    updater: (item: NadraApplication, nadra: NadraServiceRecord) => NadraApplication,
  ) => void
  onRefresh: () => void
}

type UseNadraEditManagementResult = {
  editingRecord: NadraApplication | NadraPerson | null
  editType: NadraEditType | null
  editFormData: NadraEditFormData
  deleteAuthCode: string
  setDeleteAuthCode: (value: string) => void
  openEditModal: (record: NadraApplication | NadraPerson, type: NadraEditType) => void
  handleEditInputChange: (name: keyof NadraEditFormData, value: string | boolean) => void
  handleEditSubmit: () => Promise<void>
  handleDelete: () => Promise<void>
  closeEditModal: () => void
}

export default function useNadraEditManagement({
  currentUserId,
  agentOptions,
  updateApplicationRecord,
  onRefresh,
}: UseNadraEditManagementParams): UseNadraEditManagementResult {
  const [editingRecord, setEditingRecord] = useState<NadraApplication | NadraPerson | null>(null)
  const [editType, setEditType] = useState<NadraEditType | null>(null)
  const [editFormData, setEditFormData] = useState<NadraEditFormData>({})
  const [deleteAuthCode, setDeleteAuthCode] = useState('')

  const openEditModal = useCallback((record: NadraApplication | NadraPerson, type: NadraEditType) => {
    setEditType(type)
    setEditingRecord(record)
    setDeleteAuthCode('')

    if (type === 'family_head') {
      const familyHead = record as NadraPerson
      setEditFormData({
        id: familyHead.id,
        firstName: familyHead.first_name || '',
        lastName: familyHead.last_name || '',
        cnic: familyHead.citizen_number || '',
        phone: familyHead.phone_number || '',
      })
      return
    }

    const application = record as NadraApplication
    const nadra = getNadraRecord(application)
    const details = getDetails(nadra)
    const rawCnic = application.applicants?.citizen_number
    const isNewBorn = !rawCnic || rawCnic.startsWith('00000')

    setEditFormData({
      id: nadra?.id,
      applicationId: application.id || undefined,
      applicantId: application.applicants?.id,
      firstName: application.applicants?.first_name || '',
      lastName: application.applicants?.last_name || '',
      cnic: isNewBorn ? '' : rawCnic,
      newBorn: isNewBorn,
      email: application.applicants?.email || '',
      serviceType: nadra?.service_type || undefined,
      serviceOption: details?.service_option || 'Normal',
      trackingNumber: application.tracking_number || '',
      pin: nadra?.application_pin || undefined,
      employeeId: nadra?.employee_id || '',
      employeeName:
        (Array.isArray(nadra?.employees)
          ? nadra?.employees[0]?.full_name
          : nadra?.employees?.full_name) || '',
      notes: nadra?.notes || '',
    })
  }, [])

  const handleEditInputChange = useCallback((name: keyof NadraEditFormData, value: string | boolean) => {
    if (name === 'newBorn') {
      setEditFormData((prev) => ({
        ...prev,
        newBorn: Boolean(value),
        cnic: value ? '' : prev.cnic,
      }))
      return
    }

    const normalizedValue =
      name === 'trackingNumber' && typeof value === 'string' ? value.toUpperCase() : value
    setEditFormData((prev) => ({ ...prev, [name]: normalizedValue }))
  }, [])

  const handleEditSubmit = useCallback(async () => {
    if (!editType || !editFormData.id) {
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
          userId: currentUserId,
        }),
      })

      if (!res.ok) {
        const payload = await res.json()
        toast.error(payload?.error || 'Update failed')
        return
      }

      if (editType === 'application') {
        const selectedAgentName = editFormData.employeeId
          ? agentOptions.find((agent) => agent.id === editFormData.employeeId)?.name ||
            editFormData.employeeName ||
            ''
          : editFormData.employeeName || ''

        updateApplicationRecord(editFormData.id, (item, nadra) => ({
          ...item,
          tracking_number: editFormData.trackingNumber ?? item.tracking_number,
          applicants: item.applicants
            ? {
                ...item.applicants,
                first_name: editFormData.firstName ?? item.applicants.first_name,
                last_name: editFormData.lastName ?? item.applicants.last_name,
                citizen_number: editFormData.newBorn
                  ? null
                  : (editFormData.cnic ?? item.applicants.citizen_number),
                email: editFormData.email ?? item.applicants.email,
              }
            : item.applicants,
          nadra_services: Array.isArray(item.nadra_services)
            ? [
                {
                  ...nadra,
                  service_type: editFormData.serviceType ?? nadra.service_type,
                  tracking_number: editFormData.trackingNumber ?? nadra.tracking_number,
                  application_pin: editFormData.pin ?? nadra.application_pin,
                  employee_id: editFormData.employeeId ?? nadra.employee_id,
                  notes: editFormData.notes ?? nadra.notes,
                  nicop_cnic_details: Array.isArray(nadra.nicop_cnic_details)
                    ? [
                        {
                          ...(nadra.nicop_cnic_details[0] || {}),
                          service_option:
                            editFormData.serviceOption ??
                            nadra.nicop_cnic_details[0]?.service_option,
                        },
                      ]
                    : nadra.nicop_cnic_details
                      ? {
                          ...nadra.nicop_cnic_details,
                          service_option:
                            editFormData.serviceOption ?? nadra.nicop_cnic_details.service_option,
                        }
                      : { service_option: editFormData.serviceOption || 'Normal' },
                  employees: editFormData.employeeId
                    ? {
                        ...(nadra.employees || {}),
                        id: editFormData.employeeId,
                        full_name: selectedAgentName,
                      }
                    : nadra.employees,
                },
              ]
            : {
                ...nadra,
                service_type: editFormData.serviceType ?? nadra.service_type,
                tracking_number: editFormData.trackingNumber ?? nadra.tracking_number,
                application_pin: editFormData.pin ?? nadra.application_pin,
                employee_id: editFormData.employeeId ?? nadra.employee_id,
                notes: editFormData.notes ?? nadra.notes,
                nicop_cnic_details: Array.isArray(nadra.nicop_cnic_details)
                  ? [
                      {
                        ...(nadra.nicop_cnic_details[0] || {}),
                        service_option:
                          editFormData.serviceOption ?? nadra.nicop_cnic_details[0]?.service_option,
                      },
                    ]
                  : nadra.nicop_cnic_details
                    ? {
                        ...nadra.nicop_cnic_details,
                        service_option:
                          editFormData.serviceOption ?? nadra.nicop_cnic_details.service_option,
                      }
                    : { service_option: editFormData.serviceOption || 'Normal' },
                employees: editFormData.employeeId
                  ? {
                      ...(nadra.employees || {}),
                      id: editFormData.employeeId,
                      full_name: selectedAgentName,
                    }
                  : nadra.employees,
              },
        }))
      }

      toast.success('Record updated')
      setEditingRecord(null)
      setEditType(null)
      setEditFormData({})
      setDeleteAuthCode('')
      onRefresh()
    } catch {
      toast.error('Error updating')
    }
  }, [agentOptions, currentUserId, editFormData, editType, onRefresh, updateApplicationRecord])

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
          userId: currentUserId,
        }),
      })

      if (!res.ok) {
        const payload = await res.json()
        toast.error(payload?.error || 'Delete failed')
        return
      }

      toast.success('Record deleted permanently')
      setEditingRecord(null)
      setEditType(null)
      setEditFormData({})
      setDeleteAuthCode('')
      onRefresh()
    } catch {
      toast.error('Error deleting')
    }
  }, [currentUserId, deleteAuthCode, editFormData.id, editType, onRefresh])

  const closeEditModal = useCallback(() => {
    setEditingRecord(null)
    setEditType(null)
    setEditFormData({})
    setDeleteAuthCode('')
  }, [])

  return {
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
  }
}
