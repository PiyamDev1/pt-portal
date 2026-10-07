type PricingEntryPriceCellsProps =
  | {
      mode: 'edit'
      costPrice: string | number | undefined
      salePrice: string | number | undefined
      onCostPriceChange: (value: string) => void
      onSalePriceChange: (value: string) => void
    }
  | {
      mode: 'display'
      costPrice: number
      salePrice: number
    }

export default function PricingEntryPriceCells(props: PricingEntryPriceCellsProps) {
  if (props.mode === 'edit') {
    const profit = Number(props.salePrice) - Number(props.costPrice)

    return (
      <>
        <td className="py-3 px-4">
          <input
            type="number"
            step="0.01"
            value={props.costPrice}
            onChange={(event) => props.onCostPriceChange(event.target.value)}
            aria-label="Cost price"
            className="w-full px-2 py-1 border rounded"
          />
        </td>
        <td className="py-3 px-4">
          <input
            type="number"
            step="0.01"
            value={props.salePrice}
            onChange={(event) => props.onSalePriceChange(event.target.value)}
            aria-label="Sale price"
            className="w-full px-2 py-1 border rounded"
          />
        </td>
        <td className="py-3 px-4 text-right text-gray-600">{profit.toFixed(2)}</td>
      </>
    )
  }

  const profit = props.salePrice - props.costPrice

  return (
    <>
      <td className="py-3 px-4 text-right">{props.costPrice.toFixed(2)}</td>
      <td className="py-3 px-4 text-right">{props.salePrice.toFixed(2)}</td>
      <td className="py-3 px-4 text-right font-medium text-green-600">{profit.toFixed(2)}</td>
    </>
  )
}
