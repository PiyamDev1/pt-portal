/**
 * Pricing Client
 * Client-side gate for service pricing management UI.
 * Enforces role-based access before rendering pricing controls.
 */
'use client'

import { useState } from 'react'
import ServicePricingTab from '@/app/dashboard/settings/components/ServicePricingTab'
import { getBrowserSupabaseClient } from '@/lib/auth/browserSupabase'

export default function PricingClient({ userRole }: { userRole: string }) {
  const [loading, setLoading] = useState(false)

  const supabase = getBrowserSupabaseClient()

  const isAdmin = ['Admin', 'Master Admin'].includes(userRole)

  if (!isAdmin) {
    return (
      <div className="p-6 bg-white rounded-lg border border-slate-200 text-slate-600">
        You do not have access to pricing management.
      </div>
    )
  }

  return <ServicePricingTab supabase={supabase} loading={loading} setLoading={setLoading} />
}
