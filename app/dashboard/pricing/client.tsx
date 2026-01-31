'use client'

import { useState } from 'react'
import { createBrowserClient } from '@supabase/auth-helpers-nextjs'
import ServicePricingTab from '@/app/dashboard/settings/components/ServicePricingTab'

export default function PricingClient({ userRole }: { userRole: string }) {
  const [loading, setLoading] = useState(false)
  
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const isAdmin = ['Admin', 'Master Admin'].includes(userRole)

  if (!isAdmin) {
    return (
      <div className="p-6 bg-white rounded-lg border border-slate-200 text-slate-600">
        You do not have access to pricing management.
      </div>
    )
  }

  return (
    <ServicePricingTab 
      supabase={supabase}
      loading={loading}
      setLoading={setLoading}
    />
  )
}
