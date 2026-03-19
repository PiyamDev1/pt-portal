'use client'

import { useCallback, useMemo } from 'react'
import { OptionListItem, OptionListInput } from './OptionListComponents'

type ManageScope = 'nadra' | 'passport' | 'gb' | 'visa'

interface ManagePricingOptionsTabProps {
  scope: ManageScope
  nadrServiceTypes: string[]
  setNadrServiceTypes: React.Dispatch<React.SetStateAction<string[]>>
  nadrServiceOptions: string[]
  setNadrServiceOptions: React.Dispatch<React.SetStateAction<string[]>>
  pkCategories: string[]
  setPKCategories: React.Dispatch<React.SetStateAction<string[]>>
  pkSpeeds: string[]
  setPKSpeeds: React.Dispatch<React.SetStateAction<string[]>>
  pkApplicationTypes: string[]
  setPKApplicationTypes: React.Dispatch<React.SetStateAction<string[]>>
  gbAgeGroups: string[]
  setGBAgeGroups: React.Dispatch<React.SetStateAction<string[]>>
  gbPages: string[]
  setGBPages: React.Dispatch<React.SetStateAction<string[]>>
  gbServiceTypes: string[]
  setGBServiceTypes: React.Dispatch<React.SetStateAction<string[]>>
}

