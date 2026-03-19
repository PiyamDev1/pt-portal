/**
 * Module: app/dashboard/applications/nadra/components/useNadraFormManagement.ts
 * Dashboard module for applications/nadra/components/useNadraFormManagement.ts.
 */

import { useCallback, useState } from 'react'
import type { ChangeEvent } from 'react'
import { toast } from 'sonner'
import { formatCNIC } from './helpers'
import type { NadraPerson } from '@/app/types/nadra'

type ServiceTypeMetadata = {
  id: string
  name: string
}

type ServiceOptionMetadata = {
  id: string
  name: string
  service_type_id: string | null
}

type FormData = {
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

type UseNadraFormManagementParams = {
  currentUserId: string
  serviceTypes: ServiceTypeMetadata[]
  serviceOptions: ServiceOptionMetadata[]
  normalizeLookupValue: (value: string | null | undefined) => string
  onRefresh: () => void
}

type UseNadraFormManagementResult = {
  showForm: boolean
  setShowForm: (value: boolean | ((prev: boolean) => boolean)) => void
  formData: FormData
  isSubmitting: boolean
  setFormServiceType: (value: string) => void
  setFormServiceOption: (value: string) => void
  handleInputChange: (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void
  handleAddMember: (familyHead: NadraPerson) => void
  handleSubmit: () => Promise<void>
}

const INITIAL_FORM_DATA: FormData = {
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
  newBorn: false,
}

export default function useNadraFormManagement({
  currentUserId,
  serviceTypes,
  serviceOptions,
  normalizeLookupValue,
  onRefresh,
}: UseNadraFormManagementParams): UseNadraFormManagementResult {
  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState<FormData>(INITIAL_FORM_DATA)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const setFormServiceType = useCallback((value: string) => {
    setFormData((prev) => ({ ...prev, serviceType: value }))
  }, [])

  const setFormServiceOption = useCallback((value: string) => {
    setFormData((prev) => ({ ...prev, serviceOption: value }))
  }, [])

  const handleInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      const { name, type } = event.target
      let value: string | boolean = type === 'checkbox' ? event.target.checked : event.target.value

      if (name === 'newBorn') {
        setFormData((prev) => ({
          ...prev,
          newBorn: Boolean(value),
          applicantCnic: value ? '' : prev.applicantCnic,
        }))
        return
      }

      if (name === 'familyHeadCnic' || name === 'applicantCnic') {
        value = formatCNIC(String(value))
      }

      if (name === 'trackingNumber') {
        value = String(value).toUpperCase()
      }

      if (name === 'serviceType') {
        const selectedTypeId = serviceTypes.find(
          (serviceType) => normalizeLookupValue(serviceType.name) === normalizeLookupValue(String(value)),
        )?.id
        const nextServiceOptions = serviceOptions.filter(
          (serviceOption) => serviceOption.service_type_id === selectedTypeId,
        )
        const nextServiceOption = nextServiceOptions[0]?.name || ''

        setFormData((prev) => ({
          ...prev,
          serviceType: String(value),
          serviceOption: nextServiceOption || prev.serviceOption,
        }))
        return
      }

      setFormData((prev) => ({ ...prev, [name]: value }))
    },
    [normalizeLookupValue, serviceOptions, serviceTypes],
  )

  const handleAddMember = useCallback((familyHead: NadraPerson) => {
    setFormData({
      ...INITIAL_FORM_DATA,
      familyHeadName: `${familyHead.first_name} ${familyHead.last_name}`,
      familyHeadCnic: familyHead.citizen_number ?? '',
      familyHeadPhone: familyHead.phone_number || '',
    })
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  const handleSubmit = useCallback(async () => {
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
        body: JSON.stringify({ ...formData, currentUserId }),
      })

      const result = await response.json()

      if (!response.ok) {
        toast.error(result.error || 'Failed to save application')
        return
      }

      toast.success('Application saved to ledger!')
      setFormData(INITIAL_FORM_DATA)
      setShowForm(false)
      onRefresh()
    } catch {
      toast.error('An error occurred while saving')
    } finally {
      setIsSubmitting(false)
    }
  }, [currentUserId, formData, onRefresh])

  return {
    showForm,
    setShowForm,
    formData,
    isSubmitting,
    setFormServiceType,
    setFormServiceOption,
    handleInputChange,
    handleAddMember,
    handleSubmit,
  }
}
