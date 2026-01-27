'use client'

/**
 * Skeleton Loaders - Placeholder UI while data loads
 */

export function StatCardSkeleton() {
  return (
    <div className="bg-gradient-to-br from-slate-100 to-slate-50 rounded-xl p-4 border border-slate-200 shadow-sm animate-pulse">
      <div className="flex items-center justify-between mb-3">
        <div className="h-3 w-20 bg-slate-300 rounded"></div>
        <div className="w-4 h-4 bg-slate-300 rounded"></div>
      </div>
      <div className="h-8 w-32 bg-slate-300 rounded"></div>
    </div>
  )
}

export function AccountRowSkeleton() {
  return (
    <tr className="border-t border-slate-200">
      <td className="p-3">
        <div className="space-y-2">
          <div className="h-4 w-32 bg-slate-300 rounded animate-pulse"></div>
          <div className="h-3 w-20 bg-slate-200 rounded animate-pulse"></div>
        </div>
      </td>
      <td className="p-3">
        <div className="space-y-2">
          <div className="h-4 w-24 bg-slate-300 rounded animate-pulse"></div>
          <div className="h-3 w-32 bg-slate-200 rounded animate-pulse"></div>
        </div>
      </td>
      <td className="p-3 text-center">
        <div className="h-6 w-16 bg-slate-300 rounded animate-pulse mx-auto"></div>
      </td>
      <td className="p-3 text-right">
        <div className="h-6 w-20 bg-slate-300 rounded animate-pulse ml-auto"></div>
      </td>
      <td className="p-3">
        <div className="flex gap-2 justify-center">
          <div className="h-8 w-20 bg-slate-300 rounded animate-pulse"></div>
          <div className="h-8 w-16 bg-slate-300 rounded animate-pulse"></div>
        </div>
      </td>
    </tr>
  )
}

export function TableHeaderSkeleton() {
  return (
    <>
      <AccountRowSkeleton />
      <AccountRowSkeleton />
      <AccountRowSkeleton />
      <AccountRowSkeleton />
    </>
  )
}

export function ModalLoadingSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      {[1, 2, 3, 4].map(i => (
        <div key={i} className="space-y-2">
          <div className="h-3 w-24 bg-slate-300 rounded"></div>
          <div className="h-10 bg-slate-200 rounded"></div>
        </div>
      ))}
    </div>
  )
}

export function LoadingSpinner({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6',
    lg: 'w-8 h-8'
  }

  return (
    <div className={`${sizeClasses[size]} animate-spin`}>
      <svg className="w-full h-full text-slate-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
        ></path>
      </svg>
    </div>
  )
}
