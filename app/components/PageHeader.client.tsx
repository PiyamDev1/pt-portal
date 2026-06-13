/**
 * Page Header
 *
 * Shared dashboard header. Desktop keeps the full identity controls, while mobile uses
 * a fixed compact bar with a hamburger menu so pages have more working space.
 */
'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { CalendarDays, Clock3, HeartPulse, Home, Menu, Settings, UserRound, X } from 'lucide-react'
import LogoutButton from '@/app/dashboard/logout-button.client'

const MOBILE_MENU_ITEMS = [
  { href: '/dashboard', label: 'Dashboard', icon: Home },
  { href: '/dashboard/timeclock', label: 'Timeclock', icon: Clock3 },
  { href: '/dashboard/frappe-transfer', label: 'HRMS', icon: HeartPulse },
  { href: '/dashboard/bookings', label: 'Bookings', icon: CalendarDays },
  { href: '/dashboard/account', label: 'My Account', icon: UserRound },
  {
    href: '/dashboard/settings',
    label: 'Settings',
    icon: Settings,
    allowedRoles: ['Admin', 'Master Admin', 'Maintenance Admin'],
  },
]

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
  const [menuOpen, setMenuOpen] = useState(false)

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
    <>
      <nav className="fixed inset-x-0 top-0 z-40 flex items-center justify-between border-b border-slate-200 bg-white/95 px-3 py-3 shadow-sm backdrop-blur sm:px-6 sm:py-4 lg:static lg:bg-white">
        <div className="flex min-w-0 items-center gap-3 sm:gap-4">
          <Link
            href="/dashboard"
            className="flex cursor-pointer items-center gap-2 transition hover:opacity-80"
          >
            <div className="relative aspect-[797/313] h-8 w-auto sm:h-10">
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
            <div className="select-none text-right">
              <p className="text-sm font-medium text-slate-900">{employeeName}</p>
              <p className="text-xs font-semibold text-[#8b1e2d]">{role}</p>
            </div>

            <div className="relative flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border-2 border-white bg-slate-200 shadow-sm">
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

          <div className="mx-2 hidden h-8 w-px bg-slate-200 sm:block"></div>
          <div className="hidden sm:block">
            <LogoutButton />
          </div>

          <button
            type="button"
            onClick={() => setMenuOpen((current) => !current)}
            className="flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-800 shadow-sm sm:hidden"
            aria-label={menuOpen ? 'Close mobile menu' : 'Open mobile menu'}
            aria-expanded={menuOpen}
          >
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </nav>

      {menuOpen && (
        <div className="fixed inset-x-0 top-[4.35rem] z-40 border-b border-slate-200 bg-white p-3 shadow-xl sm:hidden">
          <div className="rounded-2xl bg-[#4b0f16] p-4 text-white">
            <p className="text-sm font-black">{employeeName || 'Portal user'}</p>
            <p className="mt-1 text-xs text-red-100">
              {role || 'Staff'} {location?.name ? `- ${location.name}` : ''}
            </p>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {MOBILE_MENU_ITEMS.filter(
              (item) => !item.allowedRoles || item.allowedRoles.includes(role || ''),
            ).map((item) => {
              const Icon = item.icon
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-black text-slate-800"
                >
                  <Icon className="h-4 w-4 text-[#8b1e2d]" />
                  {item.label}
                </Link>
              )
            })}
          </div>
          <div className="mt-3 rounded-2xl border border-red-100 bg-red-50 p-2">
            <LogoutButton />
          </div>
        </div>
      )}
    </>
  )
}
