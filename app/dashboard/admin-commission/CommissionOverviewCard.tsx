import type { LucideIcon } from 'lucide-react'

type CommissionOverviewCardProps = {
  label: string
  value: string
  note: string
  icon: LucideIcon
  tone?: 'white' | 'dark' | 'red'
}

export default function CommissionOverviewCard({
  label,
  value,
  note,
  icon: Icon,
  tone = 'white',
}: CommissionOverviewCardProps) {
  const styles = {
    white: 'border-slate-200 bg-white text-slate-950',
    dark: 'border-slate-950 bg-[#17181b] text-white',
    red: 'border-red-950/10 bg-gradient-to-br from-[#761522] to-[#ad293b] text-white',
  }

  return (
    <article className={`rounded-[1.35rem] border p-4 shadow-sm ${styles[tone]}`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p
            className={`text-[10px] font-black uppercase tracking-[0.16em] ${tone === 'white' ? 'text-slate-500' : 'text-white/60'}`}
          >
            {label}
          </p>
          <p className="mt-2 text-2xl font-black tracking-tight">{value}</p>
        </div>
        <span
          className={`rounded-xl p-2 ${tone === 'white' ? 'bg-red-50 text-[#8b1e2d]' : 'bg-white/10 text-white'}`}
        >
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p
        className={`mt-2 text-[11px] leading-4 ${tone === 'white' ? 'text-slate-500' : 'text-white/60'}`}
      >
        {note}
      </p>
    </article>
  )
}
