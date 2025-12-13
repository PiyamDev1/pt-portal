'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import LogoutButton from '@/app/dashboard/logout-button.client'

export default function PageHeader({ employeeName, role, location, showBack = false }) {
  const router = useRouter()

  return (
    <nav className="bg-white border-b border-slate-200 px-6 py-4 flex justify-between items-center shadow-sm">
      <div className="flex items-center gap-4">
        <Link href="/dashboard" className="cursor-pointer hover:opacity-80 transition">
          <div className="h-10 w-10 bg-blue-900 rounded-full flex items-center justify-center text-white font-bold">PT</div>
        </Link>
        <div>
          <h1 className="text-lg font-bold text-slate-800">Piyam Travels Portal</h1>
          <p className="text-xs text-slate-500">{location?.name} ({location?.branch_code})</p>
        </div>
        {showBack && (
          <button 
            onClick={() => router.back()}
            className="ml-4 text-sm text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1"
          >
            ← Back
          </button>
        )}
      </div>
      
      <div className="flex items-center gap-6">
        <div className="relative hidden sm:block group">
          <div className="text-right cursor-pointer select-none">
            <p className="text-sm font-medium text-slate-900">{employeeName}</p>
            <p className="text-xs text-blue-600 font-semibold">{role}</p>
          </div>
          <div className="absolute right-0 mt-2 w-48 bg-white border border-slate-200 rounded-lg shadow-md opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition">
            <ul className="py-2 text-sm">
              <li>
                <Link href="/dashboard/account" className="block px-3 py-2 hover:bg-slate-50 text-slate-700">My Account Settings</Link>
              </li>
              <li>
                <Link href="/dashboard/settings" className="block px-3 py-2 hover:bg-slate-50 text-slate-700">Organization Settings</Link>
              </li>
            </ul>
          </div>
        </div>
        <LogoutButton />
      </div>
    </nav>
  )
}
