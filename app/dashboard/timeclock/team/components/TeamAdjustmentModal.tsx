/**
 * Team Adjustment Modal
 * Modal for one-time manager/admin corrections to recorded team timeclock punches.
 *
 * @module app/dashboard/timeclock/team/components/TeamAdjustmentModal
 */

type TimeclockEvent = {
  event_type: string
  punch_type?: string
  adjusted_at?: string | null
  adjusted_scanned_at?: string | null
  adjusted_device_ts?: string | null
  scanned_at?: string | null
  device_ts?: string | null
  adjustment_reason?: string | null
  employees?: { full_name?: string } | { full_name?: string }[] | null
}

type TeamAdjustmentModalProps = {
  editingEvent: TimeclockEvent
  adjustedTimeInput: string
  adjustmentReason: string
  adjustmentError: string
  adjusting: boolean
  formatDate: (value?: string | null) => string
  getEffectiveRecordedTime: (event: TimeclockEvent) => string
  extractEmployeeName: (employee?: TimeclockEvent['employees']) => string
  setAdjustedTimeInput: (value: string) => void
  setAdjustmentReason: (value: string) => void
  onClose: () => void
  onSubmit: () => void
}

export function TeamAdjustmentModal({
  editingEvent,
  adjustedTimeInput,
  adjustmentReason,
  adjustmentError,
  adjusting,
  formatDate,
  getEffectiveRecordedTime,
  extractEmployeeName,
  setAdjustedTimeInput,
  setAdjustmentReason,
  onClose,
  onSubmit,
}: TeamAdjustmentModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="timeclock-adjustment-title"
        className="animate-enter-fade-up w-full max-w-lg rounded-[1.5rem] border border-slate-200 bg-white p-6 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#8b1e2d]">
              Audit-safe correction
            </p>
            <h3 id="timeclock-adjustment-title" className="mt-1 text-xl font-black text-slate-900">
              Adjust recorded time
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="ui-tap rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Close adjustment dialog"
          >
            ×
          </button>
        </div>
        <p className="mt-1 text-sm text-slate-600">
          This can only be done once for this punch. The original timestamps remain preserved for
          audit.
        </p>

        <div className="mt-4 space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
            <p>
              <span className="font-semibold">Employee:</span>{' '}
              {extractEmployeeName(editingEvent.employees)}
            </p>
            <p>
              <span className="font-semibold">Punch:</span>{' '}
              {editingEvent.punch_type || editingEvent.event_type}
            </p>
            <p>
              <span className="font-semibold">Current recorded time:</span>{' '}
              {formatDate(getEffectiveRecordedTime(editingEvent))}
            </p>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Corrected recorded time
            </label>
            <input
              type="datetime-local"
              value={adjustedTimeInput}
              onChange={(event) => setAdjustedTimeInput(event.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-bold text-slate-800 outline-none focus:border-[#8b1e2d] focus:ring-2 focus:ring-red-100"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Reason</label>
            <textarea
              value={adjustmentReason}
              onChange={(event) => setAdjustmentReason(event.target.value)}
              rows={4}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-[#8b1e2d] focus:ring-2 focus:ring-red-100"
              placeholder="Describe the on-site service issue that required this correction."
            />
          </div>

          {adjustmentError && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {adjustmentError}
            </div>
          )}
        </div>

        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="ui-tap rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-black text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={adjusting}
            className="ui-tap rounded-xl bg-[#8b1e2d] px-4 py-2.5 text-sm font-black text-white hover:bg-[#6f1422] disabled:bg-slate-400"
          >
            {adjusting ? 'Saving...' : 'Apply adjustment'}
          </button>
        </div>
      </div>
    </div>
  )
}
