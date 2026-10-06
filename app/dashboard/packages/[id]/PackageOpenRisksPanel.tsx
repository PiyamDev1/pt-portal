'use client'

import { AlertTriangle } from 'lucide-react'
import type { TravelPackageRiskFlag } from '@/app/types/packages'

type PackageOpenRisksPanelProps = {
  risks: TravelPackageRiskFlag[]
  onResolveRisk: (riskId: string) => void
}

export function PackageOpenRisksPanel({ risks, onResolveRisk }: PackageOpenRisksPanelProps) {
  return (
    <div className="space-y-2">
      {risks.map((risk) => (
        <div
          key={risk.id}
          className="flex flex-wrap items-center gap-3 border border-amber-200 bg-amber-50 p-3"
        >
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-black text-slate-900">{risk.title}</p>
            <p className="text-xs text-slate-600">{risk.description}</p>
          </div>
          <span className="text-xs font-black uppercase text-amber-700">{risk.severity}</span>
          <button
            type="button"
            onClick={() => onResolveRisk(risk.id)}
            className="border border-amber-300 bg-white px-2 py-1 text-xs font-black text-amber-800"
          >
            Resolve
          </button>
        </div>
      ))}
    </div>
  )
}
