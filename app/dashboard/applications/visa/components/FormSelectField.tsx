interface FormSelectFieldProps {
  label: string
  value: string | number
  onChange: (value: string) => void
  options: Array<{ value: string | number; label: string }>
  disabled?: boolean
  placeholder?: string
  variant?: 'default' | 'purple'
  icon?: React.ReactNode
}

export function FormSelectField({
  label,
  value,
  onChange,
  options,
  disabled = false,
  placeholder = 'Select...',
  variant = 'default',
  icon
}: FormSelectFieldProps) {
  const fieldId = `select-${label.toLowerCase().replace(/\s+/g, '-')}`
  const baseClasses = 'w-full mt-3 p-2 border rounded text-sm focus:border-purple-500 focus:ring-1 focus:ring-purple-500 disabled:opacity-50'
  const variantClasses = variant === 'purple'
    ? 'bg-purple-50 border-purple-200 font-semibold text-purple-900'
    : 'bg-slate-50 border-slate-200'

  return (
    <div>
      <label htmlFor={fieldId} className={`text-xs font-medium ${variant === 'purple' ? 'text-purple-700' : 'text-slate-700'} flex items-center gap-1`}>
        {icon}
        {label}
      </label>
      <select
        id={fieldId}
        value={value}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
        className={`${baseClasses} ${variantClasses}`}
      >
        <option value="">{placeholder}</option>
        {options.map(opt => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  )
}
