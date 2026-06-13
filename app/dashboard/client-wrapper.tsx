/**
 * Dashboard Client Wrapper
 * Provides shared client-side shell behavior for dashboard pages,
 * including session warning UI and future timeout orchestration.
 */
'use client'
import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { CalendarDays, Clock3, HeartPulse, Home, Settings } from 'lucide-react'
// import { useSessionTimeout } from '@/hooks/useSessionTimeout'
import { SessionWarningHeader } from '@/app/components/SessionWarningHeader'
import { PasskeySetupPrompt } from '@/app/components/PasskeySetupPrompt'

const MOBILE_NAV_ITEMS = [
  { href: '/dashboard', label: 'Home', icon: Home },
  { href: '/dashboard/timeclock', label: 'Clock', icon: Clock3 },
  { href: '/dashboard/frappe-transfer', label: 'HRMS', icon: HeartPulse },
  { href: '/dashboard/bookings', label: 'Bookings', icon: CalendarDays },
  { href: '/dashboard/settings', label: 'Settings', icon: Settings },
]

function MobileDashboardNav() {
  const pathname = usePathname()

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-2 pb-[calc(env(safe-area-inset-bottom)+0.45rem)] pt-2 shadow-[0_-12px_40px_-28px_rgba(15,23,42,0.55)] backdrop-blur lg:hidden">
      <div className="mx-auto grid max-w-md grid-cols-5 gap-1">
        {MOBILE_NAV_ITEMS.map((item) => {
          const Icon = item.icon
          const active =
            item.href === '/dashboard' ? pathname === item.href : pathname.startsWith(item.href)

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex min-h-12 flex-col items-center justify-center rounded-2xl px-1 text-[10px] font-black transition ${
                active ? 'bg-[#4b0f16] text-white' : 'text-slate-500 hover:bg-slate-100'
              }`}
            >
              <Icon className="mb-0.5 h-4 w-4" />
              {item.label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}

export default function DashboardClientWrapper({ children }: { children: React.ReactNode }) {
  const [showWarning, setShowWarning] = useState(false)
  const [secondsRemaining, setSecondsRemaining] = useState(0)

  // Session timeout temporarily disabled
  // useSessionTimeout((warning, seconds) => {
  //   setShowWarning(warning)
  //   setSecondsRemaining(seconds || 0)
  // })

  return (
    <div className="dashboard-mobile-shell">
      <SessionWarningHeader showWarning={showWarning} secondsRemaining={secondsRemaining} />
      {children}
      <MobileDashboardNav />
      <PasskeySetupPrompt />
    </div>
  )
}
