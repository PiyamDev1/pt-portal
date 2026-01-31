'use client'

interface ModificationOptionsProps {
  canModify: boolean
  onModify: () => void
}

export function ModificationOptions({ canModify, onModify }: ModificationOptionsProps) {
  return (
    <div className="space-y-3">
      <h3 className="font-semibold text-slate-800">Modification Options</h3>
      
      <button
        onClick={onModify}
        disabled={!canModify}
        className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
      >
        {canModify ? 'Modify Payment Schedule' : 'Cannot Modify (Payments Made)'}
      </button>

      {!canModify && (
        <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-2 py-1">
          ⚠️ Schedule cannot be modified once payments have been made
        </p>
      )}
    </div>
  )
}
