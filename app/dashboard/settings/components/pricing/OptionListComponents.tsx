'use client'

interface OptionListItemProps {
  value: string
  onDelete: () => void
}

export function OptionListItem({ value, onDelete }: OptionListItemProps) {
  return (
    <div className="flex items-center gap-2 bg-white p-2 rounded border">
      <span className="flex-1 text-sm">{value}</span>
      <button
        onClick={onDelete}
        className="text-red-500 hover:text-red-700 text-xs font-bold"
      >
        ✕
      </button>
    </div>
  )
}

interface OptionListInputProps {
  id: string
  placeholder: string
  onAddClick: () => void
}

export function OptionListInput({ id, placeholder, onAddClick }: OptionListInputProps) {
  return (
    <div className="flex gap-2">
      <input
        id={id}
        type="text"
        placeholder={placeholder}
        onKeyPress={(e) => {
          if (e.key === 'Enter' && (e.target as HTMLInputElement).value) {
            onAddClick()
          }
        }}
        className="flex-1 px-2 py-1 border rounded text-sm"
      />
      <button
        onClick={onAddClick}
        className="bg-blue-500 text-white px-3 py-1 rounded text-sm hover:bg-blue-600"
      >
        Add
      </button>
    </div>
  )
}
