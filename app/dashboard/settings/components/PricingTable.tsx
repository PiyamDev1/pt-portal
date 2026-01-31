/**
 * PricingTable Component - Reusable pricing table for all service types
 * Handles rendering, editing, and deleting pricing entries
 */

import { Trash2, Save, X } from 'lucide-react'
import type { NadraPricing, PKPassportPricing, GBPassportPricing, VisaPricing, ActiveTab } from '@/app/types/pricing'

interface PricingTableProps {
  data: any[]
  editingId: string | null
  editValues: Record<string, any>
  onEdit: (item: any) => void
  onSave: (activeTab: ActiveTab) => Promise<void>
  onDelete: (id: string, tab: ActiveTab) => Promise<void>
  onEditValueChange: (field: string, value: any) => void
  onCancelEdit: () => void
  activeTab: ActiveTab
  columns: {
    key: string
    label: string
    align?: 'left' | 'right' | 'center'
    format?: (value: any) => string
  }[]
  emptyMessage?: string
}

export const PricingTable: React.FC<PricingTableProps> = ({
  data,
  editingId,
  editValues,
  onEdit,
  onSave,
  onDelete,
  onEditValueChange,
  onCancelEdit,
  activeTab,
  columns,
  emptyMessage = 'No pricing entries found'
}) => {
  const getColumnValue = (item: any, key: string) => {
    const keys = key.split('.')
    let value = item
    for (const k of keys) {
      value = value?.[k]
    }
    return value
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead className="sticky top-0 z-10 bg-gray-50">
          <tr className="border-b-2 border-gray-200">
            {columns.map((col) => (
              <th
                key={col.key}
                scope="col"
                className={`text-${col.align || 'left'} py-3 px-4 font-semibold`}
              >
                {col.label}
              </th>
            ))}
            <th scope="col" className="text-right py-3 px-4 font-semibold">Profit</th>
            <th scope="col" className="text-center py-3 px-4 font-semibold">Actions</th>
          </tr>
        </thead>
        <tbody>
          {data.length === 0 ? (
            <tr>
              <td colSpan={columns.length + 2} className="py-8 px-4 text-center text-gray-500" role="status" aria-live="polite">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            data.map((item) => (
              <tr key={item.id} className="border-b border-gray-100 hover:bg-blue-50">
                {columns.map((col) => (
                  <td
                    key={`${item.id}-${col.key}`}
                    className={`py-3 px-4 text-${col.align || 'left'}`}
                  >
                    {editingId === item.id && col.key !== 'cost_price' && col.key !== 'sale_price' ? (
                      <span>{col.format ? col.format(getColumnValue(item, col.key)) : getColumnValue(item, col.key)}</span>
                    ) : editingId === item.id && col.key === 'cost_price' ? (
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={editValues.cost_price}
                        onChange={(e) => onEditValueChange('cost_price', e.target.value)}
                        className="w-full px-2 py-1 border rounded"
                        aria-label="Cost price"
                      />
                    ) : editingId === item.id && col.key === 'sale_price' ? (
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={editValues.sale_price}
                        onChange={(e) => onEditValueChange('sale_price', e.target.value)}
                        className="w-full px-2 py-1 border rounded"
                        aria-label="Sale price"
                      />
                    ) : col.key === 'cost_price' ? (
                      <span className="text-right">{item.cost_price.toFixed(2)}</span>
                    ) : col.key === 'sale_price' ? (
                      <span className="text-right">{item.sale_price.toFixed(2)}</span>
                    ) : (
                      <span>{col.format ? col.format(getColumnValue(item, col.key)) : getColumnValue(item, col.key)}</span>
                    )}
                  </td>
                ))}
                <td className="py-3 px-4 text-right font-medium text-green-600">
                  {editingId === item.id
                    ? (Number(editValues.sale_price) - Number(editValues.cost_price)).toFixed(2)
                    : (item.sale_price - item.cost_price).toFixed(2)}
                </td>
                <td className="py-3 px-4 text-center flex gap-2 justify-center">
                  {editingId === item.id ? (
                    <>
                      <button
                        onClick={() => onSave(activeTab)}
                        className="text-green-600 hover:text-green-900"
                        title="Save"
                        type="button"
                        aria-label="Save pricing"
                      >
                        <Save className="h-4 w-4" />
                      </button>
                      <button
                        onClick={onCancelEdit}
                        className="text-gray-600 hover:text-gray-900"
                        title="Cancel"
                        type="button"
                        aria-label="Cancel edit"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => onEdit(item)}
                        className="text-blue-600 hover:text-blue-900 font-medium text-sm"
                        type="button"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => onDelete(item.id, activeTab)}
                        className="text-red-600 hover:text-red-900"
                        title="Delete"
                        type="button"
                        aria-label="Delete pricing entry"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}
