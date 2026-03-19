/**
 * Module: app/dashboard/applications/passports/components/PassportsPagination.tsx
 * Dashboard module for applications/passports/components/PassportsPagination.tsx.
 */

type PassportsPaginationProps = {
  filteredCount: number
  startIdx: number
  pageSize: number
  currentPage: number
  totalPages: number
  onPrev: () => void
  onNext: () => void
}

export default function PassportsPagination({
  filteredCount,
  startIdx,
  pageSize,
  currentPage,
  totalPages,
  onPrev,
  onNext,
}: PassportsPaginationProps) {
  return (
    <div className="flex items-center justify-between mt-4">
      <div className="text-xs text-slate-500">
        Showing {filteredCount === 0 ? 0 : startIdx + 1}-{Math.min(startIdx + pageSize, filteredCount)} of{' '}
        {filteredCount}
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={onPrev}
          disabled={currentPage === 1}
          className={`px-3 py-1 rounded border text-sm ${currentPage === 1 ? 'opacity-50 cursor-not-allowed' : 'hover:bg-slate-100'} `}
          type="button"
          aria-label="Previous page"
        >
          ← Previous
        </button>
        <span className="text-xs text-slate-600">
          Page {currentPage} of {totalPages}
        </span>
        <button
          onClick={onNext}
          disabled={currentPage >= totalPages}
          className={`px-3 py-1 rounded border text-sm ${currentPage >= totalPages ? 'opacity-50 cursor-not-allowed' : 'hover:bg-slate-100'} `}
          type="button"
          aria-label="Next page"
        >
          Next →
        </button>
      </div>
    </div>
  )
}
