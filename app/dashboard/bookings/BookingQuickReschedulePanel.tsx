import type { SlotOption } from './bookingClientModel'

type RescheduleOffset = {
  minutes: number
  isoString: string
}

type Props = {
  currentTimeLabel: string
  selectedTimeLabel: string
  selectedStartTime: string
  selectedTimeChanged: boolean
  rescheduleOnly: boolean
  quickOffsets: RescheduleOffset[]
  firstAvailableSlot: SlotOption | null
  nextAvailableStartTime: string | null
  suggestions: SlotOption[]
  onToggleRescheduleOnly: () => void
  onKeepCurrentTime: () => void
  onSelectTime: (isoString: string) => void
}

export default function BookingQuickReschedulePanel({
  currentTimeLabel,
  selectedTimeLabel,
  selectedStartTime,
  selectedTimeChanged,
  rescheduleOnly,
  quickOffsets,
  firstAvailableSlot,
  nextAvailableStartTime,
  suggestions,
  onToggleRescheduleOnly,
  onKeepCurrentTime,
  onSelectTime,
}: Props) {
  return (
    <div className="md:col-span-2 rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-1">
          <p className="text-sm font-semibold text-indigo-900">Quick reschedule</p>
          <p className="text-xs text-indigo-700">
            Keep the booking details and move the appointment time in one tap. Current slot:{' '}
            {currentTimeLabel}.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onToggleRescheduleOnly}
            className="ui-tap ui-focus rounded-full border border-indigo-200 bg-white px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
          >
            {rescheduleOnly ? 'Show full edit' : 'Reschedule only'}
          </button>
          <button
            type="button"
            onClick={onKeepCurrentTime}
            className="ui-tap ui-focus rounded-full border border-indigo-200 bg-white px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
          >
            Keep current time
          </button>
          {quickOffsets.map(({ minutes, isoString }) => (
            <button
              key={minutes}
              type="button"
              onClick={() => onSelectTime(isoString)}
              className="ui-tap ui-focus rounded-full border border-indigo-200 bg-white px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
            >
              +{minutes} min
            </button>
          ))}
          {nextAvailableStartTime && (
            <button
              type="button"
              onClick={() => onSelectTime(nextAvailableStartTime)}
              className="ui-tap ui-focus rounded-full border border-emerald-200 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
            >
              Next available
            </button>
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => {
            if (firstAvailableSlot) onSelectTime(firstAvailableSlot.isoString)
          }}
          disabled={!firstAvailableSlot}
          className="ui-tap ui-focus rounded-full bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
        >
          First available
        </button>
        {suggestions.map((slot) => (
          <button
            key={slot.isoString}
            type="button"
            onClick={() => onSelectTime(slot.isoString)}
            className={`ui-tap ui-focus rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
              slot.isoString === selectedStartTime
                ? 'border-emerald-300 bg-emerald-100 text-emerald-800'
                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            {slot.time}
          </button>
        ))}
      </div>

      {selectedTimeChanged && (
        <p className="mt-2 text-xs font-medium text-emerald-700">
          New time selected: {selectedTimeLabel}.
        </p>
      )}
    </div>
  )
}
