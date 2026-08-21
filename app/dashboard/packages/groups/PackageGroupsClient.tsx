'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  Copy,
  ExternalLink,
  FolderKanban,
  Link2,
  Loader2,
  Search,
  Trash2,
  Users,
} from 'lucide-react'
import { toast } from 'sonner'
import type { TravelPackageGroup } from '@/app/types/packages'
import type { TravelPackageGroupDetail } from '@/lib/packageGroups'

type PackageGroupsClientProps = {
  currentUserRole?: string
}

type GroupsResponse = {
  groups?: TravelPackageGroup[]
  setupRequired?: boolean
  message?: string
  error?: string
}

type GroupResponse = {
  group?: TravelPackageGroupDetail | null
  setupRequired?: boolean
  message?: string
  error?: string
}

type GroupFilter = 'current' | 'archived' | 'all'
type BulkAction = 'archive' | 'restore' | 'delete'

const ADMIN_ROLES = new Set(['admin', 'master admin', 'super admin'])

function formatDate(value: string | null | undefined) {
  if (!value) return 'Not set'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Not set'
  return date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function getGroupStatusClass(status: string) {
  if (status === 'archived') return 'border-slate-200 bg-slate-100 text-slate-600'
  if (status === 'cancelled') return 'border-red-200 bg-red-50 text-red-700'
  if (['finalised', 'completed'].includes(status)) {
    return 'border-emerald-200 bg-emerald-50 text-emerald-700'
  }
  if (status === 'partially_finalised') {
    return 'border-amber-200 bg-amber-50 text-amber-700'
  }
  return 'border-cyan-200 bg-cyan-50 text-cyan-800'
}

function getGroupSearchValues(group: TravelPackageGroupDetail) {
  return [
    group.title,
    group.group_reference,
    group.status,
    ...group.members.flatMap((member) => [
      member.family_label,
      member.customer_display_name,
      member.metadata?.quoteTitle,
      member.metadata?.customerName,
      member.metadata?.packageReference,
    ]),
  ]
}

export default function PackageGroupsClient({ currentUserRole }: PackageGroupsClientProps) {
  const [groups, setGroups] = useState<TravelPackageGroupDetail[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [filter, setFilter] = useState<GroupFilter>('current')
  const [searchTerm, setSearchTerm] = useState('')
  const [loading, setLoading] = useState(true)
  const [processingAction, setProcessingAction] = useState<BulkAction | null>(null)
  const canDelete = ADMIN_ROLES.has((currentUserRole || '').trim().toLowerCase())

  const loadGroups = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/travel-package-groups?status=all')
      const data = (await response.json()) as GroupsResponse
      if (!response.ok || data.setupRequired) {
        throw new Error(data.message || data.error || 'Unable to load package groups')
      }

      const details = await Promise.all(
        (data.groups || []).map(async (group) => {
          const detailResponse = await fetch(`/api/travel-package-groups/${group.id}`)
          const detailData = (await detailResponse.json()) as GroupResponse
          return detailResponse.ok && !detailData.setupRequired && detailData.group
            ? detailData.group
            : null
        }),
      )
      setGroups(details.filter((group): group is TravelPackageGroupDetail => Boolean(group)))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to load package groups')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadGroups()
  }, [loadGroups])

  const filteredGroups = useMemo(() => {
    const query = searchTerm.trim().toLowerCase()
    return groups.filter((group) => {
      if (filter === 'archived' && group.status !== 'archived') return false
      if (filter === 'current' && ['archived', 'cancelled'].includes(group.status)) return false
      if (!query) return true
      return getGroupSearchValues(group).some((value) =>
        String(value || '')
          .toLowerCase()
          .includes(query),
      )
    })
  }, [filter, groups, searchTerm])

  const visibleIds = filteredGroups.map((group) => group.id)
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((groupId) => selectedIds.has(groupId))

  const toggleGroup = (groupId: string) => {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(groupId)) next.delete(groupId)
      else next.add(groupId)
      return next
    })
  }

  const toggleAllVisible = () => {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (allVisibleSelected) visibleIds.forEach((groupId) => next.delete(groupId))
      else visibleIds.forEach((groupId) => next.add(groupId))
      return next
    })
  }

  const copyGroupLink = async (group: TravelPackageGroupDetail) => {
    if (!group.customerSharePath) return
    await navigator.clipboard.writeText(`${window.location.origin}${group.customerSharePath}`)
    toast.success(`${group.title} customer link copied`)
  }

  const runBulkAction = async (action: BulkAction) => {
    const ids = [...selectedIds]
    if (ids.length === 0) return
    if (action === 'delete') {
      const confirmed = window.confirm(
        `Delete ${ids.length} group${ids.length === 1 ? '' : 's'}? This removes the group links and shared services, but keeps every quotation and package folder.`,
      )
      if (!confirmed) return
    }

    setProcessingAction(action)
    try {
      const response = await fetch('/api/travel-package-groups', {
        method: action === 'delete' ? 'DELETE' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(action === 'delete' ? { ids } : { ids, action }),
      })
      const data = (await response.json()) as { error?: string }
      if (!response.ok) throw new Error(data.error || `Failed to ${action} package groups`)

      if (action === 'delete') {
        setGroups((current) => current.filter((group) => !selectedIds.has(group.id)))
      } else {
        setGroups((current) =>
          current.map((group) =>
            selectedIds.has(group.id)
              ? {
                  ...group,
                  status: action === 'archive' ? 'archived' : 'active',
                  archived_at: action === 'archive' ? new Date().toISOString() : null,
                  customerSharePath: action === 'archive' ? null : group.customerSharePath,
                }
              : group,
          ),
        )
      }
      setSelectedIds(new Set())
      toast.success(
        `${ids.length} package group${ids.length === 1 ? '' : 's'} ${action === 'delete' ? 'deleted' : action === 'archive' ? 'archived' : 'restored'}`,
      )
      if (action === 'restore') await loadGroups()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `Failed to ${action} package groups`)
    } finally {
      setProcessingAction(null)
    }
  }

  const renderGroupActions = (group: TravelPackageGroupDetail, compact = false) => (
    <div className={`flex flex-wrap gap-2 ${compact ? '' : 'justify-end'}`}>
      <button
        type="button"
        onClick={() => void copyGroupLink(group)}
        disabled={!group.customerSharePath}
        className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-cyan-200 bg-cyan-50 px-3 text-xs font-black text-cyan-900 transition hover:bg-cyan-100 disabled:cursor-not-allowed disabled:opacity-40"
        title={
          group.customerSharePath ? 'Copy the single group customer link' : 'No live group link'
        }
      >
        <Copy className="h-3.5 w-3.5" />
        Group Link
      </button>
      {group.customerSharePath && (
        <a
          href={group.customerSharePath}
          target="_blank"
          rel="noreferrer"
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-700 transition hover:bg-slate-100"
          title="Open group customer link"
        >
          <ExternalLink className="h-4 w-4" />
        </a>
      )}
      <Link
        href={`/dashboard/packages/groups/${group.id}`}
        className="inline-flex min-h-9 items-center justify-center rounded-lg bg-slate-900 px-3 text-xs font-black text-white transition hover:bg-black"
      >
        Open Group
      </Link>
    </div>
  )

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <Link
          href="/dashboard/packages"
          className="inline-flex items-center gap-2 text-sm font-bold text-slate-600 transition hover:text-slate-950"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Packages
        </Link>
        <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-cyan-900 text-white">
                <FolderKanban className="h-5 w-5" />
              </span>
              <div>
                <p className="text-xs font-black uppercase text-cyan-900">Packages</p>
                <h1 className="text-2xl font-black text-slate-950">Group packages</h1>
              </div>
            </div>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
              Linked families live here instead of the main quotations table. Each group has one
              customer link that opens its linked-family view.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:min-w-[24rem]">
            <div className="rounded-lg bg-cyan-50 p-3">
              <p className="text-xs font-bold text-cyan-800">Current</p>
              <p className="mt-1 text-xl font-black text-cyan-950">
                {groups.filter((group) => !['archived', 'cancelled'].includes(group.status)).length}
              </p>
            </div>
            <div className="rounded-lg bg-emerald-50 p-3">
              <p className="text-xs font-bold text-emerald-700">Live links</p>
              <p className="mt-1 text-xl font-black text-emerald-800">
                {groups.filter((group) => group.customerSharePath).length}
              </p>
            </div>
            <div className="rounded-lg bg-slate-100 p-3">
              <p className="text-xs font-bold text-slate-600">Archived</p>
              <p className="mt-1 text-xl font-black text-slate-900">
                {groups.filter((group) => group.status === 'archived').length}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="sticky top-2 z-20 border-y-4 border-cyan-900 bg-white px-3 py-3 shadow-lg sm:rounded-xl sm:border-x sm:px-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search groups or families"
                className="min-h-10 w-full rounded-lg border border-slate-200 pl-9 pr-3 text-sm outline-none focus:border-cyan-800 sm:w-72"
              />
            </div>
            <div className="flex gap-1">
              {(
                [
                  ['current', 'Current'],
                  ['archived', 'Archived'],
                  ['all', 'All'],
                ] as Array<[GroupFilter, string]>
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setFilter(value)}
                  className={`min-h-10 rounded-lg px-3 text-xs font-black transition ${
                    filter === value
                      ? 'bg-cyan-900 text-white'
                      : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {selectedIds.size > 0 && (
            <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 pt-3 lg:border-l lg:border-t-0 lg:pl-3 lg:pt-0">
              <span className="mr-1 text-xs font-black text-slate-600">
                {selectedIds.size} selected
              </span>
              <button
                type="button"
                onClick={() => void runBulkAction('archive')}
                disabled={Boolean(processingAction)}
                className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 text-xs font-black text-amber-800 disabled:opacity-50"
              >
                {processingAction === 'archive' ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Archive className="h-3.5 w-3.5" />
                )}
                Archive
              </button>
              <button
                type="button"
                onClick={() => void runBulkAction('restore')}
                disabled={Boolean(processingAction)}
                className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-xs font-black text-emerald-800 disabled:opacity-50"
              >
                {processingAction === 'restore' ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <ArchiveRestore className="h-3.5 w-3.5" />
                )}
                Restore
              </button>
              {canDelete && (
                <button
                  type="button"
                  onClick={() => void runBulkAction('delete')}
                  disabled={Boolean(processingAction)}
                  className="inline-flex min-h-9 items-center gap-2 rounded-lg bg-red-700 px-3 text-xs font-black text-white disabled:opacity-50"
                >
                  {processingAction === 'delete' ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" />
                  )}
                  Delete
                </button>
              )}
            </div>
          )}
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 pb-3">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-cyan-900" />
            <h2 className="text-lg font-black text-slate-950">Package groups</h2>
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-xs font-black text-slate-600">
            <input
              type="checkbox"
              checked={allVisibleSelected}
              onChange={toggleAllVisible}
              className="h-4 w-4 accent-cyan-900"
            />
            Select visible
          </label>
        </div>

        {loading ? (
          <div className="mt-4 flex items-center gap-2 rounded-lg bg-slate-50 p-4 text-sm font-bold text-slate-600">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading group packages...
          </div>
        ) : filteredGroups.length === 0 ? (
          <div className="mt-4 rounded-lg border border-dashed border-slate-300 p-8 text-center">
            <FolderKanban className="mx-auto h-6 w-6 text-slate-400" />
            <p className="mt-3 text-sm font-black text-slate-700">No package groups match.</p>
          </div>
        ) : (
          <>
            <div className="mt-4 grid gap-3 md:hidden">
              {filteredGroups.map((group) => (
                <article
                  key={`${group.id}-mobile`}
                  className={`rounded-xl border p-3 ${
                    selectedIds.has(group.id)
                      ? 'border-cyan-400 bg-cyan-50/40'
                      : 'border-slate-200 bg-white'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(group.id)}
                      onChange={() => toggleGroup(group.id)}
                      aria-label={`Select ${group.title}`}
                      className="mt-1 h-4 w-4 shrink-0 accent-cyan-900"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="break-words text-base font-black text-slate-950">
                        {group.title}
                      </p>
                      <p className="mt-1 text-xs font-bold text-slate-500">
                        {group.group_reference} · created {formatDate(group.created_at)}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <span
                          className={`rounded-lg border px-2 py-1 text-xs font-black ${getGroupStatusClass(group.status)}`}
                        >
                          {group.status.replace(/_/g, ' ')}
                        </span>
                        <span className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-black text-slate-600">
                          {group.members.length} families
                        </span>
                        <span
                          className={`rounded-lg px-2 py-1 text-xs font-black ${
                            group.customerSharePath
                              ? 'bg-emerald-50 text-emerald-700'
                              : 'bg-slate-100 text-slate-500'
                          }`}
                        >
                          {group.customerSharePath ? 'Group link live' : 'No live link'}
                        </span>
                      </div>
                      <div className="mt-3">{renderGroupActions(group, true)}</div>
                    </div>
                  </div>
                </article>
              ))}
            </div>

            <div className="mt-4 hidden overflow-x-auto md:block">
              <table className="w-full min-w-[980px] border-separate border-spacing-0 text-left text-sm">
                <thead>
                  <tr className="text-xs font-black uppercase text-slate-500">
                    <th className="w-10 border-b border-slate-200 px-3 py-2">
                      <span className="sr-only">Select</span>
                    </th>
                    <th className="border-b border-slate-200 px-3 py-2">Group</th>
                    <th className="border-b border-slate-200 px-3 py-2">Families</th>
                    <th className="border-b border-slate-200 px-3 py-2">Status</th>
                    <th className="border-b border-slate-200 px-3 py-2">Customer Link</th>
                    <th className="border-b border-slate-200 px-3 py-2">Updated</th>
                    <th className="border-b border-slate-200 px-3 py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredGroups.map((group) => (
                    <tr
                      key={group.id}
                      className={selectedIds.has(group.id) ? 'bg-cyan-50/60' : 'hover:bg-slate-50'}
                    >
                      <td className="border-b border-slate-100 px-3 py-3">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(group.id)}
                          onChange={() => toggleGroup(group.id)}
                          aria-label={`Select ${group.title}`}
                          className="h-4 w-4 accent-cyan-900"
                        />
                      </td>
                      <td className="border-b border-slate-100 px-3 py-3">
                        <p className="max-w-[18rem] truncate font-black text-slate-950">
                          {group.title}
                        </p>
                        <p className="text-xs font-bold text-slate-500">{group.group_reference}</p>
                      </td>
                      <td className="border-b border-slate-100 px-3 py-3">
                        <p className="font-black text-slate-800">{group.members.length} linked</p>
                        <p className="max-w-[14rem] truncate text-xs text-slate-500">
                          {group.members.map((member) => member.family_label).join(', ')}
                        </p>
                      </td>
                      <td className="border-b border-slate-100 px-3 py-3">
                        <span
                          className={`rounded-lg border px-2 py-1 text-xs font-black ${getGroupStatusClass(group.status)}`}
                        >
                          {group.status.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="border-b border-slate-100 px-3 py-3">
                        <div className="flex items-center gap-2">
                          <Link2
                            className={`h-4 w-4 ${group.customerSharePath ? 'text-emerald-600' : 'text-slate-300'}`}
                          />
                          <div>
                            <p className="text-xs font-black text-slate-700">
                              {group.customerSharePath ? 'Single group link' : 'No live link'}
                            </p>
                            {group.customerShareExpiresAt && (
                              <p className="text-[11px] text-slate-500">
                                Expires {formatDate(group.customerShareExpiresAt)}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="border-b border-slate-100 px-3 py-3 text-xs font-bold text-slate-600">
                        {formatDate(group.updated_at || group.created_at)}
                      </td>
                      <td className="border-b border-slate-100 px-3 py-3">
                        {renderGroupActions(group)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </div>
  )
}
