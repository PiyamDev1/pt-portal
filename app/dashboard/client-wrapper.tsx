/**
 * Dashboard Client Wrapper
 *
 * Provides shared client-side dashboard behaviour. Mobile keeps a footer nav for the
 * core destinations, while the header hamburger holds account and page-specific actions.
 */
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { Home, Settings } from 'lucide-react'
import { createBrowserClient } from '@supabase/auth-helpers-nextjs'
import { PasskeySetupPrompt } from '@/app/components/PasskeySetupPrompt'
import { DashboardModuleIcon } from './DashboardModuleIcon'
import { RouteWarmup } from './RouteWarmup'
import {
  getMobileNavigationLabel,
  MOBILE_NAVIGATION_METADATA_KEY,
  MOBILE_NAVIGATION_UPDATED_EVENT,
  resolveMobileShortcutModules,
} from '@/lib/mobileNavigation'

export function MobileDashboardNav() {
  const pathname = usePathname()
  const supabase = useMemo(
    () =>
      createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      ),
    [],
  )
  const [shortcuts, setShortcuts] = useState(() => resolveMobileShortcutModules(undefined))

  useEffect(() => {
    let active = true

    const loadPreferences = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (active) {
        setShortcuts(
          resolveMobileShortcutModules(user?.user_metadata?.[MOBILE_NAVIGATION_METADATA_KEY]),
        )
      }
    }
    const handleUpdate = (event: Event) => {
      const detail = event instanceof CustomEvent ? event.detail : undefined
      setShortcuts(resolveMobileShortcutModules(detail))
    }

    void loadPreferences()
    window.addEventListener(MOBILE_NAVIGATION_UPDATED_EVENT, handleUpdate)
    return () => {
      active = false
      window.removeEventListener(MOBILE_NAVIGATION_UPDATED_EVENT, handleUpdate)
    }
  }, [supabase])

  const items = [
    ...shortcuts.slice(0, 2).map((moduleItem) => ({ type: 'module' as const, moduleItem })),
    { type: 'home' as const, href: '/dashboard', label: 'Home', Icon: Home },
    ...shortcuts.slice(2, 3).map((moduleItem) => ({ type: 'module' as const, moduleItem })),
    {
      type: 'settings' as const,
      href: '/dashboard/settings?tab=security',
      label: 'Settings',
      Icon: Settings,
    },
  ]
  const activeShortcutPath = shortcuts
    .map((moduleItem) => moduleItem.href.split('?')[0])
    .filter((href) => pathname === href || pathname.startsWith(`${href}/`))
    .sort((left, right) => right.length - left.length)[0]

  return (
    <nav className="platform-mobile-only fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-2 pb-[calc(env(safe-area-inset-bottom)+0.45rem)] pt-2 shadow-[0_-12px_40px_-28px_rgba(15,23,42,0.55)] backdrop-blur print:hidden">
      <div className="mx-auto grid max-w-md grid-cols-5 gap-1">
        {items.map((item) => {
          const href = item.type === 'module' ? item.moduleItem.href : item.href
          const label =
            item.type === 'module' ? getMobileNavigationLabel(item.moduleItem) : item.label
          const active =
            item.type === 'home'
              ? pathname === href
              : item.type === 'module'
                ? href.split('?')[0] === activeShortcutPath
                : pathname.startsWith(href.split('?')[0]) || pathname === '/dashboard/account'

          return (
            <Link
              key={`${item.type}-${href}`}
              href={href}
              aria-label={label}
              aria-current={active ? 'page' : undefined}
              className={`flex min-h-[3.25rem] flex-col items-center justify-center rounded-2xl px-1 text-[11px] font-black transition ${
                active ? 'bg-[#4b0f16] text-white' : 'text-slate-500 hover:bg-slate-100'
              }`}
            >
              {item.type === 'module' ? (
                <DashboardModuleIcon moduleItem={item.moduleItem} className="mb-0.5 h-5 w-5" />
              ) : (
                <item.Icon className="mb-0.5 h-5 w-5" />
              )}
              <span className="max-w-full truncate">{label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}

export default function DashboardClientWrapper({ children }: { children: React.ReactNode }) {
  return (
    <div className="dashboard-mobile-shell">
      <RouteWarmup />
      {children}
      <MobileDashboardNav />
      <PasskeySetupPrompt />
    </div>
  )
}
