/**
 * Dashboard module grid with user personalization.
 *
 * Favorites and usage counts are persisted through `/api/dashboard/modules`, which keeps
 * quick-access behaviour tied to the user's account rather than browser storage.
 */
'use client'

import Link from 'next/link'
import type { ComponentType } from 'react'
import { useEffect, useMemo, useState } from 'react'
import {
  BadgePoundSterling,
  BriefcaseBusiness,
  CalendarDays,
  Clock3,
  FileText,
  FingerprintPattern,
  HeartPulse,
  Plane,
  Settings,
  Star,
  Ticket,
} from 'lucide-react'
import {
  DASHBOARD_GROUP_LABELS,
  DASHBOARD_GROUP_ORDER,
  type DashboardModule,
} from '@/lib/dashboardModules'

type Preference = {
  module_id: string
  is_favorite: boolean
  usage_count: number
  last_opened_at: string | null
}

type IconProps = { className?: string }

const ICONS: Record<DashboardModule['iconKey'], ComponentType<IconProps>> = {
  'badge-pound': BadgePoundSterling,
  briefcase: BriefcaseBusiness,
  calendar: CalendarDays,
  clock: Clock3,
  'file-text': FileText,
  fingerprint: FingerprintPattern,
  heart: HeartPulse,
  plane: Plane,
  settings: Settings,
  ticket: Ticket,
}

function ModuleIcon({
  moduleItem,
  className = 'h-5 w-5',
}: {
  moduleItem: DashboardModule
  className?: string
}) {
  const Icon = ICONS[moduleItem.iconKey]
  return <Icon className={className} />
}

async function postPreference(
  moduleId: string,
  action: 'toggle-favorite' | 'record-open',
  favorite?: boolean,
) {
  await fetch('/api/dashboard/modules', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ moduleId, action, favorite }),
    keepalive: action === 'record-open',
  })
}

