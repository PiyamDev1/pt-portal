/**
 * Dashboard Client Wrapper
 *
 * Provides shared client-side dashboard behaviour. Mobile keeps a footer nav for the
 * core destinations, while the header hamburger holds account and page-specific actions.
 */
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { CalendarDays, Clock3, FileText, Home, Settings } from 'lucide-react'
import { PasskeySetupPrompt } from '@/app/components/PasskeySetupPrompt'
import { RouteWarmup } from './RouteWarmup'

const MOBILE_NAV_ITEMS = [
  { href: '/dashboard', label: 'Home', icon: Home },
  { href: '/dashboard/applications', label: 'Apps', icon: FileText },
  { href: '/dashboard/bookings', label: 'Bookings', icon: CalendarDays },
  { href: '/dashboard/timeclock', label: 'Clock', icon: Clock3 },
  { href: '/dashboard/settings', label: 'Settings', icon: Settings },
]

function MobileDashboardNav() {
  const pathname = usePathname()

  return (
    <nav className="platform-mobile-only fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-2 pb-[calc(env(safe-area-inset-bottom)+0.45rem)] pt-2 shadow-[0_-12px_40px_-28px_rgba(15,23,42,0.55)] backdrop-blur print:hidden">
      <div className="mx-auto grid max-w-md grid-cols-5 gap-1">
        {MOBILE_NAV_ITEMS.map((item) => {
          const Icon = item.icon
          const active =
            item.href === '/dashboard' ? pathname === item.href : pathname.startsWith(item.href)

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex min-h-[3.25rem] flex-col items-center justify-center rounded-2xl px-1 text-[11px] font-black transition ${
                active ? 'bg-[#4b0f16] text-white' : 'text-slate-500 hover:bg-slate-100'
              }`}
            >
              <Icon className="mb-0.5 h-5 w-5" />
              {item.label}
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
