'use client'

import { useMemo, useState } from 'react'
import { ChevronDown, Link2, Plane } from 'lucide-react'
import type {
  PackageQuotePayload,
  TravelPackageGroup,
  TravelPackageQuote,
} from '@/app/types/packages'
import type { TravelPackageGroupDetail } from '@/lib/packageGroups'
import { normalizePackageQuotePayload } from '@/lib/packageQuote'

export type PackageLinkedGroupWorkspaceModel = {
  activeQuote: TravelPackageQuote | null
  activePackageGroup: TravelPackageGroupDetail | null
  activePackageGroupQuoteIds: ReadonlySet<string>
  payload: Pick<PackageQuotePayload, 'customerName' | 'linkedPackageGroup'>
  packageGroups: TravelPackageGroup[]
  quotes: TravelPackageQuote[]
  loading: boolean
  packageGroupLoading: boolean
  packageGroupSaving: boolean
  packageGroupSetupMessage: string | null
  newGroupTitle: string
  linkedFamilyLabel: string
  selectedGroupId: string
  packageGroupSearch: string
  quoteGroupSearch: string
  selectedQuoteForGroupId: string
  selectedQuoteFamilyLabel: string
  sharedTransportNote: string
  sharedFlightSelection: boolean
  setNewGroupTitle: (value: string) => void
  setLinkedFamilyLabel: (value: string) => void
  setSelectedGroupId: (value: string) => void
  setPackageGroupSearch: (value: string) => void
  setQuoteGroupSearch: (value: string) => void
  setSelectedQuoteForGroupId: (value: string) => void
  setSelectedQuoteFamilyLabel: (value: string) => void
  setSharedTransportNote: (value: string) => void
  createPackageGroup: () => void | Promise<void>
  linkSelectedPackageGroup: () => void | Promise<void>
  linkSelectedQuoteToPackageGroup: () => void | Promise<void>
  saveSharedTransportNote: () => void | Promise<void>
  saveSharedFlightSelection: (nextValue: boolean) => void | Promise<void>
  unlinkCurrentQuoteFromGroup: () => void | Promise<void>
  applyPackageGroupSnapshot: (group: TravelPackageGroupDetail) => void
}

