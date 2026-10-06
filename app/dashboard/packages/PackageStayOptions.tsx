'use client'

import { ArrowDownWideNarrow, Building2, Plus, Trash2 } from 'lucide-react'
import type {
  PackageComponentOption,
  PackageQuotePayload,
  PackageStayGroup,
} from '@/app/types/packages'
import type { UmrahTransportPricingData } from './packageTransportPricingModel'
import { OptionEditor } from './PackageOptionEditors'
import { PackageSectionHeader as SectionHeader } from './PackageSectionHeader'

export type PackageStayOptionsModel = {
  payload: Pick<PackageQuotePayload, 'packageType' | 'stayGroups'>
  stayGroupsForEditor: Array<{ group: PackageStayGroup; groupIndex: number }>
  transportPricingData: UmrahTransportPricingData | null
  createHotelOption: (groupId: string, isDefault: boolean) => PackageComponentOption
  onUpdateStayGroup: (groupIndex: number, nextGroup: PackageStayGroup) => void
  onAddHolidayLocation: () => void
  onRemoveHolidayLocation: (groupIndex: number) => void
  onSortStayGroupsByAdjustedCost: () => void
}

export function PackageStayOptions({ model }: { model: PackageStayOptionsModel }) {
  const {
    payload,
    stayGroupsForEditor,
    transportPricingData,
    createHotelOption,
    onUpdateStayGroup,
    onAddHolidayLocation,
    onRemoveHolidayLocation,
    onSortStayGroupsByAdjustedCost,
  } = model

  return (
    <section className="rounded-xl border border-violet-200 bg-violet-50/40 p-4 shadow-sm">
      <SectionHeader
        icon={Building2}
        title="Hotel and stay options"
        action={
          <div className="flex flex-wrap gap-2">
            {payload.packageType === 'holiday' && (
              <button
                type="button"
                onClick={onAddHolidayLocation}
                className="inline-flex min-h-9 items-center gap-2 rounded-lg bg-violet-900 px-3 text-xs font-black text-white transition hover:bg-violet-950"
                title="Add holiday location"
              >
                <Plus className="h-4 w-4" />
                Add location
              </button>
            )}
            <button
              type="button"
              onClick={onSortStayGroupsByAdjustedCost}
              className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-violet-200 bg-white px-3 text-xs font-black text-violet-900 transition hover:bg-violet-100"
              title="Sort hotel options by adjusted cost"
            >
              <ArrowDownWideNarrow className="h-4 w-4" />
              Sort low-high
            </button>
          </div>
        }
      />
      <div className="grid gap-4 lg:grid-cols-2">
        {stayGroupsForEditor.map(({ group, groupIndex }) => (
          <div key={group.id} className="rounded-lg border border-violet-200 bg-white p-3">
            <div className="mb-3 flex items-center gap-2">
              <input
                value={group.label}
                onChange={(event) =>
                  onUpdateStayGroup(groupIndex, { ...group, label: event.target.value })
                }
                placeholder={payload.packageType === 'holiday' ? 'Enter location' : 'Stay'}
                className="min-h-10 flex-1 rounded-lg border border-slate-200 px-3 text-sm font-black outline-none focus:border-slate-900"
              />
              {payload.packageType === 'holiday' && groupIndex === 0 && (
                <span className="rounded-lg bg-blue-100 px-2 py-2 text-[11px] font-black text-blue-800">
                  Start
                </span>
              )}
              {payload.packageType === 'holiday' && payload.stayGroups.length > 1 && (
                <button
                  type="button"
                  onClick={() => onRemoveHolidayLocation(groupIndex)}
                  className="flex h-10 w-10 items-center justify-center rounded-lg border border-red-200 bg-white text-red-600 transition hover:bg-red-50"
                  title="Remove location"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
              <button
                type="button"
                onClick={() =>
                  onUpdateStayGroup(groupIndex, {
                    ...group,
                    options: [
                      ...group.options,
                      createHotelOption(`${group.id}-hotel`, group.options.length === 0),
                    ],
                  })
                }
                className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-900 text-white transition hover:bg-black"
                title="Add hotel"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3">
              {group.options.map((option, optionIndex) => (
                <OptionEditor
                  key={option.id}
                  option={option}
                  titlePlaceholder={`${group.label} hotel`}
                  summaryPlaceholder={`${group.label} hotel summary, nights, board basis, distance`}
                  showHotelCostAudit
                  showDefaultToggle
                  defaultLabel="Preferred hotel"
                  canRemove={group.options.length > 1}
                  onChange={(next) =>
                    onUpdateStayGroup(groupIndex, {
                      ...group,
                      options: next.isDefault
                        ? group.options.map((candidate, index) => ({
                            ...(index === optionIndex ? next : candidate),
                            isDefault: index === optionIndex,
                          }))
                        : group.options.map((candidate, index) =>
                            index === optionIndex ? next : candidate,
                          ),
                    })
                  }
                  onRemove={() =>
                    onUpdateStayGroup(groupIndex, {
                      ...group,
                      options: group.options.filter((_, index) => index !== optionIndex),
                    })
                  }
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
