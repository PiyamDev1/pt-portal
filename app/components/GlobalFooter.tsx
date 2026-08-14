/**
 * Global Footer
 * Shared footer rendered across dashboard pages except print-oriented views.
 */
'use client'

import { usePathname } from 'next/navigation'

export function GlobalFooter() {
  const pathname = usePathname()
  const isStatementPage = pathname.includes('/dashboard/lms/statement/')
  const isDashboardPage = pathname.startsWith('/dashboard')

  if (isStatementPage) {
    return null
  }

  return (
    <footer
      className={`portal-footer mt-auto border-t border-slate-200 bg-white py-6 ${isDashboardPage ? 'portal-dashboard-footer' : ''}`}
    >
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-4 text-center text-xs text-slate-400 md:flex-row md:gap-4 md:px-6 md:text-left">
        <div className="space-y-1">
          <p className="font-medium text-slate-600">Designed by Rathobixz Limited</p>
          <p>© {new Date().getFullYear()} Piyam Travels. All rights reserved.</p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
          <span>v2.0.0</span>
          <span aria-hidden="true">•</span>
          <span>Support is available through Issue Report</span>
        </div>
      </div>
    </footer>
  )
}
