/**
 * Page Header
 * Common top navigation header with branding, user context, and logout controls.
 */
'use client'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import LogoutButton from '@/app/dashboard/logout-button.client'

export default function PageHeader({
  employeeName,
  role,
  location,
  userId,
  showBack = false,
}: {
  employeeName?: string
  role?: string
  location?: any
  userId?: string
  showBack?: boolean
}) {
  const router = useRouter()

  const initials = employeeName
    ? employeeName
        .split(' ')
        .map((n: string) => n[0])
        .join('')
        .toUpperCase()
        .substring(0, 2)
    : 'U'

  const avatarUrl = userId
    ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/avatars/${userId}/avatar.png`
    : null

  return (
    <nav className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-200 bg-white/95 px-3 py-3 shadow-sm backdrop-blur sm:px-6 sm:py-4 lg:static lg:bg-white">
      <div className="flex min-w-0 items-center gap-3 sm:gap-4">
        <Link
          href="/dashboard"
          className="flex cursor-pointer items-center gap-2 transition hover:opacity-80"
        >
          {/* --- COMPANY LOGO (Optimized) --- */}
          <div className="relative h-8 w-auto aspect-[797/313] sm:h-10">
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

        <div className="min-w-0">
          <h1 className="truncate text-sm font-black text-slate-800 sm:text-lg">
            Piyam Travels Portal
          </h1>
          <p className="truncate text-[11px] text-slate-500 sm:text-xs">
            {location?.name} ({location?.branch_code})
          </p>
        </div>
        {showBack && (
          <button
            onClick={() => router.back()}
            className="hidden text-sm font-medium text-[#8b1e2d] hover:text-[#4b0f16] sm:ml-4 sm:flex sm:items-center sm:gap-1"
          >
            ← Back
          </button>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-2 sm:gap-4">
        <Link
          href="/dashboard/settings"
          className="group relative hidden cursor-pointer items-center gap-3 transition hover:opacity-80 sm:flex"
        >
          <div className="text-right select-none">
            <p className="text-sm font-medium text-slate-900">{employeeName}</p>
            <p className="text-xs font-semibold text-[#8b1e2d]">{role}</p>
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

        <Link
          href="/dashboard/settings"
          className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-slate-100 text-xs font-black text-slate-700 shadow-sm sm:hidden"
          aria-label="Open account settings"
        >
          {initials}
        </Link>

        <div className="mx-2 hidden h-8 w-px bg-slate-200 sm:block"></div>
        <LogoutButton />
      </div>
    </nav>
  )
}
