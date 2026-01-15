import { useState, useCallback } from 'react'
import { DEFAULT_VISA_FORM_STATE } from '@/app/lib/visaConstants'

export function useVisaFormState(initialData?: any) {
  const [formData, setFormData] = useState<any>(() => {
    if (initialData) {
      return {
        id: initialData.id,
        internalTrackingNo: initialData.internal_tracking_number,
        applicantName: `${initialData.applicants?.first_name} ${initialData.applicants?.last_name}`,
        applicantPassport: initialData.passport_number_used || initialData.applicants?.passport_number || '',
        applicantDob: initialData.applicants?.dob || '',
        applicantNationality: '',
        countryId: initialData.visa_countries?.id || '',
        visaTypeName: initialData.visa_types?.name || '',
        validity: initialData.validity || '',
        basePrice: initialData.base_price || 0,
        customerPrice: initialData.customer_price || 0,
        isPartOfPackage: initialData.is_part_of_package || false,
        status: initialData.status
      }
    }
    return DEFAULT_VISA_FORM_STATE
  })

  // Single updateField method to replace repetitive setFormData calls
  const updateField = useCallback((fieldName: string, value: any) => {
    setFormData((prev: any) => ({
      ...prev,
      [fieldName]: value
    }))
  }, [])

  // Batch update multiple fields
  const updateFields = useCallback((updates: Record<string, any>) => {
    setFormData((prev: any) => ({
      ...prev,
      ...updates
    }))
  }, [])

  // Reset to initial state
  const reset = useCallback(() => {
    setFormData(DEFAULT_VISA_FORM_STATE)
  }, [])

  return {
    formData,
    setFormData,
    updateField,
    updateFields,
    reset
  }
}
