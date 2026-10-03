'use client'

import { useMemo, useState } from 'react'

import { BookingReminderSettingsPanel } from './BookingReminderSettingsPanel'
import {
  BookingServiceSettingsPanel,
  useBookingServiceSettings,
} from './BookingServiceSettingsPanel'
import {
  BookingScheduleOverridesEditor,
  BookingWeeklyScheduleEditor,
  useBookingScheduleSettings,
} from './BookingScheduleSettings'

export interface BranchLocationOption {
  id: string
  name: string
  branch_code?: string | null
  appointments_enabled?: boolean | null
}

interface BookingSettingsTabProps {
  branchLocations: BranchLocationOption[]
  selectedLocationId: string
  onLocationChange: (locationId: string) => void
}

export default function BookingSettingsTab({
  branchLocations,
  selectedLocationId,
  onLocationChange,
}: BookingSettingsTabProps) {
  const [activeSection, setActiveSection] = useState<'overrides' | 'services' | 'reminders'>(
    'overrides',
  )
  const schedule = useBookingScheduleSettings(selectedLocationId || null)
  const serviceSettings = useBookingServiceSettings(selectedLocationId)

  const selectedBranch = useMemo(
    () => branchLocations.find((location) => location.id === selectedLocationId),
    [branchLocations, selectedLocationId],
  )
  const weeklyOpenDayCount = useMemo(
    () => schedule.weeklySettings.filter((setting) => !setting.is_closed).length,
    [schedule.weeklySettings],
  )

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[24px] border border-indigo-100 bg-[linear-gradient(135deg,_#eff6ff_0%,_#eef2ff_48%,_#ffffff_100%)] shadow-[0_18px_50px_-36px_rgba(30,58,138,0.45)]">
        <div className="flex flex-col gap-5 p-5 sm:p-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-indigo-600">
              Booking setup
            </p>
            <h2 className="mt-1 text-xl font-bold text-slate-900">Appointments, your way</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              Set the branch timetable, make services bookable on the customer portal, and keep
              every customer email on-brand from one place.
            </p>
          </div>
          <label className="block min-w-[250px] text-sm font-semibold text-slate-700">
            Branch
            <select
              value={selectedLocationId}
              onChange={(e) => onLocationChange(e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-normal shadow-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
            >
              {branchLocations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}
                  {location.branch_code ? ` (${location.branch_code})` : ''}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="grid border-t border-indigo-100 bg-white/70 sm:grid-cols-2 lg:grid-cols-4">
          <div className="border-b border-indigo-100 px-5 py-4 sm:border-r lg:border-b-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Branch
            </p>
            <p className="mt-1 text-sm font-semibold text-slate-800">
              {selectedBranch?.name || 'Select a branch'}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {selectedBranch?.appointments_enabled === false
                ? 'Appointments paused'
                : 'Appointments active'}
            </p>
          </div>
          <div className="border-b border-indigo-100 px-5 py-4 lg:border-b-0 lg:border-r">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Weekly hours
            </p>
            <p className="mt-1 text-sm font-semibold text-slate-800">
              {weeklyOpenDayCount} days open
            </p>
            <p className="mt-1 text-xs text-slate-500">Capacity and breaks included</p>
          </div>
          <div className="border-b border-indigo-100 px-5 py-4 sm:border-r lg:border-b-0 lg:border-r">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Live services
            </p>
            <p className="mt-1 text-sm font-semibold text-slate-800">
              {serviceSettings.activeServiceCount} active
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {serviceSettings.services.length} configured in total
            </p>
          </div>
          <div className="px-5 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Customer portal
            </p>
            <p className="mt-1 text-sm font-semibold text-slate-800">
              {serviceSettings.customerPortalServiceCount} bookable
            </p>
            <p className="mt-1 text-xs text-slate-500">Each confirmation includes a VISIT code</p>
          </div>
        </div>
      </section>

      <div className="grid gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-2 md:grid-cols-3">
        {[
          {
            id: 'overrides' as const,
            title: 'Hours & special dates',
            detail: 'Weekly availability, capacity, breaks, and exceptions',
          },
          {
            id: 'services' as const,
            title: 'Services & customer portal',
            detail: 'Slot rules, portal visibility, codes, and email copy',
          },
          {
            id: 'reminders' as const,
            title: 'Messages & attendance',
            detail: 'Reminders, attendance confirmation, and no-show rules',
          },
        ].map((section) => {
          const active = activeSection === section.id
          return (
            <button
              key={section.id}
              type="button"
              onClick={() => setActiveSection(section.id)}
              aria-pressed={active}
              className={`rounded-xl px-4 py-3 text-left transition ${
                active
                  ? 'bg-white text-indigo-800 shadow-sm ring-1 ring-indigo-100'
                  : 'text-slate-600 hover:bg-white/70'
              }`}
            >
              <span className="block text-sm font-semibold">{section.title}</span>
              <span className="mt-1 block text-xs leading-5 text-slate-500">{section.detail}</span>
            </button>
          )
        })}
      </div>

      {activeSection === 'overrides' && (
        <div className="space-y-4">
          <BookingWeeklyScheduleEditor model={schedule} />
          <BookingScheduleOverridesEditor model={schedule} />
        </div>
      )}

      {activeSection === 'services' && <BookingServiceSettingsPanel model={serviceSettings} />}

      {activeSection === 'reminders' && (
        <BookingReminderSettingsPanel
          selectedLocationId={selectedLocationId}
          onEditServiceEmails={() => setActiveSection('services')}
        />
      )}
    </div>
  )
}
