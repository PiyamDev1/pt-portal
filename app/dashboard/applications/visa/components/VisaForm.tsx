'use client'
import { useState } from 'react'
import { Save, ChevronUp } from 'lucide-react'
import { toast } from 'sonner'
import { useVisaFiltering } from '@/app/hooks/useVisaFiltering'
import { useVisaFormState } from '@/app/hooks/useVisaFormState'
import { ApplicantSection } from './ApplicantSection'
import { VisaSelectionSection } from './VisaSelectionSection'
import { OfficeUseSection } from './OfficeUseSection'

export default function VisaForm({ isOpen, onClose, data, currentUserId, onSave, metadata }: any) {
  const { formData, updateField, updateFields } = useVisaFormState(data)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Use the filtering hook
  const { applicantNationalityOptions, availableDestinations, availableVisaTypes } = useVisaFiltering({
    applicantNationality: formData.applicantNationality,
    countryId: formData.countryId,
    metadata
  })

  // Auto-fill Logic
  const handleTypeChange = (val: string) => {
    const matchedType = availableVisaTypes.find((t: any) => t.name.toLowerCase() === val.toLowerCase())
    let updates: any = { visaTypeName: val }

    if (matchedType) {
      if (formData.basePrice === 0) updates.basePrice = matchedType.default_cost
      if (formData.customerPrice === 0) updates.customerPrice = matchedType.default_price
      if (!formData.validity && matchedType.default_validity) updates.validity = matchedType.default_validity
    }
    updateFields(updates)
  }

  const handleNationalityChange = (val: string) => {
    // Reset dependent fields when nationality changes
    updateFields({
      applicantNationality: val,
      countryId: '',
      visaTypeName: ''
    })
  }

  const handleDestinationChange = (val: string) => {
    // Reset visa type when destination changes
    updateFields({
      countryId: val,
      visaTypeName: ''
    })
  }

  const handleSubmit = async () => {
    if (!formData.countryId) {
      toast.error('Please select a destination')
      return
    }
    setIsSubmitting(true)
    await onSave({ ...formData, currentUserId })
    setIsSubmitting(false)
  }

  if (!isOpen) return null

  return (
    <div className="bg-white rounded-xl border border-purple-100 shadow-lg overflow-hidden mb-6 animate-in slide-in-from-top-4 duration-300">
      <div className="bg-purple-50 px-6 py-3 border-b border-purple-100 flex justify-between items-center">
        <h3 className="font-bold text-purple-800 flex items-center gap-2">
          {data ? 'Edit Application' : 'New Application'}
        </h3>
        <button onClick={onClose} className="text-purple-400 hover:text-purple-700 bg-white rounded-full p-1 shadow-sm">
          <ChevronUp className="w-4 h-4" />
        </button>
      </div>

      <div className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
          {/* 1. Applicant Section */}
          <ApplicantSection
            passport={formData.applicantPassport}
            name={formData.applicantName}
            dob={formData.applicantDob}
            nationality={formData.applicantNationality}
            nationalityOptions={applicantNationalityOptions}
            onPassportChange={val => updateField('applicantPassport', val)}
            onNameChange={val => updateField('applicantName', val)}
            onDobChange={val => updateField('applicantDob', val)}
            onNationalityChange={handleNationalityChange}
          />

          {/* 2. Visa Selection Section */}
          <VisaSelectionSection
            destination={formData.countryId}
            visaType={formData.visaTypeName}
            validity={formData.validity}
            availableDestinations={availableDestinations}
            availableVisaTypes={availableVisaTypes}
            destinationDisabled={!formData.applicantNationality}
            typeDisabled={!formData.countryId}
            onDestinationChange={handleDestinationChange}
            onTypeChange={handleTypeChange}
            onValidityChange={val => updateField('validity', val)}
          />

          {/* 3. Office Use Section */}
          <OfficeUseSection
            appNo={formData.internalTrackingNo}
            baseCost={formData.basePrice}
            customerPrice={formData.customerPrice}
            isPartOfPackage={formData.isPartOfPackage}
            onAppNoChange={val => updateField('internalTrackingNo', val)}
            onBaseCostChange={val => updateField('basePrice', val)}
            onCustomerPriceChange={val => updateField('customerPrice', val)}
            onPackageToggle={() => updateField('isPartOfPackage', !formData.isPartOfPackage)}
          />
        </div>

        <div className="mt-6 pt-4 border-t border-slate-100 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-slate-500 hover:text-slate-700 text-sm font-medium">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="px-6 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-bold flex items-center gap-2 shadow-sm shadow-purple-200"
          >
            {isSubmitting ? 'Saving...' : <><Save className="w-4 h-4" /> Save Application</>}
          </button>
        </div>
      </div>
    </div>
  )
}
