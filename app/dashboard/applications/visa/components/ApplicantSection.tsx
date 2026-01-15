import { Globe } from 'lucide-react'
import { FormInputField } from './FormInputField'
import { FormSelectField } from './FormSelectField'

interface ApplicantSectionProps {
  passport: string
  name: string
  dob: string
  nationality: string
  nationalityOptions: string[]
  onPassportChange: (value: string) => void
  onNameChange: (value: string) => void
  onDobChange: (value: string) => void
  onNationalityChange: (value: string) => void
}

export function ApplicantSection({
  passport,
  name,
  dob,
  nationality,
  nationalityOptions,
  onPassportChange,
  onNameChange,
  onDobChange,
  onNationalityChange
}: ApplicantSectionProps) {
  return (
    <div className="space-y-4">
      <h4 className="text-xs font-bold text-slate-400 uppercase">Applicant</h4>
      <div className="space-y-3">
        <FormInputField
          label="Passport No"
          value={passport}
          onChange={onPassportChange}
          placeholder="A1234567"
          uppercase
          mono
        />
        <FormInputField
          label="Full Name"
          value={name}
          onChange={onNameChange}
        />
        <div className="grid grid-cols-2 gap-3">
          <FormInputField
            label="Date of Birth"
            value={dob}
            onChange={onDobChange}
            type="date"
          />
          <FormSelectField
            label="Nationality"
            value={nationality}
            onChange={onNationalityChange}
            options={nationalityOptions.map(n => ({ value: n, label: n }))}
            placeholder="Select nationality..."
            variant="purple"
            icon={<Globe className="w-3 h-3" />}
          />
        </div>
      </div>
    </div>
  )
}
