interface FormInputFieldProps {
  label: string
  value: string | number
  onChange: (value: string) => void
  placeholder?: string
  type?: string
  className?: string
  uppercase?: boolean
  mono?: boolean
}

export function FormInputField({
  label,
  value,
  onChange,
  placeholder = '',
  type = 'text',
  className = '',
  uppercase = false,
  mono = false
}: FormInputFieldProps) {
  const fieldId = `field-${label.toLowerCase().replace(/\s+/g, '-')}`
  return (
    <div>
      <label htmlFor={fieldId} className="text-xs font-medium text-slate-700">{label}</label>
      <input
        id={fieldId}
        type={type}
        value={value}
        onChange={e => onChange(uppercase ? e.target.value.toUpperCase() : e.target.value)}
        placeholder={placeholder}
        className={`w-full mt-1 p-2 bg-slate-50 border border-slate-200 rounded text-sm focus:border-purple-500 focus:ring-1 focus:ring-purple-500 ${mono ? 'font-mono' : ''} ${className}`}
      />
    </div>
  )
}