export function PackageLinkedGroupWorkspace({
  model,
}: {
  model: PackageLinkedGroupWorkspaceModel
}) {
  const {
    activeQuote,
    activePackageGroup,
    activePackageGroupQuoteIds,
    payload,
    packageGroups,
    quotes,
    loading,
    packageGroupLoading,
    packageGroupSaving,
    packageGroupSetupMessage,
    newGroupTitle,
    linkedFamilyLabel,
    selectedGroupId,
    packageGroupSearch,
    quoteGroupSearch,
    selectedQuoteForGroupId,
    selectedQuoteFamilyLabel,
    sharedTransportNote,
    sharedFlightSelection,
    setNewGroupTitle,
    setLinkedFamilyLabel,
    setSelectedGroupId,
    setPackageGroupSearch,
    setQuoteGroupSearch,
    setSelectedQuoteForGroupId,
    setSelectedQuoteFamilyLabel,
    setSharedTransportNote,
    createPackageGroup,
    linkSelectedPackageGroup,
    linkSelectedQuoteToPackageGroup,
    saveSharedTransportNote,
    saveSharedFlightSelection,
    unlinkCurrentQuoteFromGroup,
    applyPackageGroupSnapshot,
  } = model
  const [packageGroupExpanded, setPackageGroupExpanded] = useState(false)

  const filteredPackageGroups = useMemo(() => {
    const search = packageGroupSearch.trim().toLowerCase()
    const currentGroups = packageGroups.filter((group) => group.status !== 'archived')
    if (!search) return currentGroups
    return currentGroups.filter((group) =>
      `${group.group_reference} ${group.title}`.toLowerCase().includes(search),
    )
  }, [packageGroupSearch, packageGroups])

  const filteredLinkableQuotes = useMemo(() => {
    const search = quoteGroupSearch.trim().toLowerCase()
    return quotes
      .filter(
        (quote) =>
          quote.id !== activeQuote?.id &&
          quote.status !== 'archived' &&
          !activePackageGroupQuoteIds.has(quote.id),
      )
      .filter((quote) => {
        if (!search) return true
        const quotePayload = normalizePackageQuotePayload(quote.payload)
        return `${quote.title} ${quote.customer_name || ''} ${quote.customer_phone || ''} ${
          quote.customer_email || ''
        } ${quotePayload.customerName} ${quotePayload.customerPhone} ${quotePayload.customerEmail}`
          .toLowerCase()
          .includes(search)
      })
  }, [activePackageGroupQuoteIds, activeQuote?.id, quoteGroupSearch, quotes])

  const formatQuoteGroupOptionLabel = (quote: TravelPackageQuote) => {
    const quotePayload = normalizePackageQuotePayload(quote.payload)
    const customerName = quote.customer_name || quotePayload.customerName || 'No customer'
    const createdDate = new Date(quote.created_at).toLocaleDateString('en-GB')
    return `${quote.title} - ${customerName} - ${createdDate}`
  }

  return (
    <section className="rounded-xl border border-cyan-200 bg-cyan-50/50 p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-950 text-white">
            <Link2 className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h2 className="text-lg font-black text-slate-950">Linked package group</h2>
            <p className="mt-1 truncate text-xs font-semibold text-cyan-900">
              {activePackageGroup
                ? `${activePackageGroup.group_reference} - ${activePackageGroup.title}`
                : activeQuote
                  ? 'No linked group active'
                  : 'Save this quote first to link family packages'}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setPackageGroupExpanded((current) => !current)}
          className="flex min-h-9 items-center justify-center gap-2 rounded-lg border border-cyan-200 bg-white px-3 text-sm font-black text-cyan-900 transition hover:bg-cyan-50"
          aria-expanded={packageGroupExpanded}
        >
          {packageGroupExpanded ? 'Hide details' : 'Show details'}
          <ChevronDown
            className={`h-4 w-4 transition ${packageGroupExpanded ? 'rotate-180' : ''}`}
          />
        </button>
      </div>
      {activePackageGroup && (
        <div className="mt-3 flex flex-wrap gap-2">
          <span className="rounded-lg bg-cyan-100 px-3 py-1 text-xs font-black text-cyan-900">
            {activePackageGroup.members.length} linked quote
            {activePackageGroup.members.length === 1 ? '' : 's'}
          </span>
          {activePackageGroup.members.slice(0, 4).map((member) => (
            <span
              key={member.id}
              className={`rounded-lg px-2 py-1 text-xs font-bold ${
                member.quote_id === activeQuote?.id
                  ? 'bg-slate-900 text-white'
                  : 'bg-white text-slate-700'
              }`}
            >
              {member.family_label}
            </span>
          ))}
          {activePackageGroup.members.length > 4 && (
            <span className="rounded-lg bg-white px-2 py-1 text-xs font-bold text-slate-500">
              +{activePackageGroup.members.length - 4} more
            </span>
          )}
          <button
            type="button"
            onClick={() => void saveSharedFlightSelection(!sharedFlightSelection)}
            disabled={packageGroupSaving}
            className={`inline-flex min-h-8 items-center gap-2 rounded-lg px-3 text-xs font-black transition disabled:opacity-50 ${
              sharedFlightSelection
                ? 'bg-sky-900 text-white hover:bg-sky-950'
                : 'border border-sky-200 bg-white text-sky-900 hover:bg-sky-50'
            }`}
            title="Allow customers to select the same flight options across linked packages"
          >
            <Plane className="h-3.5 w-3.5" />
            Same flights across packages: {sharedFlightSelection ? 'Yes' : 'No'}
          </button>
        </div>
      )}
      {packageGroupExpanded && (
        <div className="mt-4">
          {packageGroupSetupMessage && (
            <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-800">
              {packageGroupSetupMessage}
            </div>
          )}
          {!activeQuote ? (
            <div className="rounded-lg border border-dashed border-cyan-300 bg-white/80 p-4 text-sm font-semibold text-cyan-900">
              Save this quote first, then link it with another family package for shared transport.
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                <div className="rounded-lg border border-cyan-200 bg-white p-3">
                  <p className="text-sm font-black text-slate-950">Create new group</p>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <label className="block md:col-span-2">
                      <span className="mb-1 block text-xs font-bold text-slate-500">
                        Group name
                      </span>
                      <input
                        value={newGroupTitle}
                        onChange={(event) => setNewGroupTitle(event.target.value)}
                        placeholder={`${payload.customerName || 'Linked families'} package group`}
                        className="min-h-11 w-full rounded-lg border border-slate-200 px-3 text-sm font-bold outline-none focus:border-cyan-700"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-xs font-bold text-slate-500">
                        This family label
                      </span>
                      <input
                        value={linkedFamilyLabel}
                        onChange={(event) => setLinkedFamilyLabel(event.target.value)}
                        placeholder="Family Ali"
                        className="min-h-11 w-full rounded-lg border border-slate-200 px-3 text-sm font-bold outline-none focus:border-cyan-700"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => void createPackageGroup()}
                      disabled={packageGroupSaving}
                      className="self-end min-h-11 rounded-lg bg-cyan-900 px-3 text-sm font-black text-white transition hover:bg-cyan-950 disabled:opacity-50"
                    >
                      Create & Link
                    </button>
                  </div>
                </div>

                <div className="rounded-lg border border-cyan-200 bg-white p-3">
                  <p className="text-sm font-black text-slate-950">Link existing group</p>
                  <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_9rem]">
                    <label className="block md:col-span-2">
                      <span className="mb-1 block text-xs font-bold text-slate-500">
                        Search groups
                      </span>
                      <input
                        value={packageGroupSearch}
                        onChange={(event) => setPackageGroupSearch(event.target.value)}
                        placeholder="Search by group ref or name"
                        className="min-h-11 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-cyan-700"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-xs font-bold text-slate-500">
                        Package group
                      </span>
                      <select
                        value={selectedGroupId}
                        onChange={(event) => setSelectedGroupId(event.target.value)}
                        disabled={packageGroupLoading}
                        className="min-h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold outline-none focus:border-cyan-700 disabled:text-slate-400"
                      >
                        <option value="">
                          {packageGroupLoading ? 'Loading groups...' : 'Select group'}
                        </option>
                        {filteredPackageGroups.map((group) => (
                          <option key={group.id} value={group.id}>
                            {group.group_reference} - {group.title}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      onClick={() => void linkSelectedPackageGroup()}
                      disabled={packageGroupSaving || !selectedGroupId}
                      className="self-end min-h-11 rounded-lg border border-cyan-200 bg-cyan-50 px-3 text-sm font-black text-cyan-900 transition hover:bg-cyan-100 disabled:opacity-50"
                    >
                      Link
                    </button>
                  </div>
                </div>

                <div className="rounded-lg border border-blue-200 bg-blue-50/60 p-3 lg:col-span-2">
                  <p className="text-sm font-black text-slate-950">Link existing quotation</p>
                  <p className="mt-1 text-xs font-semibold text-blue-900">
                    Use this when both families already have separate quotations and no linked group
                    has been created yet.
                  </p>
                  <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_10rem]">
                    <label className="block">
                      <span className="mb-1 block text-xs font-bold text-slate-500">
                        Search quotations
                      </span>
                      <input
                        value={quoteGroupSearch}
                        onChange={(event) => setQuoteGroupSearch(event.target.value)}
                        placeholder="Search by quote, customer, phone or email"
                        className="min-h-11 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-blue-700"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-xs font-bold text-slate-500">
                        Existing quotation
                      </span>
                      <select
                        value={selectedQuoteForGroupId}
                        onChange={(event) => setSelectedQuoteForGroupId(event.target.value)}
                        disabled={loading}
                        className="min-h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold outline-none focus:border-blue-700 disabled:text-slate-400"
                      >
                        <option value="">
                          {loading ? 'Loading quotes...' : 'Select quotation'}
                        </option>
                        {filteredLinkableQuotes.map((quote) => (
                          <option key={quote.id} value={quote.id}>
                            {formatQuoteGroupOptionLabel(quote)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-xs font-bold text-slate-500">
                        Their family label
                      </span>
                      <input
                        value={selectedQuoteFamilyLabel}
                        onChange={(event) => setSelectedQuoteFamilyLabel(event.target.value)}
                        placeholder="Family Hussain"
                        className="min-h-11 w-full rounded-lg border border-slate-200 px-3 text-sm font-bold outline-none focus:border-blue-700"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => void linkSelectedQuoteToPackageGroup()}
                      disabled={packageGroupSaving || !selectedQuoteForGroupId}
                      className="min-h-11 rounded-lg bg-blue-900 px-3 text-sm font-black text-white transition hover:bg-blue-950 disabled:opacity-50 md:col-start-3"
                    >
                      {activePackageGroup ? 'Add Quote' : 'Create Group'}
                    </button>
                    {!loading && filteredLinkableQuotes.length === 0 && (
                      <p className="text-xs font-semibold text-slate-500 md:col-span-3">
                        No matching saved quotations found.
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-cyan-200 bg-white p-3">
                <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                  <div>
                    <p className="text-sm font-black text-slate-950">
                      {activePackageGroup
                        ? `${activePackageGroup.group_reference} - ${activePackageGroup.title}`
                        : 'No linked group active'}
                    </p>
                    <p className="mt-1 text-xs font-semibold text-slate-500">
                      Customer output will only show the note. Internal shared transport costs stay
                      hidden.
                    </p>
                  </div>
                  {activePackageGroup && (
                    <div className="flex flex-wrap gap-2">
                      <span className="rounded-lg bg-cyan-100 px-3 py-1 text-xs font-black text-cyan-900">
                        {activePackageGroup.members.length} linked quote
                        {activePackageGroup.members.length === 1 ? '' : 's'}
                      </span>
                      <button
                        type="button"
                        onClick={() => void unlinkCurrentQuoteFromGroup()}
                        disabled={packageGroupSaving}
                        className="min-h-7 rounded-lg border border-red-200 px-3 text-xs font-black text-red-700 transition hover:bg-red-50 disabled:opacity-50"
                      >
                        Unlink
                      </button>
                    </div>
                  )}
                </div>
                {activePackageGroup && activePackageGroup.members.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {activePackageGroup.members.map((member) => (
                      <span
                        key={member.id}
                        className={`rounded-lg px-2 py-1 text-xs font-bold ${
                          member.quote_id === activeQuote.id
                            ? 'bg-slate-900 text-white'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {member.family_label}
                      </span>
                    ))}
                  </div>
                )}
                <label className="mt-3 block">
                  <span className="mb-1 block text-xs font-bold text-slate-500">
                    Shared transport customer note
                  </span>
                  <textarea
                    value={sharedTransportNote}
                    onChange={(event) => setSharedTransportNote(event.target.value)}
                    placeholder="Transport is shared with Family Hussain / PT-ABC123."
                    rows={3}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-cyan-700"
                  />
                </label>
                <div className="mt-3 rounded-lg border border-sky-200 bg-sky-50 p-3">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="text-sm font-black text-slate-950">Shared flight selection</p>
                      <p className="mt-1 text-xs font-semibold leading-5 text-slate-600">
                        Allow customers to apply the same main and linked flight choices to the
                        other families in this group where matching options exist. Save this setting
                        for the customer match-flight option to appear.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void saveSharedFlightSelection(!sharedFlightSelection)}
                      disabled={!activePackageGroup}
                      className={`min-h-10 rounded-lg px-4 text-sm font-black transition disabled:opacity-50 ${
                        sharedFlightSelection
                          ? 'bg-sky-900 text-white hover:bg-sky-950'
                          : 'border border-sky-200 bg-white text-sky-900 hover:bg-sky-100'
                      }`}
                    >
                      {sharedFlightSelection ? 'Shared Flights: Yes' : 'Shared Flights: No'}
                    </button>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void saveSharedTransportNote()}
                    disabled={packageGroupSaving || !activePackageGroup}
                    className="min-h-10 rounded-lg bg-slate-900 px-3 text-sm font-black text-white transition hover:bg-black disabled:opacity-50"
                  >
                    Save Transport Note
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      activePackageGroup && applyPackageGroupSnapshot(activePackageGroup)
                    }
                    disabled={!activePackageGroup}
                    className="min-h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 transition hover:bg-slate-100 disabled:opacity-50"
                  >
                    Refresh Snapshot
                  </button>
                </div>
                {payload.linkedPackageGroup && (
                  <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800">
                    Snapshot ready on this quote. Press Save to persist it.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
