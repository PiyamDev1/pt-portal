'use client'

import { useMemo, useState } from 'react'
import { Home, Navigation, Settings } from 'lucide-react'
import { toast } from 'sonner'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { AuthUser } from '@/app/types/auth'
import {
  getMobileNavigationLabel,
  getMobileShortcutOptions,
  MOBILE_NAVIGATION_METADATA_KEY,
  MOBILE_NAVIGATION_UPDATED_EVENT,
  resolveMobileShortcutIds,
} from '@/lib/mobileNavigation'

type MobileNavigationPreferencesProps = {
  currentUser: AuthUser
  supabase: SupabaseClient
  userRole: string
  userDepartments?: string[]
}

const POSITION_LABELS = ['Left shortcut 1', 'Left shortcut 2', 'Right shortcut'] as const

export function MobileNavigationPreferences({
  currentUser,
  supabase,
  userRole,
  userDepartments = [],
}: MobileNavigationPreferencesProps) {
  const availableModules = useMemo(
    () => getMobileShortcutOptions(userRole, userDepartments),
    [userDepartments, userRole],
  )
  const initialIds = resolveMobileShortcutIds(
    currentUser.user_metadata?.[MOBILE_NAVIGATION_METADATA_KEY],
    availableModules,
  )
  const [shortcutIds, setShortcutIds] = useState(initialIds)
  const [saving, setSaving] = useState(false)
  const labelForId = (id?: string) => {
    const moduleItem = availableModules.find((item) => item.id === id)
    return moduleItem ? getMobileNavigationLabel(moduleItem) : 'Choose'
  }

  const updateShortcut = (position: number, nextId: string) => {
    setShortcutIds((current) => current.map((id, index) => (index === position ? nextId : id)))
  }

  const saveShortcuts = async () => {
    const normalizedIds = resolveMobileShortcutIds(shortcutIds, availableModules)
    if (normalizedIds.length !== 3 || new Set(normalizedIds).size !== 3) {
      toast.error('Choose three different mobile shortcuts')
      return
    }

    setSaving(true)
    const { error } = await supabase.auth.updateUser({
      data: { [MOBILE_NAVIGATION_METADATA_KEY]: normalizedIds },
    })
    setSaving(false)

    if (error) {
      toast.error('Unable to save mobile navigation', { description: error.message })
      return
    }

    setShortcutIds(normalizedIds)
    window.dispatchEvent(
      new CustomEvent(MOBILE_NAVIGATION_UPDATED_EVENT, { detail: normalizedIds }),
    )
    toast.success('Mobile navigation updated')
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-red-50 p-2 text-[#8b1e2d]">
          <Navigation className="h-5 w-5" aria-hidden="true" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-slate-800">Mobile navigation</h2>
          <p className="mt-1 text-sm text-slate-600">
            Choose the three shortcuts shown around the fixed Home and Settings buttons on your
            phone.
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        {POSITION_LABELS.map((label, position) => (
          <label key={label} className="text-sm font-semibold text-slate-700">
            {label}
            <select
              value={shortcutIds[position] || ''}
              onChange={(event) => updateShortcut(position, event.target.value)}
              className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-base font-medium text-slate-800 outline-none focus:border-[#8b1e2d] focus:ring-2 focus:ring-red-100"
            >
              {availableModules.map((moduleItem) => {
                const selectedElsewhere = shortcutIds.some(
                  (selectedId, selectedPosition) =>
                    selectedPosition !== position && selectedId === moduleItem.id,
                )
                return (
                  <option key={moduleItem.id} value={moduleItem.id} disabled={selectedElsewhere}>
                    {getMobileNavigationLabel(moduleItem)}
                  </option>
                )
              })}
            </select>
          </label>
        ))}
      </div>

      <div className="mt-5 rounded-xl bg-slate-50 p-3">
        <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
          Phone menu order
        </p>
        <div className="grid grid-cols-5 items-center gap-1 text-center text-[10px] font-bold text-slate-600">
          <span>{labelForId(shortcutIds[0])}</span>
          <span>{labelForId(shortcutIds[1])}</span>
          <span className="flex flex-col items-center text-[#8b1e2d]">
            <Home className="mb-1 h-4 w-4" /> Home
          </span>
          <span>{labelForId(shortcutIds[2])}</span>
          <span className="flex flex-col items-center">
            <Settings className="mb-1 h-4 w-4" /> Settings
          </span>
        </div>
      </div>

      <button
        type="button"
        onClick={() => void saveShortcuts()}
        disabled={saving}
        className="mt-5 w-full rounded-xl bg-[#8b1e2d] px-4 py-3 text-sm font-bold text-white transition hover:bg-[#741725] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
      >
        {saving ? 'Saving…' : 'Save mobile shortcuts'}
      </button>
    </section>
  )
}
