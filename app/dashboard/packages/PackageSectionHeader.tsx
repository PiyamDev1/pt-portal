import type { LucideIcon } from 'lucide-react'

export function PackageSectionHeader({
  icon: Icon,
  title,
  action,
}: {
  icon: LucideIcon
  title: string
  action?: React.ReactNode
}) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900 text-white">
          <Icon className="h-4 w-4" />
        </span>
        <h2 className="text-base font-black text-slate-950">{title}</h2>
      </div>
      {action}
    </div>
  )
}
