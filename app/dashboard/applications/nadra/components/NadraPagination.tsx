/**
 * NADRA Pagination
 * Pager controls for grouped NADRA family ledger results.
 *
 * @module app/dashboard/applications/nadra/components/NadraPagination
 */

type NadraPaginationProps = {
  groupedEntriesLength: number
  startIdx: number
  pageSize: number
  currentPage: number
  totalPages: number
  onPrevious: () => void
  onNext: () => void
}

export default function NadraPagination({
  groupedEntriesLength,
  startIdx,
  pageSize,
  currentPage,
  totalPages,
  onPrevious,
  onNext,
}: NadraPaginationProps) {
  return (
    <div className="flex items-center justify-between mt-4">
      <div className="text-xs text-slate-500">
        Showing {groupedEntriesLength === 0 ? 0 : startIdx + 1}-
        {Math.min(startIdx + pageSize, groupedEntriesLength)} of {groupedEntriesLength} families
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={onPrevious}
          disabled={currentPage === 1}
          className={`px-3 py-1 rounded border text-sm ${currentPage === 1 ? 'opacity-50 cursor-not-allowed' : 'hover:bg-slate-100'} `}
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
        >
          Next →
        </button>
      </div>
    </div>
  )
}
