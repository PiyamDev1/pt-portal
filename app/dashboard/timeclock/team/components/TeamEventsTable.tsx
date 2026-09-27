/**
 * Team Events Table
 * Tabular display of team punch events including adjustment controls and geo/device context.
 *
 * @module app/dashboard/timeclock/team/components/TeamEventsTable
 */

type TimeclockEvent = {
  id: string
  event_type: string
  punch_type?: string
  device_ts: string
  scanned_at: string
  adjusted_device_ts?: string | null
  adjusted_scanned_at?: string | null
  adjusted_at?: string | null
  adjustment_reason?: string | null
  geo?: { lat?: number; lng?: number; accuracy?: number } | null
  employees?: { full_name?: string } | { full_name?: string }[] | null
  timeclock_devices?: { name?: string } | { name?: string }[] | null
}

type TeamEventsTableProps = {
  events: TimeclockEvent[]
  canAdjustTime: boolean
  formatDate: (value?: string | null) => string
  extractEmployeeName: (employee?: TimeclockEvent['employees']) => string
  extractDeviceName: (device?: TimeclockEvent['timeclock_devices']) => string
  getEffectiveDeviceTime: (event: TimeclockEvent) => string
  getEffectiveRecordedTime: (event: TimeclockEvent) => string
  onOpenAdjustment: (event: TimeclockEvent) => void
}

export function TeamEventsTable({
  events,
  canAdjustTime,
  formatDate,
  extractEmployeeName,
  extractDeviceName,
  getEffectiveDeviceTime,
  getEffectiveRecordedTime,
  onOpenAdjustment,
}: TeamEventsTableProps) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-100">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-50 text-left text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">
          <tr>
            <th className="px-4 py-3">Employee</th>
            <th className="px-4 py-3">Device</th>
            <th className="px-4 py-3">Punch</th>
            <th className="px-4 py-3">Device time</th>
            <th className="px-4 py-3">Recorded</th>
            <th className="px-4 py-3">Location</th>
            {canAdjustTime && <th className="px-4 py-3">Action</th>}
          </tr>
        </thead>
        <tbody className="text-slate-700">
          {events.map((event, index) => {
            const geo = event.geo
            const geoText =
              typeof geo?.lat === 'number' && typeof geo?.lng === 'number'
                ? `${geo.lat.toFixed(5)}, ${geo.lng.toFixed(5)}${geo.accuracy ? ` (${Math.round(geo.accuracy)}m)` : ''}`
                : 'Not provided'
            return (
              <tr
                key={event.id}
                className="animate-enter-fade-up border-t border-slate-100 transition hover:bg-red-50/40"
                style={{ animationDelay: `${Math.min(index * 35, 240)}ms` }}
              >
                <td className="whitespace-nowrap px-4 py-3.5 font-bold text-slate-800">
                  {extractEmployeeName(event.employees)}
                </td>
                <td className="whitespace-nowrap px-4 py-3.5 font-medium text-slate-600">
                  {extractDeviceName(event.timeclock_devices)}
                </td>
                <td className="px-4 py-3.5">
                  <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-black text-slate-700">
                    {event.punch_type || event.event_type}
                  </span>
                  {event.adjusted_at && (
                    <div className="mt-1 text-[11px] font-bold text-amber-700">Adjusted once</div>
                  )}
                </td>
                <td className="whitespace-nowrap px-4 py-3.5 text-xs font-bold text-slate-700">
                  <div>{formatDate(getEffectiveDeviceTime(event))}</div>
                  {event.adjusted_device_ts && (
                    <div className="mt-1 text-[11px] font-medium text-slate-400">
                      Original: {formatDate(event.device_ts)}
                    </div>
                  )}
                </td>
                <td className="whitespace-nowrap px-4 py-3.5 text-xs font-bold text-slate-700">
                  <div>{formatDate(getEffectiveRecordedTime(event))}</div>
                  {event.adjusted_scanned_at && (
                    <div className="mt-1 text-[11px] font-medium text-slate-400">
                      Original: {formatDate(event.scanned_at)}
                    </div>
                  )}
                  {event.adjustment_reason && (
                    <div
                      className="mt-1 max-w-48 truncate text-[11px] font-medium text-slate-400"
                      title={event.adjustment_reason}
                    >
                      Reason: {event.adjustment_reason}
                    </div>
                  )}
                </td>
                <td className="max-w-xs px-4 py-3.5 text-xs font-medium text-slate-500">
                  {geoText}
                </td>
                {canAdjustTime && (
                  <td className="px-4 py-3.5">
                    <button
                      type="button"
                      onClick={() => onOpenAdjustment(event)}
                      disabled={Boolean(event.adjusted_at)}
                      className="ui-tap rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-black text-slate-700 hover:border-red-200 hover:bg-red-50 hover:text-[#8b1e2d] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {event.adjusted_at ? 'Used' : 'Adjust once'}
                    </button>
                  </td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
