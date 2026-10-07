import Link from 'next/link'
import {
  AlertTriangle,
  Database,
  ExternalLink,
  FolderKanban,
  Link2,
  MapPinned,
  PackageCheck,
  Plus,
} from 'lucide-react'

type PackagesDashboardHeaderProps = {
  actionCount: number
  activeFolderCount: number
  liveCustomerLinkCount: number
  activeGroupCount: number
  showLegacyMigration: boolean
}

export default function PackagesDashboardHeader({
  actionCount,
  activeFolderCount,
  liveCustomerLinkCount,
  activeGroupCount,
  showLegacyMigration,
}: PackagesDashboardHeaderProps) {
  const stats = [
    {
      label: 'Action queue',
      value: actionCount,
      icon: AlertTriangle,
      tone: 'border-amber-200 bg-amber-50',
    },
    {
      label: 'Active folders',
      value: activeFolderCount,
      icon: PackageCheck,
      tone: 'border-slate-200 bg-slate-50',
    },
    {
      label: 'Live customer links',
      value: liveCustomerLinkCount,
      icon: Link2,
      tone: 'border-emerald-200 bg-emerald-50',
    },
    {
      label: 'Group packages',
      value: activeGroupCount,
      icon: FolderKanban,
      tone: 'border-cyan-200 bg-cyan-50',
    },
  ]

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[#8b1e2d]">
            Packages workspace
          </p>
          <h1 className="mt-1 text-3xl font-black tracking-tight text-slate-950">
            Package operations
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Keep each trip moving from quotation to customer selection, booking, travel and closure
            — without hunting across separate lists.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href="https://haramain-maps-live.web.app/"
            target="_blank"
            rel="noopener noreferrer"
            title="Check Makkah and Madinah hotel walking distances to the Haram"
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 text-sm font-black text-emerald-800 transition hover:border-emerald-300 hover:bg-emerald-100"
          >
            <MapPinned className="h-4 w-4" />
            Haramain Map
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
          {showLegacyMigration && (
            <Link
              href="/dashboard/packages/migration"
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-black text-slate-700 transition hover:bg-slate-100"
            >
              <Database className="h-4 w-4" />
              Legacy Migration
            </Link>
          )}
          <Link
            href="/dashboard/packages/quotations/new"
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-[#8b1e2d] px-4 text-sm font-black text-white transition hover:bg-[#6f1422]"
          >
            <Plus className="h-4 w-4" />
            Create quotation
          </Link>
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon
          return (
            <div key={stat.label} className={`rounded-xl border p-3 ${stat.tone}`}>
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-black text-slate-600">{stat.label}</p>
                <Icon className="h-4 w-4 text-slate-500" />
              </div>
              <p className="mt-2 text-2xl font-black text-slate-950">{stat.value}</p>
            </div>
          )
        })}
      </div>
    </section>
  )
}