export default function ManagePricingOptionsTab({
  scope,
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
  setGBServiceTypes,
}: ManagePricingOptionsTabProps) {
  const showNadra = scope === 'nadra'
  const showPassport = scope === 'passport'
  const showGb = scope === 'gb'

  const nadrServiceTypesSet = useMemo(() => new Set(nadrServiceTypes), [nadrServiceTypes])
  const nadrServiceOptionsSet = useMemo(() => new Set(nadrServiceOptions), [nadrServiceOptions])
  const pkCategoriesSet = useMemo(() => new Set(pkCategories), [pkCategories])
  const pkSpeedsSet = useMemo(() => new Set(pkSpeeds), [pkSpeeds])
  const pkApplicationTypesSet = useMemo(() => new Set(pkApplicationTypes), [pkApplicationTypes])
  const gbAgeGroupsSet = useMemo(() => new Set(gbAgeGroups), [gbAgeGroups])
  const gbPagesSet = useMemo(() => new Set(gbPages), [gbPages])
  const gbServiceTypesSet = useMemo(() => new Set(gbServiceTypes), [gbServiceTypes])

  const removeOption = useCallback(
    (setValues: React.Dispatch<React.SetStateAction<string[]>>, value: string) => {
      setValues((previous) => previous.filter((item) => item !== value))
    },
    [],
  )

  const addOptionFromInput = useCallback(
    (
      inputId: string,
      existingValues: Set<string>,
      setValues: React.Dispatch<React.SetStateAction<string[]>>,
    ) => {
      const input = document.getElementById(inputId) as HTMLInputElement | null
      const nextValue = input?.value.trim()

      if (!nextValue || existingValues.has(nextValue)) {
        return
      }

      setValues((previous) => [...previous, nextValue])
      if (input) input.value = ''
    },
    [],
  )

  return (
    <div className="space-y-8">
      {showNadra && (
        <div>
          <h3 className="font-semibold text-lg mb-4">NADRA Service Types</h3>
          <div className="space-y-2 mb-3">
            {nadrServiceTypes.map((type) => (
              <OptionListItem
                key={type}
                value={type}
                onDelete={() => removeOption(setNadrServiceTypes, type)}
              />
            ))}
          </div>
          <OptionListInput
            id="new-nadra-type"
            placeholder="Add new service type"
            onAddClick={() =>
              addOptionFromInput('new-nadra-type', nadrServiceTypesSet, setNadrServiceTypes)
            }
          />
        </div>
      )}

      {showNadra && (
        <div>
          <h3 className="font-semibold text-lg mb-4">NADRA Service Options</h3>
          <div className="space-y-2 mb-3">
            {nadrServiceOptions.map((option) => (
              <OptionListItem
                key={option}
                value={option}
                onDelete={() => removeOption(setNadrServiceOptions, option)}
              />
            ))}
          </div>
          <OptionListInput
            id="new-nadra-option"
            placeholder="Add new service option"
            onAddClick={() =>
              addOptionFromInput('new-nadra-option', nadrServiceOptionsSet, setNadrServiceOptions)
            }
          />
        </div>
      )}

      {showPassport && (
        <div>
          <h3 className="font-semibold text-lg mb-4">Pakistani Passport Categories</h3>
          <div className="space-y-2 mb-3">
            {pkCategories.map((cat) => (
              <OptionListItem
                key={cat}
                value={cat}
                onDelete={() => removeOption(setPKCategories, cat)}
              />
            ))}
          </div>
          <OptionListInput
            id="new-pk-category"
            placeholder="Add new category"
            onAddClick={() =>
              addOptionFromInput('new-pk-category', pkCategoriesSet, setPKCategories)
            }
          />
        </div>
      )}

      {showPassport && (
        <div>
          <h3 className="font-semibold text-lg mb-4">Pakistani Passport Speeds</h3>
          <div className="space-y-2 mb-3">
            {pkSpeeds.map((speed) => (
              <OptionListItem
                key={speed}
                value={speed}
                onDelete={() => removeOption(setPKSpeeds, speed)}
              />
            ))}
          </div>
          <OptionListInput
            id="new-pk-speed"
            placeholder="Add new speed"
            onAddClick={() => addOptionFromInput('new-pk-speed', pkSpeedsSet, setPKSpeeds)}
          />
        </div>
      )}

      {showPassport && (
        <div>
          <h3 className="font-semibold text-lg mb-4">Pakistani Passport Application Types</h3>
          <div className="space-y-2 mb-3">
            {pkApplicationTypes.map((type) => (
              <OptionListItem
                key={type}
                value={type}
                onDelete={() => removeOption(setPKApplicationTypes, type)}
              />
            ))}
          </div>
          <OptionListInput
            id="new-pk-app-type"
            placeholder="Add new application type"
            onAddClick={() =>
              addOptionFromInput('new-pk-app-type', pkApplicationTypesSet, setPKApplicationTypes)
            }
          />
        </div>
      )}

      {showGb && (
        <div>
          <h3 className="font-semibold text-lg mb-4">GB Passport Age Groups</h3>
          <div className="space-y-2 mb-3">
            {gbAgeGroups.map((group) => (
              <OptionListItem
                key={group}
                value={group}
                onDelete={() => removeOption(setGBAgeGroups, group)}
              />
            ))}
          </div>
          <OptionListInput
            id="new-gb-age"
            placeholder="Add new age group"
            onAddClick={() => addOptionFromInput('new-gb-age', gbAgeGroupsSet, setGBAgeGroups)}
          />
        </div>
      )}

      {showGb && (
        <div>
          <h3 className="font-semibold text-lg mb-4">GB Passport Pages</h3>
          <div className="space-y-2 mb-3">
            {gbPages.map((page) => (
              <OptionListItem
                key={page}
                value={page}
                onDelete={() => removeOption(setGBPages, page)}
              />
            ))}
          </div>
          <OptionListInput
            id="new-gb-pages"
            placeholder="Add new page count"
            onAddClick={() => addOptionFromInput('new-gb-pages', gbPagesSet, setGBPages)}
          />
        </div>
      )}

      {showGb && (
        <div>
          <h3 className="font-semibold text-lg mb-4">GB Passport Service Types</h3>
          <div className="space-y-2 mb-3">
            {gbServiceTypes.map((type) => (
              <OptionListItem
                key={type}
                value={type}
                onDelete={() => removeOption(setGBServiceTypes, type)}
              />
            ))}
          </div>
          <OptionListInput
            id="new-gb-service-type"
            placeholder="Add new service type"
            onAddClick={() =>
              addOptionFromInput('new-gb-service-type', gbServiceTypesSet, setGBServiceTypes)
            }
          />
        </div>
      )}

      {(showNadra || showPassport || showGb) && (
        <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded text-sm text-yellow-800">
          <strong>Note:</strong> New options will appear in the dropdown menus. You can still delete
          options here that are no longer used.
        </div>
      )}
    </div>
  )
}
