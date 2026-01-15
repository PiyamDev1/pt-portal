import { Box } from 'lucide-react'
import { FormInputField } from './FormInputField'
import { FormCurrencyField } from './FormCurrencyField'

interface OfficeUseSectionProps {
  appNo: string
  baseCost: number
  customerPrice: number
  isPartOfPackage: boolean
  onAppNoChange: (value: string) => void
  onBaseCostChange: (value: number) => void
  onCustomerPriceChange: (value: number) => void
  onPackageToggle: () => void
}

export function OfficeUseSection({
  appNo,
  baseCost,
  customerPrice,
  isPartOfPackage,
  onAppNoChange,
  onBaseCostChange,
  onCustomerPriceChange,
  onPackageToggle
}: OfficeUseSectionProps) {
  return (
    <div className="space-y-4">
      <h4 className="text-xs font-bold text-slate-400 uppercase">Office Use</h4>
      <div className="space-y-3">
        <FormInputField
          label="App No."
          value={appNo}
          onChange={onAppNoChange}
          placeholder="TRK-001"
          uppercase
          mono
        />
        <div className="grid grid-cols-2 gap-3">
          <FormCurrencyField
            label="Our Cost"
            value={baseCost}
            onChange={onBaseCostChange}
          />
          <FormCurrencyField
            label="Agency Price"
            value={customerPrice}
            onChange={onCustomerPriceChange}
            variant="purple"
          />
        </div>

        <div
          onClick={onPackageToggle}
          className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer border transition-all ${
            isPartOfPackage ? 'bg-purple-50 border-purple-200' : 'bg-white border-slate-200'
          }`}
        >
          <div
            className={`w-4 h-4 rounded border flex items-center justify-center ${
              isPartOfPackage ? 'bg-purple-600 border-purple-600' : 'bg-white border-slate-300'
            }`}
          >
            {isPartOfPackage && <Box className="w-3 h-3 text-white" />}
          </div>
          <span className="text-xs font-medium text-slate-700">Part of Package</span>
        </div>
      </div>
    </div>
  )
}
