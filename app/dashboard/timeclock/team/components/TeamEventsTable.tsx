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
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead className="text-left text-slate-500 border-b border-slate-200">
          <tr>
            <th className="py-2 pr-4">Employee</th>
            <th className="py-2 pr-4">Device</th>
            <th className="py-2 pr-4">Punch</th>
            <th className="py-2 pr-4">Device time</th>
            <th className="py-2 pr-4">Recorded</th>
            <th className="py-2 pr-4">Location</th>
            {canAdjustTime && <th className="py-2 pr-4">Action</th>}
          </tr>
        </thead>
        <tbody className="text-slate-700">
          {events.map((event) => {
            const geo = event.geo
            const geoText =
              geo?.lat && geo?.lng
                ? `${geo.lat.toFixed(5)}, ${geo.lng.toFixed(5)}${geo.accuracy ? ` (${Math.round(geo.accuracy)}m)` : ''}`
                : '-'
            return (
              <tr key={event.id} className="border-b border-slate-100 last:border-b-0">
                <td className="py-3 pr-4 font-medium">{extractEmployeeName(event.employees)}</td>
                <td className="py-3 pr-4">{extractDeviceName(event.timeclock_devices)}</td>
                <td className="py-3 pr-4">
                  <div>{event.punch_type || event.event_type}</div>
                  {event.adjusted_at && <div className="text-xs text-amber-700">Adjusted once</div>}
                </td>
                <td className="py-3 pr-4">
                  <div>{formatDate(getEffectiveDeviceTime(event))}</div>
                  {event.adjusted_device_ts && (
                    <div className="text-xs text-slate-500">Original: {formatDate(event.device_ts)}</div>
                  )}
                </td>
                <td className="py-3 pr-4">
                  <div>{formatDate(getEffectiveRecordedTime(event))}</div>
                  {event.adjusted_scanned_at && (
                    <div className="text-xs text-slate-500">Original: {formatDate(event.scanned_at)}</div>
                  )}
                  {event.adjustment_reason && (
                    <div className="text-xs text-slate-500">Reason: {event.adjustment_reason}</div>
                  )}
                </td>
                <td className="py-3 pr-4">{geoText}</td>
                {canAdjustTime && (
                  <td className="py-3 pr-4">
                    <button
                      type="button"
                      onClick={() => onOpenAdjustment(event)}
                      disabled={Boolean(event.adjusted_at)}
                      className="rounded border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
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
