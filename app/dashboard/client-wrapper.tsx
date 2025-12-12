'use client'
import { useSessionTimeout } from '@/app/hooks/useSessionTimeout'

export default function DashboardClientWrapper({ children }: { children: React.ReactNode }) {
  useSessionTimeout()
  return <>{children}</>
}
