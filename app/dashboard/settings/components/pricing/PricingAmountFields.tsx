interface PricingAmountFieldsProps {
  costPrice: number
  salePrice: number
  costInputId: string
  saleInputId: string
  costAriaLabel: string
  saleAriaLabel: string
  onCostPriceChange: (value: number) => void
  onSalePriceChange: (value: number) => void
}

export default function PricingAmountFields({
  costPrice,
  salePrice,
  costInputId,
  saleInputId,
  costAriaLabel,
  saleAriaLabel,
  onCostPriceChange,
  onSalePriceChange,
}: PricingAmountFieldsProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div>
        <label htmlFor={costInputId} className="block text-sm font-medium mb-1">
          Cost Price
        </label>
        <input
          id={costInputId}
          type="number"
          step="0.01"
          value={costPrice}
          onChange={(event) => onCostPriceChange(Number(event.target.value))}
          aria-label={costAriaLabel}
          className="w-full px-3 py-2 border rounded"
        />
      </div>
      <div>
        <label htmlFor={saleInputId} className="block text-sm font-medium mb-1">
          Sale Price
        </label>
        <input
          id={saleInputId}
          type="number"
          step="0.01"
          value={salePrice}
          onChange={(event) => onSalePriceChange(Number(event.target.value))}
          aria-label={saleAriaLabel}
          className="w-full px-3 py-2 border rounded"
        />
      </div>
    </div>
  )
}
