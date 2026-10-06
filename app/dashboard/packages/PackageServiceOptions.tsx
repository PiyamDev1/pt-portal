'use client'

import { Bus, FileText, Plane, Plus } from 'lucide-react'
import type {
  PackageComponentOption,
  PackageLinkedFlightGroup,
  PackageQuotePayload,
  PackageVisaPassengerCategory,
} from '@/app/types/packages'
import type { UmrahTransportPricingData } from './packageTransportPricingModel'
import { FlightOptionEditor, OptionEditor } from './PackageOptionEditors'
import { PackageSectionHeader as SectionHeader } from './PackageSectionHeader'

type PackageComponentOptionKey = 'flightOptions' | 'visaOptions' | 'transportOptions'

export type PackageServiceOptionsModel = {
  payload: Pick<
    PackageQuotePayload,
    'packageType' | 'flightOptions' | 'linkedFlightGroups' | 'visaOptions' | 'transportOptions'
  >
  transportPricingData: UmrahTransportPricingData | null
  getVisaQuantityFallback: (category: PackageVisaPassengerCategory | undefined) => number
  onAddComponentOption: (key: PackageComponentOptionKey, prefix: string) => void
  onUpdateComponentOption: (
    key: PackageComponentOptionKey,
    optionIndex: number,
    nextOption: PackageComponentOption,
  ) => void
  onRemoveComponentOption: (key: PackageComponentOptionKey, optionIndex: number) => void
  onAddLinkedFlightGroup: (baseFlightOptionId: string) => void
  onUpdateLinkedFlightGroup: (groupId: string, nextGroup: PackageLinkedFlightGroup) => void
  onRemoveLinkedFlightGroup: (groupId: string) => void
}

export function PackageServiceOptions({ model }: { model: PackageServiceOptionsModel }) {
  const {
    payload,
    transportPricingData,
    getVisaQuantityFallback,
    onAddComponentOption,
    onUpdateComponentOption,
    onRemoveComponentOption,
    onAddLinkedFlightGroup,
    onUpdateLinkedFlightGroup,
    onRemoveLinkedFlightGroup,
  } = model

  return (
    <section className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]">
      <div className="min-w-0 rounded-xl border-2 border-sky-300 bg-sky-50/50 p-4 shadow-sm">
        <SectionHeader
          icon={Plane}
          title="Flight options"
          action={
            <button
              type="button"
              onClick={() => onAddComponentOption('flightOptions', 'flight')}
              className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900 text-white transition hover:bg-black"
              title="Add flight"
            >
              <Plus className="h-4 w-4" />
            </button>
          }
        />
        <div className="space-y-3">
          {payload.flightOptions.length === 0 && (
            <p className="rounded-lg border border-dashed border-slate-300 p-3 text-sm font-semibold text-slate-500">
              No flight included. Use the plus button to add flight options.
            </p>
          )}
          {payload.flightOptions.map((option, index) => (
            <FlightOptionEditor
              key={option.id}
              option={option}
              optionIndex={index}
              linkedGroups={payload.linkedFlightGroups.filter(
                (group) => group.baseFlightOptionId === option.id,
              )}
              onChange={(next) => onUpdateComponentOption('flightOptions', index, next)}
              onRemove={() => onRemoveComponentOption('flightOptions', index)}
              onAddLinkedGroup={() => onAddLinkedFlightGroup(option.id)}
              onChangeLinkedGroup={onUpdateLinkedFlightGroup}
              onRemoveLinkedGroup={onRemoveLinkedFlightGroup}
            />
          ))}
        </div>
      </div>

      <div className="min-w-0 rounded-xl border border-emerald-200 bg-emerald-50/40 p-4 shadow-sm">
        <SectionHeader
          icon={FileText}
          title="Visa options"
          action={
            <button
              type="button"
              onClick={() => onAddComponentOption('visaOptions', 'visa')}
              className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900 text-white transition hover:bg-black"
              title="Add visa"
            >
              <Plus className="h-4 w-4" />
            </button>
          }
        />
        <div className="space-y-3">
          {payload.visaOptions.length === 0 && (
            <p className="rounded-lg border border-dashed border-slate-300 p-3 text-sm font-semibold text-slate-500">
              No visa included. Use the plus button to add visa options.
            </p>
          )}
          {payload.visaOptions.map((option, index) => (
            <OptionEditor
              key={option.id}
              option={option}
              titlePlaceholder="Visa option"
              summaryPlaceholder="ETA, tourist visa, multiple entry, insurance notes"
              priceLabel="Visa cost"
              showPricingMode
              showQuantity
              showVisaPassengerCategory
              quantityFallback={getVisaQuantityFallback(option.visaPassengerCategory)}
              canRemove
              onChange={(next) => onUpdateComponentOption('visaOptions', index, next)}
              onRemove={() => onRemoveComponentOption('visaOptions', index)}
            />
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4 shadow-sm lg:col-span-2">
        <SectionHeader
          icon={Bus}
          title="Transport options"
          action={
            <button
              type="button"
              onClick={() => onAddComponentOption('transportOptions', 'transport')}
              className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900 text-white transition hover:bg-black"
              title="Add transport"
            >
              <Plus className="h-4 w-4" />
            </button>
          }
        />
        <div className="space-y-3">
          {payload.transportOptions.length === 0 && (
            <p className="rounded-lg border border-dashed border-slate-300 p-3 text-sm font-semibold text-slate-500">
              No transport included. Use the plus button to add transport options.
            </p>
          )}
          {payload.transportOptions.map((option, index) => (
            <OptionEditor
              key={option.id}
              option={option}
              titlePlaceholder={`Option ${index + 1}`}
              fallbackTitle={`Option ${index + 1}`}
              summaryPlaceholder="Airport transfers, hotel transfers, ziyarat, vehicle type"
              priceLabel="Transport cost"
              showPricingMode
              showDefaultToggle
              defaultLabel="Preferred transport"
              showTransportExtras
              showTransportPriceList={payload.packageType !== 'holiday'}
              transportPricingData={transportPricingData}
              canRemove
              onChange={(next) => onUpdateComponentOption('transportOptions', index, next)}
              onRemove={() => onRemoveComponentOption('transportOptions', index)}
            />
          ))}
        </div>
      </div>
    </section>
  )
}
