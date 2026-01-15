import { FormSelectField } from './FormSelectField'
import { FormInputField } from './FormInputField'

interface VisaSelectionSectionProps {
  destination: string
  visaType: string
  validity: string
  availableDestinations: Array<{ id: string | number; name: string }>
  availableVisaTypes: Array<{ id: string | number; name: string }>
  destinationDisabled: boolean
  typeDisabled: boolean
  onDestinationChange: (value: string) => void
  onTypeChange: (value: string) => void
  onValidityChange: (value: string) => void
}

export function VisaSelectionSection({
  destination,
  visaType,
  validity,
  availableDestinations,
  availableVisaTypes,
  destinationDisabled,
  typeDisabled,
  onDestinationChange,
  onTypeChange,
  onValidityChange
}: VisaSelectionSectionProps) {
  return (
    <div className="space-y-4">
      <h4 className="text-xs font-bold text-slate-400 uppercase">Visa Selection</h4>
      <div className="space-y-3">
        <FormSelectField
          label="Destination"
          value={destination}
          onChange={onDestinationChange}
          options={availableDestinations.map(c => ({ value: c.id, label: c.name }))}
          disabled={destinationDisabled}
          placeholder={destinationDisabled ? 'Select Nationality First' : 'Select Destination...'}
        />
        <FormSelectField
          label="Visa Type"
          value={visaType}
          onChange={onTypeChange}
          options={availableVisaTypes.map(t => ({ value: t.name, label: t.name }))}
          disabled={typeDisabled}
          placeholder="Select Type..."
        />
        <FormInputField
          label="Validity"
          value={validity}
          onChange={onValidityChange}
        />
      </div>
    </div>
  )
}
