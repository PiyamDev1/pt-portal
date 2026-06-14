/**
 * Shared dashboard loading skeleton.
 *
 * Route-level loading files import this to avoid blank transitions while the
 * server authenticates the user and prepares module data.
 */

export function DashboardRouteLoading({
  title = 'Loading workspace',
  compact = false,
}: {
  title?: string
  compact?: boolean
}) {
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="border-b border-slate-200 bg-white px-4 py-3 shadow-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div className="h-10 w-40 animate-pulse rounded-2xl bg-slate-200" />
          <div className="h-10 w-10 animate-pulse rounded-full bg-slate-200" />
        </div>
      </div>
      <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6">
        <div className="overflow-hidden rounded-[2rem] bg-gradient-to-br from-[#4b0f16] via-[#8b1d2c] to-[#2f3033] p-5 text-white shadow-xl shadow-red-950/15">
          <div className="h-4 w-36 animate-pulse rounded-full bg-white/20" />
          <div className="mt-5 h-8 w-64 max-w-full animate-pulse rounded-full bg-white/25" />
          <p className="mt-4 text-sm text-red-100">{title}</p>
        </div>
        <div className={`mt-5 grid gap-4 ${compact ? 'grid-cols-2' : 'md:grid-cols-3'}`}>
          {Array.from({ length: compact ? 4 : 6 }).map((_, index) => (
            <div
              key={index}
              className="rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-sm"
            >
              <div className="h-12 w-12 animate-pulse rounded-2xl bg-slate-200" />
              <div className="mt-5 h-5 w-2/3 animate-pulse rounded-full bg-slate-200" />
              <div className="mt-3 h-3 w-full animate-pulse rounded-full bg-slate-100" />
              <div className="mt-2 h-3 w-4/5 animate-pulse rounded-full bg-slate-100" />
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}

export default function DashboardLoading() {
  return <DashboardRouteLoading title="Preparing your dashboard..." />
}
