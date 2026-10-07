import { STATUS_ACCESSIBILITY, STATUS_CONFIG } from './bookingClientModel'

export default function BookingStatusBadge({
  status,
  variant = 'full',
}: {
  status: string
  variant?: 'full' | 'label'
}) {
  const display = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending

  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${display.bg} ${display.text}`}>
      {variant === 'full' && (
        <span className="mr-1 inline-flex h-4 min-w-4 items-center justify-center rounded border border-current/20 bg-white/60 px-1 text-[10px] font-bold leading-none">
          {(STATUS_ACCESSIBILITY[status] ?? STATUS_ACCESSIBILITY.pending).short}
        </span>
      )}
      {display.label}
    </span>
  )
}
