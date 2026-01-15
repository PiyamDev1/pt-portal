interface FormCurrencyFieldProps {
  label: string
  value: number
  onChange: (value: number) => void
  variant?: 'default' | 'purple'
}

export function FormCurrencyField({
  label,
  value,
  onChange,
  variant = 'default'
}: FormCurrencyFieldProps) {
  const bgClass = variant === 'purple' ? 'bg-white border-purple-300' : 'bg-slate-50 border-slate-200'
  const labelClass = variant === 'purple' ? 'text-purple-700' : 'text-slate-500'
  const inputClass = variant === 'purple' ? 'font-bold text-purple-700' : ''

  return (
    <div>
      <label className={`text-xs font-medium ${labelClass}`}>{label}</label>
      <div className="relative mt-1">
        <span className={`absolute left-2 top-1.5 ${variant === 'purple' ? 'text-purple-400' : 'text-slate-400'} text-xs`}>£</span>
        <input
          type="number"
          value={value}
          onChange={e => onChange(parseFloat(e.target.value))}
          className={`w-full pl-6 p-1.5 border rounded text-sm ${bgClass} ${inputClass}`}
        />
      </div>
    </div>
  )
}
