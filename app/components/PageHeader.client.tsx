'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import LogoutButton from '@/app/dashboard/logout-button.client'

export default function PageHeader({ employeeName, role, location, userId, showBack = false }: { employeeName?: string; role?: string; location?: any; userId?: string; showBack?: boolean }) {
  const router = useRouter()

  // Get initials for avatar fallback
  const initials = employeeName
    ? employeeName.split(' ').map((n: string) => n[0]).join('').toUpperCase().substring(0, 2)
    : 'U'

  return (
    <nav className="bg-white border-b border-slate-200 px-6 py-4 flex justify-between items-center shadow-sm">
      <div className="flex items-center gap-4">
        <Link href="/dashboard" className="cursor-pointer hover:opacity-80 transition">
          {/* --- LOGO CHANGE --- */}
          {/* Replace src="/logo.png" with your actual logo file path */}
          <img 
            src="/logo.png" 
            alt="Piyam Travels" 
            className="h-10 w-auto object-contain"
            onError={(e) => {
              // Fallback if image fails to load
              e.currentTarget.style.display = 'none';
              e.currentTarget.nextElementSibling?.classList.remove('hidden');
            }}
          />
          <div className="hidden h-10 w-10 bg-blue-900 rounded-full flex items-center justify-center text-white font-bold">PT</div>
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
      
      <div className="flex items-center gap-4">
        <div className="relative hidden sm:flex items-center gap-3 group">
          
          <div className="text-right cursor-pointer select-none">
            <p className="text-sm font-medium text-slate-900">{employeeName}</p>
            <p className="text-xs text-blue-600 font-semibold">{role}</p>
          </div>

          {/* --- AVATAR PROFILE --- */}
          <div className="h-10 w-10 rounded-full bg-slate-200 border-2 border-white shadow-sm flex items-center justify-center overflow-hidden cursor-pointer relative">
            {/* Try to load avatar based on a predictable URL pattern */}
            {userId && (
              <img 
                src={`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/avatars/${userId}/avatar.png`}
                onError={(e) => (e.currentTarget.style.display = 'none')}
                className="absolute inset-0 w-full h-full object-cover"
                alt="Avatar"
              />
            )}
            <span className="text-sm font-bold text-slate-600">{initials}</span>
          </div>

          {/* DROPDOWN MENU */}
          <div className="absolute right-0 top-full mt-2 w-48 bg-white border border-slate-200 rounded-lg shadow-md opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition z-50">
            <ul className="py-2 text-sm">
              <li>
                <Link href="/dashboard/settings" className="block px-3 py-2 hover:bg-slate-50 text-slate-700">Settings</Link>
              </li>
            </ul>
          </div>
        </div>
        
        <div className="h-8 w-px bg-slate-200 mx-2 hidden sm:block"></div>
        <LogoutButton />
      </div>
    </nav>
  )
}
