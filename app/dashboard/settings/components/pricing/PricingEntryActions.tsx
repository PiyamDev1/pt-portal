import { Save, Trash2, X } from 'lucide-react'

interface PricingEntryActionsProps {
  isEditing: boolean
  onSave: () => void
  onCancel: () => void
  onEdit: () => void
  onDelete: () => void
}

export default function PricingEntryActions({
  isEditing,
  onSave,
  onCancel,
  onEdit,
  onDelete,
}: PricingEntryActionsProps) {
  return (
    <td className="py-3 px-4 text-center flex gap-2 justify-center">
      {isEditing ? (
        <>
          <button
            onClick={onSave}
            className="text-green-600 hover:text-green-900"
            title="Save"
            aria-label="Save"
          >
            <Save className="h-4 w-4" />
          </button>
          <button
            onClick={onCancel}
            className="text-gray-600 hover:text-gray-900"
            title="Cancel"
            aria-label="Cancel"
          >
            <X className="h-4 w-4" />
          </button>
        </>
      ) : (
        <>
          <button
            onClick={onEdit}
            className="text-blue-600 hover:text-blue-900 font-medium text-sm"
          >
            Edit
          </button>
          <button
            onClick={onDelete}
            className="text-red-600 hover:text-red-900"
            title="Delete"
            aria-label="Delete"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </>
      )}
    </td>
  )
}