export function DashboardModulesClient({ modules }: { modules: DashboardModule[] }) {
  const [preferences, setPreferences] = useState<Record<string, Preference>>({})

  useEffect(() => {
    let cancelled = false

    fetch('/api/dashboard/modules')
      .then((response) => (response.ok ? response.json() : Promise.reject(response)))
      .then((payload: { preferences?: Preference[] }) => {
        if (cancelled) return
        const next = Object.fromEntries(
          (payload.preferences || []).map((item) => [item.module_id, item]),
        )
        setPreferences(next)
      })
      .catch(() => {
        // Personalization is helpful, but the dashboard should remain usable if it fails.
      })

    return () => {
      cancelled = true
    }
  }, [])

  const favorites = useMemo(
    () => modules.filter((moduleItem) => preferences[moduleItem.id]?.is_favorite),
    [modules, preferences],
  )

  const frequent = useMemo(
    () =>
      modules
        .filter((moduleItem) => Number(preferences[moduleItem.id]?.usage_count || 0) > 0)
        .sort(
          (a, b) =>
            Number(preferences[b.id]?.usage_count || 0) -
            Number(preferences[a.id]?.usage_count || 0),
        )
        .slice(0, 5),
    [modules, preferences],
  )

  function recordOpen(moduleId: string) {
    setPreferences((current) => {
      const existing = current[moduleId]
      return {
        ...current,
        [moduleId]: {
          module_id: moduleId,
          is_favorite: existing?.is_favorite || false,
          usage_count: Number(existing?.usage_count || 0) + 1,
          last_opened_at: new Date().toISOString(),
        },
      }
    })
    void postPreference(moduleId, 'record-open')
  }

  async function toggleFavorite(moduleId: string) {
    const nextFavorite = !preferences[moduleId]?.is_favorite
    setPreferences((current) => ({
      ...current,
      [moduleId]: {
        module_id: moduleId,
        is_favorite: nextFavorite,
        usage_count: Number(current[moduleId]?.usage_count || 0),
        last_opened_at: current[moduleId]?.last_opened_at || null,
      },
    }))

    try {
      await postPreference(moduleId, 'toggle-favorite', nextFavorite)
    } catch {
      setPreferences((current) => ({
        ...current,
        [moduleId]: {
          module_id: moduleId,
          is_favorite: !nextFavorite,
          usage_count: Number(current[moduleId]?.usage_count || 0),
          last_opened_at: current[moduleId]?.last_opened_at || null,
        },
      }))
    }
  }

  const renderModuleCard = (moduleItem: DashboardModule, compact = false) => {
    const preference = preferences[moduleItem.id]
    const favorite = preference?.is_favorite || false

    return (
      <div
        key={moduleItem.id}
        className="group relative rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-[#8b1e2d]/40 hover:shadow-md"
      >
        <button
          type="button"
          onClick={() => void toggleFavorite(moduleItem.id)}
          className={`absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full border transition ${
            favorite
              ? 'border-amber-200 bg-amber-50 text-amber-600'
              : 'border-slate-200 bg-white text-slate-300 hover:text-amber-500'
          }`}
          aria-label={
            favorite
              ? `Remove ${moduleItem.title} from favorites`
              : `Add ${moduleItem.title} to favorites`
          }
        >
          <Star className="h-4 w-4" fill={favorite ? 'currentColor' : 'none'} />
        </button>

        <Link
          href={moduleItem.href}
          onClick={() => recordOpen(moduleItem.id)}
          className="block pr-8"
        >
          <div className="flex items-start gap-3">
            <div
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${moduleItem.accent}`}
            >
              <ModuleIcon moduleItem={moduleItem} className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-black text-slate-950 group-hover:text-[#8b1e2d]">
                {moduleItem.title}
              </h3>
              <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">
                {moduleItem.desc}
              </p>
            </div>
          </div>
          {!compact && (
            <div className="mt-4 flex items-center justify-between text-[11px] font-black uppercase tracking-[0.14em] text-slate-400">
              <span>{DASHBOARD_GROUP_LABELS[moduleItem.group]}</span>
              {Number(preference?.usage_count || 0) > 0 && (
                <span>{preference?.usage_count} opens</span>
              )}
            </div>
          )}
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <section className="grid grid-cols-2 gap-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-black text-slate-950">Favorites</h2>
            <span className="rounded-full bg-red-50 px-2.5 py-1 text-[11px] font-bold text-[#8b1e2d]">
              {favorites.length}
            </span>
          </div>
          <div className="mt-3 space-y-2">
            {favorites.length > 0 ? (
              favorites.slice(0, 4).map((moduleItem) => renderModuleCard(moduleItem, true))
            ) : (
              <p className="rounded-2xl bg-slate-50 p-4 text-xs leading-5 text-slate-500">
                Star modules you use often and they will stay here.
              </p>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-black text-slate-950">Frequent</h2>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-500">
              Auto
            </span>
          </div>
          <div className="mt-3 space-y-2">
            {frequent.length > 0 ? (
              frequent.slice(0, 4).map((moduleItem) => renderModuleCard(moduleItem, true))
            ) : (
              <p className="rounded-2xl bg-slate-50 p-4 text-xs leading-5 text-slate-500">
                Open modules normally and your most-used tools will appear here.
              </p>
            )}
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-base font-black text-slate-950">All modules</h2>
            <p className="text-xs text-slate-500">Grouped by the kind of work they support.</p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-500">
            {modules.length} modules
          </span>
        </div>

        <div className="space-y-5">
          {DASHBOARD_GROUP_ORDER.map((group) => {
            const groupModules = modules.filter((moduleItem) => moduleItem.group === group)
            if (groupModules.length === 0) return null

            return (
              <div key={group}>
                <h3 className="mb-2 text-xs font-black uppercase tracking-[0.18em] text-slate-400">
                  {DASHBOARD_GROUP_LABELS[group]}
                </h3>
                <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
                  {groupModules.map((moduleItem) => renderModuleCard(moduleItem))}
                </div>
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}
