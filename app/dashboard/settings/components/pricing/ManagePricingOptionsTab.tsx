'use client'

import { OptionListItem, OptionListInput } from './OptionListComponents'

interface ManagePricingOptionsTabProps {
  nadrServiceTypes: string[]
  setNadrServiceTypes: (types: string[]) => void
  nadrServiceOptions: string[]
  setNadrServiceOptions: (options: string[]) => void
  pkCategories: string[]
  setPKCategories: (categories: string[]) => void
  pkSpeeds: string[]
  setPKSpeeds: (speeds: string[]) => void
  pkApplicationTypes: string[]
  setPKApplicationTypes: (types: string[]) => void
  gbAgeGroups: string[]
  setGBAgeGroups: (groups: string[]) => void
  gbPages: string[]
  setGBPages: (pages: string[]) => void
  gbServiceTypes: string[]
  setGBServiceTypes: (types: string[]) => void
}

export default function ManagePricingOptionsTab({
  nadrServiceTypes,
  setNadrServiceTypes,
  nadrServiceOptions,
  setNadrServiceOptions,
  pkCategories,
  setPKCategories,
  pkSpeeds,
  setPKSpeeds,
  pkApplicationTypes,
  setPKApplicationTypes,
  gbAgeGroups,
  setGBAgeGroups,
  gbPages,
  setGBPages,
  gbServiceTypes,
  setGBServiceTypes
}: ManagePricingOptionsTabProps) {
  return (
    <div className="space-y-8">
      <div>
        <h3 className="font-semibold text-lg mb-4">NADRA Service Types</h3>
        <div className="space-y-2 mb-3">
          {nadrServiceTypes.map((type) => (
            <OptionListItem
              key={type}
              value={type}
              onDelete={() => setNadrServiceTypes(nadrServiceTypes.filter(t => t !== type))}
            />
          ))}
        </div>
        <OptionListInput
          id="new-nadra-type"
          placeholder="Add new service type"
          onAddClick={() => {
            const input = document.getElementById('new-nadra-type') as HTMLInputElement
            const value = input?.value
            if (value && !nadrServiceTypes.includes(value)) {
              setNadrServiceTypes([...nadrServiceTypes, value])
              if (input) input.value = ''
            }
          }}
        />
      </div>

      <div>
        <h3 className="font-semibold text-lg mb-4">NADRA Service Options</h3>
        <div className="space-y-2 mb-3">
          {nadrServiceOptions.map((option) => (
            <OptionListItem
              key={option}
              value={option}
              onDelete={() => setNadrServiceOptions(nadrServiceOptions.filter(o => o !== option))}
            />
          ))}
        </div>
        <OptionListInput
          id="new-nadra-option"
          placeholder="Add new service option"
          onAddClick={() => {
            const input = document.getElementById('new-nadra-option') as HTMLInputElement
            const value = input?.value
            if (value && !nadrServiceOptions.includes(value)) {
              setNadrServiceOptions([...nadrServiceOptions, value])
              if (input) input.value = ''
            }
          }}
        />
      </div>

      <div>
        <h3 className="font-semibold text-lg mb-4">Pakistani Passport Categories</h3>
        <div className="space-y-2 mb-3">
          {pkCategories.map((cat) => (
            <OptionListItem
              key={cat}
              value={cat}
              onDelete={() => setPKCategories(pkCategories.filter(c => c !== cat))}
            />
          ))}
        </div>
        <OptionListInput
          id="new-pk-category"
          placeholder="Add new category"
          onAddClick={() => {
            const input = document.getElementById('new-pk-category') as HTMLInputElement
            const value = input?.value
            if (value && !pkCategories.includes(value)) {
              setPKCategories([...pkCategories, value])
              if (input) input.value = ''
            }
          }}
        />
      </div>

      <div>
        <h3 className="font-semibold text-lg mb-4">Pakistani Passport Speeds</h3>
        <div className="space-y-2 mb-3">
          {pkSpeeds.map((speed) => (
            <OptionListItem
              key={speed}
              value={speed}
              onDelete={() => setPKSpeeds(pkSpeeds.filter(s => s !== speed))}
            />
          ))}
        </div>
        <OptionListInput
          id="new-pk-speed"
          placeholder="Add new speed"
          onAddClick={() => {
            const input = document.getElementById('new-pk-speed') as HTMLInputElement
            const value = input?.value
            if (value && !pkSpeeds.includes(value)) {
              setPKSpeeds([...pkSpeeds, value])
              if (input) input.value = ''
            }
          }}
        />
      </div>

      <div>
        <h3 className="font-semibold text-lg mb-4">Pakistani Passport Application Types</h3>
        <div className="space-y-2 mb-3">
          {pkApplicationTypes.map((type) => (
            <OptionListItem
              key={type}
              value={type}
              onDelete={() => setPKApplicationTypes(pkApplicationTypes.filter(t => t !== type))}
            />
          ))}
        </div>
        <OptionListInput
          id="new-pk-app-type"
          placeholder="Add new application type"
          onAddClick={() => {
            const input = document.getElementById('new-pk-app-type') as HTMLInputElement
            const value = input?.value
            if (value && !pkApplicationTypes.includes(value)) {
              setPKApplicationTypes([...pkApplicationTypes, value])
              if (input) input.value = ''
            }
          }}
        />
      </div>

      <div>
        <h3 className="font-semibold text-lg mb-4">GB Passport Age Groups</h3>
        <div className="space-y-2 mb-3">
          {gbAgeGroups.map((group) => (
            <OptionListItem
              key={group}
              value={group}
              onDelete={() => setGBAgeGroups(gbAgeGroups.filter(g => g !== group))}
            />
          ))}
        </div>
        <OptionListInput
          id="new-gb-age"
          placeholder="Add new age group"
          onAddClick={() => {
            const input = document.getElementById('new-gb-age') as HTMLInputElement
            const value = input?.value
            if (value && !gbAgeGroups.includes(value)) {
              setGBAgeGroups([...gbAgeGroups, value])
              if (input) input.value = ''
            }
          }}
        />
      </div>

      <div>
        <h3 className="font-semibold text-lg mb-4">GB Passport Pages</h3>
        <div className="space-y-2 mb-3">
          {gbPages.map((page) => (
            <OptionListItem
              key={page}
              value={page}
              onDelete={() => setGBPages(gbPages.filter(p => p !== page))}
            />
          ))}
        </div>
        <OptionListInput
          id="new-gb-pages"
          placeholder="Add new page count"
          onAddClick={() => {
            const input = document.getElementById('new-gb-pages') as HTMLInputElement
            const value = input?.value
            if (value && !gbPages.includes(value)) {
              setGBPages([...gbPages, value])
              if (input) input.value = ''
            }
          }}
        />
      </div>

      <div>
        <h3 className="font-semibold text-lg mb-4">GB Passport Service Types</h3>
        <div className="space-y-2 mb-3">
          {gbServiceTypes.map((type) => (
            <OptionListItem
              key={type}
              value={type}
              onDelete={() => setGBServiceTypes(gbServiceTypes.filter(t => t !== type))}
            />
          ))}
        </div>
        <OptionListInput
          id="new-gb-service-type"
          placeholder="Add new service type"
          onAddClick={() => {
            const input = document.getElementById('new-gb-service-type') as HTMLInputElement
            const value = input?.value
            if (value && !gbServiceTypes.includes(value)) {
              setGBServiceTypes([...gbServiceTypes, value])
              if (input) input.value = ''
            }
          }}
        />
      </div>

      <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded text-sm text-yellow-800">
        <strong>Note:</strong> New options will appear in the dropdown menus. You can still delete options here that are no longer used.
      </div>
    </div>
  )
}
