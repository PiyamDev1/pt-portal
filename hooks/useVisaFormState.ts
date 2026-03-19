/**
 * Visa Form State Hook
 * Manages visa application form state with edit, batch update, and reset capabilities
 * Supports both new applications and editing existing ones
 * 
 * @module hooks/useVisaFormState
 */

import { useState, useCallback } from 'react'
import { DEFAULT_VISA_FORM_STATE } from '@/lib/visaConstants'
import type { ExistingVisaApplication, VisaFormState } from '@/app/types/visa'

/**
 * Hook to manage visa application form state
 * @param initialData Optional existing visa application data to populate form
 * @returns Object with form data, update methods, and reset
 */
export function useVisaFormState(initialData?: ExistingVisaApplication | null) {
  const [formData, setFormData] = useState<VisaFormState>(() => {
    if (initialData) {
      return {
        id: initialData.id,
        internalTrackingNo: initialData.internal_tracking_number || '',
        applicantName: `${initialData.applicants?.first_name} ${initialData.applicants?.last_name}`,
        applicantPassport:
          initialData.passport_number_used || initialData.applicants?.passport_number || '',
        applicantDob: initialData.applicants?.dob || '',
        applicantNationality: '',
        countryId: initialData.visa_countries?.id || '',
        visaTypeName: initialData.visa_types?.name || '',
        validity: initialData.validity || '',
        basePrice: initialData.base_price || 0,
        customerPrice: initialData.customer_price || 0,
        isPartOfPackage: initialData.is_part_of_package || false,
        status: initialData.status || '',
      }
    }
    return DEFAULT_VISA_FORM_STATE
  })

  // Single updateField method to replace repetitive setFormData calls
  const updateField = useCallback(
    <K extends keyof VisaFormState>(fieldName: K, value: VisaFormState[K]) => {
      setFormData((prev) => ({
        ...prev,
        [fieldName]: value,
      }))
    },
    [],
  )

  // Batch update multiple fields
  const updateFields = useCallback((updates: Partial<VisaFormState>) => {
    setFormData((prev) => ({
      ...prev,
      ...updates,
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
    reset,
  }
}
