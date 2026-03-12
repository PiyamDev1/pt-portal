import { countByStatus, countByStatuses, getNadraRecord } from './helpers'

interface Stat {
  label: string
  count: number
  color: string
  subLabel: string
}

export default function StatsOverview({ applications }: { applications: any[] }) {
  const realApps = applications.filter((a: any) => !!getNadraRecord(a))
  const processingCount = countByStatuses(realApps, ['In Progress', 'Under Process'])

  const stats: Stat[] = [
    {
      label: 'Total Applications',
      count: realApps.length,
      subLabel: 'All live NADRA records',
      color: 'border-emerald-500/30 bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 text-white'
    },
    {
      label: 'Pending Submission',
      count: countByStatus(realApps, 'Pending Submission'),
      subLabel: 'Not submitted yet',
      color: 'border-amber-500/25 bg-amber-950/20 text-amber-200'
    },
    {
      label: 'Submitted',
      count: countByStatus(realApps, 'Submitted'),
      subLabel: 'Submitted and queued',
      color: 'border-emerald-500/25 bg-emerald-950/20 text-emerald-200'
    },
    {
      label: 'Processing',
      count: processingCount,
      subLabel: 'In Progress + Under Process',
      color: 'border-teal-500/25 bg-teal-950/20 text-teal-200'
    },
    {
      label: 'Completed',
      count: countByStatus(realApps, 'Completed'),
      subLabel: 'Delivered successfully',
      color: 'border-lime-500/25 bg-lime-950/20 text-lime-200'
    }
  ]

  return (
    <div className="grid grid-cols-2 xl:grid-cols-5 gap-4 mb-6">
      {stats.map((stat, idx) => (
        <div key={idx} className={`${stat.color} p-4 rounded-2xl border shadow-sm backdrop-blur-sm`}>
          <div className="text-2xl font-black tracking-tight">{stat.count}</div>
          <div className="mt-1 text-[10px] uppercase font-bold tracking-[0.18em] opacity-90">{stat.label}</div>
          <div className="mt-2 text-[11px] opacity-80">{stat.subLabel}</div>
        </div>
      ))}
    </div>
  )
}
