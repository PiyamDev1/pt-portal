import { countByStatus } from './helpers'

interface Stat {
  label: string
  count: number
  color: string
}

export default function StatsOverview({ applications }: { applications: any[] }) {
  const stats: Stat[] = [
    {
      label: 'Total Active',
      count: applications.length,
      color: 'bg-slate-800 text-white'
    },
    {
      label: 'Pending',
      count: countByStatus(applications, 'Pending Submission'),
      color: 'bg-amber-100 text-amber-700'
    },
    {
      label: 'In Progress',
      count: countByStatus(applications, 'In Progress'),
      color: 'bg-blue-100 text-blue-700'
    },
    {
      label: 'Completed',
      count: countByStatus(applications, 'Completed'),
      color: 'bg-emerald-100 text-emerald-700'
    }
  ]

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      {stats.map((stat, idx) => (
        <div key={idx} className={`${stat.color} p-4 rounded-xl shadow-sm border border-black/5`}>
          <div className="text-2xl font-bold">{stat.count}</div>
          <div className="text-[10px] uppercase font-bold tracking-wider opacity-80">{stat.label}</div>
        </div>
      ))}
    </div>
  )
}
