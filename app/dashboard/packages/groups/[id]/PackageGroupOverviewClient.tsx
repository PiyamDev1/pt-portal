'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import {
  ArrowLeft,
  Building2,
  Copy,
  ExternalLink,
  FileText,
  Link2,
  Loader2,
  PackageCheck,
  Users,
} from 'lucide-react'
import { toast } from 'sonner'
import type { TravelPackageGroupDetail } from '@/lib/packageGroups'

type PackageGroupResponse = {
  group?: TravelPackageGroupDetail | null
  setupRequired?: boolean
  message?: string
  error?: string
}

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

function getMetadataText(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key]
  return typeof value === 'string' ? value : ''
}

export default function PackageGroupOverviewClient({ groupId }: { groupId: string }) {
  const [group, setGroup] = useState<TravelPackageGroupDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const loadGroup = async () => {
      setLoading(true)
      setError('')
      try {
        const response = await fetch(`/api/travel-package-groups/${encodeURIComponent(groupId)}`)
        const data = (await response.json()) as PackageGroupResponse
        if (!response.ok || data.setupRequired || !data.group) {
          throw new Error(data.message || data.error || 'Unable to load package group')
        }
        setGroup(data.group)
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Unable to load package group')
      } finally {
        setLoading(false)
      }
    }

    void loadGroup()
  }, [groupId])

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-4 text-sm font-bold text-slate-600 shadow-sm">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading linked package group...
      </div>
    )
  }

  if (error || !group) {
    return (
      <div className="rounded-xl border border-red-200 bg-white p-6 text-center shadow-sm">
        <p className="text-lg font-black text-slate-950">Linked package group unavailable</p>
        <p className="mt-2 text-sm text-red-700">{error || 'Package group not found'}</p>
        <Link
          href="/dashboard/packages/groups"
          className="mt-4 inline-flex min-h-10 items-center justify-center rounded-lg bg-slate-900 px-4 text-sm font-black text-white"
        >
          Back to Group Packages
        </Link>
      </div>
    )
  }

  const quoteMembers = group.members.filter((member) => member.quote_id)
  const packageMembers = group.members.filter((member) => member.package_id)
  const copyGroupLink = async () => {
    if (!group.customerSharePath) return
    await navigator.clipboard.writeText(`${window.location.origin}${group.customerSharePath}`)
    toast.success('Single group customer link copied')
  }

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <Link
          href="/dashboard/packages/groups"
          className="inline-flex items-center gap-2 text-sm font-bold text-slate-600 transition hover:text-slate-950"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Group Packages
        </Link>
        <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-black uppercase text-cyan-900">Linked package group</p>
            <h1 className="mt-1 text-2xl font-black text-slate-950">{group.title}</h1>
            <p className="mt-1 text-sm font-semibold text-slate-500">
              {group.group_reference} · {group.status.replace(/_/g, ' ')}
            </p>
          </div>
          <div className="space-y-3 lg:min-w-[28rem]">
            <div className="flex flex-wrap justify-start gap-2 lg:justify-end">
              <button
                type="button"
                onClick={() => void copyGroupLink()}
                disabled={!group.customerSharePath}
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-cyan-900 px-4 text-sm font-black text-white transition hover:bg-cyan-950 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
                title={
                  group.customerSharePath
                    ? 'Copy the single customer link for this group'
                    : 'No live member quote is available'
                }
              >
                {group.customerSharePath ? (
                  <Copy className="h-4 w-4" />
                ) : (
                  <Link2 className="h-4 w-4" />
                )}
                {group.customerSharePath ? 'Copy Group Link' : 'No Live Group Link'}
              </button>
              {group.customerSharePath && (
                <a
                  href={group.customerSharePath}
                  target="_blank"
                  rel="noreferrer"
                  className="flex h-10 w-10 items-center justify-center rounded-lg border border-cyan-200 text-cyan-900 transition hover:bg-cyan-50"
                  title="Open group customer link"
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
              )}
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              <div className="rounded-lg bg-cyan-50 p-3">
                <p className="text-xs font-bold text-cyan-900">Members</p>
                <p className="mt-1 text-xl font-black text-cyan-950">{group.members.length}</p>
              </div>
              <div className="rounded-lg bg-slate-50 p-3">
                <p className="text-xs font-bold text-slate-500">Quotations</p>
                <p className="mt-1 text-xl font-black text-slate-950">{quoteMembers.length}</p>
              </div>
              <div className="rounded-lg bg-slate-50 p-3">
                <p className="text-xs font-bold text-slate-500">Packages</p>
                <p className="mt-1 text-xl font-black text-slate-950">{packageMembers.length}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-[#8b1e2d]" />
          <h2 className="text-lg font-black text-slate-950">Linked quotations and packages</h2>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[860px] border-separate border-spacing-0 text-left text-sm">
            <thead>
              <tr className="text-xs font-black uppercase text-slate-500">
                <th className="border-b border-slate-200 px-3 py-2">Family / Group</th>
                <th className="border-b border-slate-200 px-3 py-2">Record</th>
                <th className="border-b border-slate-200 px-3 py-2">Customer</th>
                <th className="border-b border-slate-200 px-3 py-2">Created</th>
                <th className="border-b border-slate-200 px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {group.members.map((member) => {
                const quoteTitle = getMetadataText(member.metadata, 'quoteTitle')
                const packageReference = getMetadataText(member.metadata, 'packageReference')
                const customerName =
                  member.customer_display_name || getMetadataText(member.metadata, 'customerName')
                return (
                  <tr key={member.id} className="align-top hover:bg-slate-50">
                    <td className="border-b border-slate-100 px-3 py-3">
                      <p className="font-black text-slate-950">{member.family_label}</p>
                      {member.is_lead_family && (
                        <p className="mt-1 text-xs font-bold text-cyan-800">Lead family</p>
                      )}
                    </td>
                    <td className="border-b border-slate-100 px-3 py-3">
                      <div className="flex items-start gap-2">
                        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-white">
                          {member.package_id ? (
                            <PackageCheck className="h-3.5 w-3.5" />
                          ) : member.quote_id ? (
                            <FileText className="h-3.5 w-3.5" />
                          ) : (
                            <Building2 className="h-3.5 w-3.5" />
                          )}
                        </span>
                        <div>
                          <p className="font-black text-slate-950">
                            {packageReference || quoteTitle || 'Linked record'}
                          </p>
                          <p className="text-xs text-slate-500">
                            {member.package_id
                              ? 'Package folder'
                              : member.quote_id
                                ? 'Quotation'
                                : 'Manual group member'}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="border-b border-slate-100 px-3 py-3">
                      <p className="font-bold text-slate-800">{customerName || 'No customer'}</p>
                      <p className="text-xs text-slate-500">
                        {getMetadataText(member.metadata, 'customerPhone') ||
                          getMetadataText(member.metadata, 'customerEmail') ||
                          ''}
                      </p>
                    </td>
                    <td className="border-b border-slate-100 px-3 py-3">
                      <p className="text-xs font-bold text-slate-600">
                        {formatDate(member.created_at)}
                      </p>
                    </td>
                    <td className="border-b border-slate-100 px-3 py-3">
                      <div className="flex justify-end gap-2">
                        {member.quote_id && (
                          <>
                            <Link
                              href={`/dashboard/packages/quotations/${member.quote_id}/edit`}
                              className="flex h-9 items-center justify-center rounded-lg border border-slate-200 px-3 text-xs font-black text-slate-700 transition hover:bg-slate-100"
                            >
                              Edit Quote
                            </Link>
                            <Link
                              href={`/dashboard/packages/quotations/${member.quote_id}/sales`}
                              className="flex h-9 items-center justify-center rounded-lg border border-[#8b1e2d]/20 px-3 text-xs font-black text-[#8b1e2d] transition hover:bg-red-50"
                            >
                              Sales
                            </Link>
                          </>
                        )}
                        {member.package_id && (
                          <Link
                            href={`/dashboard/packages/${member.package_id}`}
                            className="flex h-9 items-center justify-center rounded-lg bg-slate-900 px-3 text-xs font-black text-white transition hover:bg-black"
                          >
                            Open Package
                          </Link>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      {group.sharedServices.length > 0 && (
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-black text-slate-950">Shared services</h2>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {group.sharedServices.map((service) => (
              <div key={service.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-sm font-black text-slate-950">{service.title}</p>
                <p className="mt-1 text-xs font-bold text-slate-500">
                  {service.service_type} · {service.status.replace(/_/g, ' ')}
                </p>
                {service.customer_note && (
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                    {service.customer_note}
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
