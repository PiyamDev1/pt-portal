/**
 * Page Header
 *
 * Shared dashboard header. Desktop keeps the full identity controls; mobile keeps the
 * bar compact and uses the hamburger for account and page-specific actions.
 */
'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'
import {
  Building2,
  Database,
  FileText,
  Home,
  Menu,
  Settings,
  ShieldCheck,
  UserRound,
  UsersRound,
  X,
} from 'lucide-react'
import LogoutButton from '@/app/dashboard/logout-button.client'

type MenuItem = {
  href: string
  label: string
  icon: typeof Home
  allowedRoles?: string[]
}

const MOBILE_ACCOUNT_ITEMS: MenuItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: Home },
  { href: '/dashboard/account', label: 'My Account', icon: UserRound },
]

const PAGE_MENU_ITEMS: Array<{ match: string; title: string; items: MenuItem[] }> = [
  {
    match: '/dashboard/settings',
    title: 'Settings menu',
    items: [
      { href: '/dashboard/settings', label: 'Settings Home', icon: Settings },
      { href: '/dashboard/settings?tab=security', label: 'Security', icon: ShieldCheck },
      {
        href: '/dashboard/settings?tab=staff',
        label: 'Staff Management',
        icon: UsersRound,
        allowedRoles: ['Admin', 'Master Admin'],
      },
      {
        href: '/dashboard/settings?tab=branches',
        label: 'Branches',
        icon: Building2,
        allowedRoles: ['Admin', 'Master Admin'],
      },
      {
        href: '/dashboard/settings?tab=maintenance',
        label: 'Maintenance',
        icon: Database,
        allowedRoles: ['Admin', 'Master Admin', 'Maintenance Admin'],
      },
      {
        href: '/dashboard/settings?tab=notice-board',
        label: 'Notice Board',
        icon: FileText,
        allowedRoles: ['Admin', 'Master Admin'],
      },
    ],
  },
  {
    match: '/dashboard/applications',
    title: 'Application menu',
    items: [
      { href: '/dashboard/applications', label: 'Applications Hub', icon: FileText },
      { href: '/dashboard/applications/nadra', label: 'NADRA', icon: FileText },
      { href: '/dashboard/applications/passports-gb', label: 'GB Passport', icon: FileText },
      { href: '/dashboard/applications/visa', label: 'Visa', icon: FileText },
    ],
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
  const pathname = usePathname()
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

  const pageMenu = PAGE_MENU_ITEMS.find((menu) => pathname.startsWith(menu.match))
  const canSee = (item: MenuItem) => !item.allowedRoles || item.allowedRoles.includes(role || '')

  return (
    <>
      <nav className="fixed inset-x-0 top-0 z-40 flex items-center justify-between border-b border-slate-200 bg-white/95 px-2.5 py-2.5 shadow-sm backdrop-blur sm:px-6 sm:py-4 lg:static lg:bg-white">
        <div className="flex min-w-0 items-center gap-2 sm:gap-4">
          <Link
            href="/dashboard"
            className="flex shrink-0 cursor-pointer items-center gap-2 transition hover:opacity-80"
          >
            <div className="relative aspect-[797/313] h-6 w-auto sm:h-10">
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
            <h1 className="truncate !text-[12px] font-black leading-tight text-slate-800 sm:!text-lg">
              Piyam Travels
            </h1>
            <p className="truncate text-[10px] leading-tight text-slate-500 sm:text-xs">
              {location?.name || 'Portal'}{' '}
              {location?.branch_code ? `(${location.branch_code})` : ''}
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
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-800 shadow-sm sm:hidden"
            aria-label={menuOpen ? 'Close mobile menu' : 'Open mobile menu'}
            aria-expanded={menuOpen}
          >
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </nav>

      {menuOpen && (
        <div className="fixed inset-x-0 top-[3.55rem] z-40 border-b border-slate-200 bg-white p-3 shadow-xl sm:hidden">
          <div className="rounded-2xl bg-[#4b0f16] p-4 text-white">
            <p className="text-sm font-black">{employeeName || 'Portal user'}</p>
            <p className="mt-1 text-xs text-red-100">
              {role || 'Staff'} {location?.name ? `- ${location.name}` : ''}
            </p>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            {MOBILE_ACCOUNT_ITEMS.filter(canSee).map((item) => {
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

          {pageMenu && (
            <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <p className="mb-2 text-xs font-black uppercase tracking-[0.16em] text-slate-500">
                {pageMenu.title}
              </p>
              <div className="grid grid-cols-2 gap-2">
                {pageMenu.items.filter(canSee).map((item) => {
                  const Icon = item.icon
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-2 rounded-xl bg-white px-3 py-2.5 text-xs font-black text-slate-800 shadow-sm"
                    >
                      <Icon className="h-4 w-4 text-[#8b1e2d]" />
                      {item.label}
                    </Link>
                  )
                })}
              </div>
            </div>
          )}

          <div className="mt-3 rounded-2xl border border-red-100 bg-red-50 p-2">
            <LogoutButton />
          </div>
        </div>
      )}
    </>
  )
}
