/**
 * Dashboard module grid with user personalization.
 *
 * Favorites and usage counts are persisted through `/api/dashboard/modules`, which keeps
 * quick-access behaviour tied to the user's account rather than browser storage.
 */
'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { ComponentType } from 'react'
import { useEffect, useMemo, useState } from 'react'
import {
  BadgePoundSterling,
  BriefcaseBusiness,
  CalendarDays,
  Clock3,
  FileText,
  FingerprintPattern,
  GraduationCap,
  HeartPulse,
  Plane,
  Settings,
  Star,
  Ticket,
} from 'lucide-react'
import { PackageTravelIcon } from '@/app/components/icons/PackageTravelIcon'
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
  graduation: GraduationCap,
  heart: HeartPulse,
  'package-travel': PackageTravelIcon,
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
  const router = useRouter()
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

  function warmModule(moduleItem: DashboardModule) {
    router.prefetch(moduleItem.href)
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
        className={`group relative overflow-hidden rounded-[1.35rem] border border-white/70 bg-gradient-to-br ${moduleItem.tileTone} p-4 shadow-[0_14px_34px_-26px_rgba(15,23,42,0.65)] ring-1 ring-slate-900/5 transition duration-200 hover:-translate-y-1 hover:shadow-[0_24px_44px_-30px_rgba(75,15,22,0.65)]`}
      >
        <div className="pointer-events-none absolute -right-8 -top-10 h-24 w-24 rounded-full bg-white/60 blur-2xl" />
        <div className="pointer-events-none absolute bottom-0 left-0 h-20 w-full bg-[radial-gradient(circle_at_bottom_left,rgba(139,30,45,0.14),transparent_58%)]" />

        <button
          type="button"
          onClick={() => void toggleFavorite(moduleItem.id)}
          className={`absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full border backdrop-blur transition ${
            favorite
              ? 'border-amber-200 bg-amber-50/95 text-amber-600 shadow-sm'
              : 'border-white/70 bg-white/75 text-slate-400 hover:text-amber-500'
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
          prefetch
          onFocus={() => warmModule(moduleItem)}
          onPointerEnter={() => warmModule(moduleItem)}
          onClick={() => recordOpen(moduleItem.id)}
          className={compact ? 'relative z-[1] block pr-8' : 'relative z-[1] block text-center'}
        >
          {compact ? (
            <div className="flex items-center gap-3">
              <div
                className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-[1.1rem] bg-gradient-to-br ${moduleItem.iconTone} shadow-lg transition duration-200 group-hover:scale-105`}
              >
                <ModuleIcon moduleItem={moduleItem} className="h-6 w-6" />
              </div>
              <div className="min-w-0">
                <h3 className="truncate text-sm font-black text-slate-950 group-hover:text-[#8b1e2d]">
                  {moduleItem.title}
                </h3>
                <p className="mt-0.5 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">
                  {DASHBOARD_GROUP_LABELS[moduleItem.group]}
                </p>
              </div>
            </div>
          ) : (
            <>
              <div
                className={`mx-auto flex h-16 w-16 items-center justify-center rounded-[1.35rem] bg-gradient-to-br ${moduleItem.iconTone} shadow-xl transition duration-200 group-hover:scale-105 group-hover:rotate-[-2deg]`}
              >
                <ModuleIcon moduleItem={moduleItem} className="h-8 w-8" />
              </div>
              <h3 className="mt-4 text-base font-black text-slate-950 group-hover:text-[#8b1e2d]">
                {moduleItem.title}
              </h3>
              <p className="mx-auto mt-1 line-clamp-2 max-w-[12rem] text-xs leading-5 text-slate-600">
                {moduleItem.desc}
              </p>
              <div className="mt-4 flex items-center justify-center gap-2 text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">
                <span>{DASHBOARD_GROUP_LABELS[moduleItem.group]}</span>
                {Number(preference?.usage_count || 0) > 0 && (
                  <span className="rounded-full bg-white/75 px-2 py-0.5 text-[#8b1e2d] shadow-sm">
                    {preference?.usage_count}
                  </span>
                )}
              </div>
            </>
          )}
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <section className="grid grid-cols-3 gap-4">
        <div className="rounded-[1.5rem] border border-red-100/80 bg-gradient-to-br from-white via-red-50/60 to-stone-100 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-black text-slate-950">Favorites</h2>
            <span className="rounded-full bg-[#8b1e2d] px-2.5 py-1 text-[11px] font-bold text-white shadow-sm">
              {favorites.length}
            </span>
          </div>
          <div className="mt-3 space-y-2">
            {favorites.length > 0 ? (
              favorites.slice(0, 4).map((moduleItem) => renderModuleCard(moduleItem, true))
            ) : (
              <p className="rounded-2xl border border-dashed border-red-200 bg-white/70 p-4 text-xs leading-5 text-slate-600">
                Star modules you use often and they will stay here.
              </p>
            )}
          </div>
        </div>

        <div className="rounded-[1.5rem] border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-zinc-200 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-black text-slate-950">Frequent</h2>
            <span className="rounded-full bg-slate-900 px-2.5 py-1 text-[11px] font-bold text-white shadow-sm">
              Auto
            </span>
          </div>
          <div className="mt-3 space-y-2">
            {frequent.length > 0 ? (
              frequent.slice(0, 4).map((moduleItem) => renderModuleCard(moduleItem, true))
            ) : (
              <p className="rounded-2xl border border-dashed border-slate-300 bg-white/70 p-4 text-xs leading-5 text-slate-600">
                Open modules normally and your most-used tools will appear here.
              </p>
            )}
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 bg-gradient-to-r from-[#4b0f16] via-[#8b1e2d] to-[#3a3a3a] px-5 py-4 text-white">
          <div>
            <h2 className="text-base font-black">All modules</h2>
            <p className="text-xs text-red-100">Colour-coded launchers grouped by team workflow.</p>
          </div>
          <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-bold text-white backdrop-blur">
            {modules.length} modules
          </span>
        </div>

        <div className="space-y-6 p-4">
          {DASHBOARD_GROUP_ORDER.map((group) => {
            const groupModules = modules.filter((moduleItem) => moduleItem.group === group)
            if (groupModules.length === 0) return null

            return (
              <div key={group}>
                <h3 className="mb-3 inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-slate-500">
                  {DASHBOARD_GROUP_LABELS[group]}
                </h3>
                <div className="grid grid-cols-3 gap-3 xl:grid-cols-4">
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
