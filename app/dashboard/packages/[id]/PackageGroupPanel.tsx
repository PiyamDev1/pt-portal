import { Link2 } from 'lucide-react'
import type { Dispatch, SetStateAction } from 'react'
import type { TravelPackageFolder, TravelPackageGroup } from '@/app/types/packages'
import type { TravelPackageGroupDetail } from '@/lib/packageGroups'

type PackageGroupPanelProps = {
  packageId: string
  packageFolder: TravelPackageFolder
  packageGroupError: string | null
  packageGroupTitle: string
  setPackageGroupTitle: Dispatch<SetStateAction<string>>
  packageGroupFamilyLabel: string
  setPackageGroupFamilyLabel: Dispatch<SetStateAction<string>>
  packageGroupSearch: string
  setPackageGroupSearch: Dispatch<SetStateAction<string>>
  packageGroupSelectedId: string
  setPackageGroupSelectedId: Dispatch<SetStateAction<string>>
  packageGroupLoading: boolean
  packageGroupSaving: boolean
  filteredPackageGroups: TravelPackageGroup[]
  activePackageGroup: TravelPackageGroupDetail | null
  packageGroupTransportNote: string
  setPackageGroupTransportNote: Dispatch<SetStateAction<string>>
  onCreateGroup: () => void
  onLinkPackage: () => void
  onUnlinkPackage: () => void
  onSaveTransportNote: () => void
}

export default function PackageGroupPanel({
  packageId,
  packageFolder,
  packageGroupError,
  packageGroupTitle,
  setPackageGroupTitle,
  packageGroupFamilyLabel,
  setPackageGroupFamilyLabel,
  packageGroupSearch,
  setPackageGroupSearch,
  packageGroupSelectedId,
  setPackageGroupSelectedId,
  packageGroupLoading,
  packageGroupSaving,
  filteredPackageGroups,
  activePackageGroup,
  packageGroupTransportNote,
  setPackageGroupTransportNote,
  onCreateGroup,
  onLinkPackage,
  onUnlinkPackage,
  onSaveTransportNote,
}: PackageGroupPanelProps) {
  return (
    <section className="rounded-xl border border-cyan-200 bg-cyan-50/50 p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-cyan-900 text-white">
          <Link2 className="h-4 w-4" />
        </span>
        <div>
          <h2 className="text-lg font-black text-slate-950">Linked package group</h2>
          <p className="text-xs font-semibold text-cyan-900">
            Link family package folders for shared transport without showing internal transport cost
            to customers.
          </p>
        </div>
      </div>
      {packageGroupError && (
        <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm font-bold text-amber-900">
          {packageGroupError}
        </div>
      )}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="rounded-lg border border-cyan-200 bg-white p-3">
          <p className="text-sm font-black text-slate-950">Create or link group</p>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <label className="block md:col-span-2">
              <span className="mb-1 block text-xs font-bold text-slate-500">Group name</span>
              <input
                value={packageGroupTitle}
                onChange={(event) => setPackageGroupTitle(event.target.value)}
                placeholder={`${packageFolder.customer_name || packageFolder.package_reference} linked group`}
                className="min-h-11 w-full rounded-lg border border-slate-200 px-3 text-sm font-bold outline-none focus:border-cyan-700"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-bold text-slate-500">This family label</span>
              <input
                value={packageGroupFamilyLabel}
                onChange={(event) => setPackageGroupFamilyLabel(event.target.value)}
                placeholder="Family Ali"
                className="min-h-11 w-full rounded-lg border border-slate-200 px-3 text-sm font-bold outline-none focus:border-cyan-700"
              />
            </label>
            <button
              type="button"
              onClick={onCreateGroup}
              disabled={packageGroupSaving}
              className="self-end min-h-11 rounded-lg bg-cyan-900 px-3 text-sm font-black text-white transition hover:bg-cyan-950 disabled:opacity-50"
            >
              Create Group
            </button>
            <label className="block md:col-span-2">
              <span className="mb-1 block text-xs font-bold text-slate-500">Find group</span>
              <input
                value={packageGroupSearch}
                onChange={(event) => setPackageGroupSearch(event.target.value)}
                placeholder="Search by group ref or name"
                className="min-h-11 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-cyan-700"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-bold text-slate-500">Existing group</span>
              <select
                value={packageGroupSelectedId}
                onChange={(event) => setPackageGroupSelectedId(event.target.value)}
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
              onClick={onLinkPackage}
              disabled={packageGroupSaving || !packageGroupSelectedId}
              className="self-end min-h-11 rounded-lg border border-cyan-200 bg-cyan-50 px-3 text-sm font-black text-cyan-900 transition hover:bg-cyan-100 disabled:opacity-50"
            >
              Link Package
            </button>
          </div>
        </div>

        <div className="rounded-lg border border-cyan-200 bg-white p-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm font-black text-slate-950">
                {activePackageGroup
                  ? `${activePackageGroup.group_reference} - ${activePackageGroup.title}`
                  : 'No linked group active'}
              </p>
              <p className="mt-1 text-xs font-semibold text-slate-500">
                Customer output uses note-only wording. Internal allocation stays private.
              </p>
            </div>
            {activePackageGroup && (
              <button
                type="button"
                onClick={onUnlinkPackage}
                disabled={packageGroupSaving}
                className="min-h-9 rounded-lg border border-red-200 px-3 text-xs font-black text-red-700 transition hover:bg-red-50 disabled:opacity-50"
              >
                Unlink
              </button>
            )}
          </div>
          {activePackageGroup && activePackageGroup.members.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {activePackageGroup.members.map((member) => (
                <span
                  key={member.id}
                  className={`rounded-lg px-2 py-1 text-xs font-bold ${
                    member.package_id === packageId
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
              value={packageGroupTransportNote}
              onChange={(event) => setPackageGroupTransportNote(event.target.value)}
              placeholder="Transport is shared with Family Hussain / PT-ABC123."
              rows={4}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-cyan-700"
            />
          </label>
          <button
            type="button"
            onClick={onSaveTransportNote}
            disabled={packageGroupSaving || !activePackageGroup}
            className="mt-3 min-h-10 rounded-lg bg-slate-900 px-3 text-sm font-black text-white transition hover:bg-black disabled:opacity-50"
          >
            Save Transport Note
          </button>
        </div>
      </div>
    </section>
  )
}
