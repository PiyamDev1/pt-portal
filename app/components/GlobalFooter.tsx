'use client'

import { usePathname } from 'next/navigation'

export function GlobalFooter() {
  const pathname = usePathname()
  const isStatementPage = pathname.includes('/dashboard/lms/statement/')

  if (isStatementPage) {
    return null
  }

  return (
    <footer className="bg-white border-t border-slate-200 py-6 mt-auto">
      <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-4 text-xs text-slate-400">
        <div>
          <p className="font-medium text-slate-600">Designed by Rathobixz Limited</p>
          <p>© {new Date().getFullYear()} Piyam Travels. All rights reserved.</p>
        </div>
        <div className="flex gap-4">
          <span>v1.0.0 (Beta)</span>
          <span>•</span>
          <a href="#" className="hover:text-slate-600 transition">
            Support
          </a>
          <span>•</span>
          <a href="#" className="hover:text-slate-600 transition">
            Privacy
          </a>
        </div>
      </div>
    </footer>
  )
}
