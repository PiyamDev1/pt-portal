/**
 * Page Header
 *
 * Shared dashboard header. Desktop keeps the full identity controls; mobile keeps the
 * bar compact and uses the hamburger for account and page-specific actions.
 */
'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import {
  BadgePoundSterling,
  ArrowLeft,
  BookOpen,
  Building2,
  Calculator,
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
import { getDashboardParentNavigation } from '@/lib/navigation/dashboardNavigation'

type MenuItem = {
  href: string
  label: string
  icon: typeof Home
  allowedRoles?: string[]
}

const MOBILE_ACCOUNT_ITEMS: MenuItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: Home },
  { href: '/dashboard/accounting', label: 'Accounting', icon: BadgePoundSterling },
  { href: '/dashboard/account', label: 'My Account', icon: UserRound },
]

const PAGE_MENU_ITEMS: Array<{ match: string; title: string; items: MenuItem[] }> = [
  {
    match: '/dashboard/accounting',
    title: 'Accounting menu',
    items: [
      { href: '/dashboard/accounting', label: 'Accounting Home', icon: BadgePoundSterling },
      {
        href: '/dashboard/accounting/applications',
        label: 'Applications',
        icon: FileText,
      },
    ],
  },
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
        allowedRoles: ['Admin', 'Master Admin', 'Super Admin'],
      },
      {
        href: '/dashboard/settings?tab=branches',
        label: 'Branches',
        icon: Building2,
        allowedRoles: ['Admin', 'Master Admin', 'Super Admin'],
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
        allowedRoles: ['Admin', 'Master Admin', 'Super Admin'],
      },
    ],
  },
  {
    match: '/dashboard/applications',
    title: 'Application menu',
    items: [
      { href: '/dashboard/applications', label: 'Applications Hub', icon: FileText },
      { href: '/dashboard/applications/nadra', label: 'NADRA', icon: FileText },
      {
        href: '/dashboard/applications/passports',
        label: 'Pakistani Passports',
        icon: FileText,
      },
      { href: '/dashboard/applications/passports-gb', label: 'GB Passport', icon: FileText },
      { href: '/dashboard/applications/visa', label: 'Visa', icon: FileText },
    ],
  },
  {
    match: '/dashboard/ticketing',
    title: 'Ticketing menu',
    items: [
      { href: '/dashboard/ticketing', label: 'Ticketing Home', icon: BookOpen },
      {
        href: '/dashboard/ticketing/refund-calculator',
        label: 'Refund Calculator',
        icon: Calculator,
      },
      { href: '/dashboard/ticketing/ledger', label: 'Ticketing Ledger', icon: BookOpen },
    ],
  },
]

export default function PageHeader({
  employeeName,
  role,
  location,
  userId,
  showBack,
  backHref,
  backLabel,
}: {
  employeeName?: string
  role?: string
  location?: any
  userId?: string
  showBack?: boolean
  backHref?: string
  backLabel?: string
}) {
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
  const inferredParent = getDashboardParentNavigation(pathname)
  const parentNavigation = backHref
    ? { href: backHref, label: backLabel || 'Previous page' }
    : inferredParent
  const displayBack = (showBack ?? true) && parentNavigation

  return (
    <>
      <nav className="portal-header fixed inset-x-0 top-0 z-40 flex items-center justify-between border-b border-slate-200 bg-white/95 px-2.5 py-2.5 shadow-sm backdrop-blur sm:px-6 sm:py-4 lg:static lg:bg-white">
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

          {displayBack && (
            <Link
              href={parentNavigation.href}
              aria-label={`Back to ${parentNavigation.label}`}
              title={`Back to ${parentNavigation.label}`}
              className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-xl border border-red-100 bg-red-50 px-2.5 text-sm font-black text-[#8b1e2d] shadow-sm transition hover:border-red-200 hover:bg-red-100 hover:text-[#4b0f16] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b1e2d] focus-visible:ring-offset-2 sm:h-10 sm:px-3"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              <span className="platform-mobile-only">Back</span>
              <span className="platform-desktop-only">Back to {parentNavigation.label}</span>
            </Link>
          )}

          <div className="platform-desktop-only min-w-0">
            <h1 className="truncate !text-[12px] font-black leading-tight text-slate-800 sm:!text-lg">
              Piyam Travels
            </h1>
            <p className="truncate text-[10px] leading-tight text-slate-500 sm:text-xs">
              {location?.name || 'Portal'}{' '}
              {location?.branch_code ? `(${location.branch_code})` : ''}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2 sm:gap-4">
          <Link
            href="/dashboard/settings"
            className="platform-desktop-flex group relative cursor-pointer items-center gap-3 transition hover:opacity-80"
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

          <div className="platform-desktop-only mx-2 h-8 w-px bg-slate-200"></div>
          <div className="platform-desktop-only">
            <LogoutButton />
          </div>

          <button
            type="button"
            onClick={() => setMenuOpen((current) => !current)}
            className="platform-mobile-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-800 shadow-sm"
            aria-label={menuOpen ? 'Close mobile menu' : 'Open mobile menu'}
            aria-expanded={menuOpen}
          >
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </nav>

      {menuOpen && (
        <div className="portal-mobile-menu platform-mobile-only fixed inset-x-0 z-40 border-b border-slate-200 bg-white p-3 shadow-xl">
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
