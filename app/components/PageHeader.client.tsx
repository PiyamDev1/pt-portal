'use client'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import LogoutButton from '@/app/dashboard/logout-button.client'

export default function PageHeader({ employeeName, role, location, userId, showBack = false }: { employeeName?: string; role?: string; location?: any; userId?: string; showBack?: boolean }) {
  const router = useRouter()

  const initials = employeeName
    ? employeeName.split(' ').map((n: string) => n[0]).join('').toUpperCase().substring(0, 2)
    : 'U'

  const avatarUrl = userId 
    ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/avatars/${userId}/avatar.png`
    : null

  return (
    <nav className="bg-white border-b border-slate-200 px-6 py-4 flex justify-between items-center shadow-sm">
      <div className="flex items-center gap-4">
        <Link href="/dashboard" className="cursor-pointer hover:opacity-80 transition flex items-center gap-2">
          
          {/* --- COMPANY LOGO (Optimized) --- */}
          <div className="relative h-10 w-auto aspect-[797/313]">
            <Image 
              src="/logo.png" 
              alt="Piyam Travels" 
              width={797} 
              height={313}
              className="h-full w-auto object-contain"
              priority
            />
          </div>
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
        <Link href="/dashboard/settings" className="relative hidden sm:flex items-center gap-3 group cursor-pointer hover:opacity-80 transition">
          
          <div className="text-right select-none">
            <p className="text-sm font-medium text-slate-900">{employeeName}</p>
            <p className="text-xs text-blue-600 font-semibold">{role}</p>
          </div>

          {/* AVATAR PROFILE */}
          <div className="h-10 w-10 rounded-full bg-slate-200 border-2 border-white shadow-sm flex items-center justify-center overflow-hidden relative">
            {avatarUrl && (
              <Image
                src={avatarUrl}
                alt="Profile"
                fill
                sizes="40px"
                className="object-cover"
                onError={(e) => {
                  const target = e.currentTarget as HTMLImageElement
                  target.style.display = 'none'
                }}
                unoptimized
              />
            )}
            <span className="text-sm font-bold text-slate-600">{initials}</span>
          </div>
        </Link>
        
        <div className="h-8 w-px bg-slate-200 mx-2 hidden sm:block"></div>
        <LogoutButton />
      </div>
    </nav>
  )
}
