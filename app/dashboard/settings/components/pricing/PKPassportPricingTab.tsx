'use client'

import { useState, memo } from 'react'
import { toast } from 'sonner'
import { Trash2, Save, X, Plus } from 'lucide-react'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { PKPassportPricing, PricingEditValues } from '@/app/types/pricing'
import { PRICING_OPTIONS } from '@/app/lib/pricingOptions'

interface PKPassportPricingTabProps {
  pricing: PKPassportPricing[]
  editingId: string | null
  editValues: PricingEditValues
  setEditingId: (id: string | null) => void
  setEditValues: (values: PricingEditValues) => void
  onEdit: (item: PKPassportPricing) => void
  onSave: () => void
  onDelete: (id: string) => void
  onAddEntry: (entry: { category: string; speed: string; application_type: string; cost_price: number; sale_price: number }) => Promise<void>
  supabase: SupabaseClient
}

function PKPassportPricingTabCore({
  pricing,
  editingId,
  editValues,
  setEditingId,
  setEditValues,
  onEdit,
  onSave,
  onDelete,
  onAddEntry,
  supabase
}: PKPassportPricingTabProps) {
  const [newEntry, setNewEntry] = useState({ category: '', speed: '', application_type: '', cost_price: 0, sale_price: 0 })

  const handleAddEntry = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newEntry.category.trim() || !newEntry.speed.trim() || !newEntry.application_type.trim()) {
      toast.error('All fields (Category, Speed, Application Type) are required')
      return
    }

    try {
      await onAddEntry(newEntry)
      setNewEntry({ category: '', speed: '', application_type: '', cost_price: 0, sale_price: 0 })
    } catch (error: any) {
      toast.error('Failed to add service: ' + error.message)
    }
  }

  return (
    <div className="space-y-6">
      <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
        <h3 className="font-semibold text-blue-900 mb-4">Add New Pakistani Passport Service Option</h3>
        <form onSubmit={handleAddEntry} className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Category *</label>
              <select
                value={newEntry.category}
                onChange={(e) => setNewEntry({ ...newEntry, category: e.target.value })}
                className="w-full px-3 py-2 border rounded"
              >
                <option value="">Select Category</option>
                {PRICING_OPTIONS.PK_PASSPORT.categories.map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Speed *</label>
              <select
                value={newEntry.speed}
                onChange={(e) => setNewEntry({ ...newEntry, speed: e.target.value })}
                className="w-full px-3 py-2 border rounded"
              >
                <option value="">Select Speed</option>
                {PRICING_OPTIONS.PK_PASSPORT.speeds.map((speed) => (
                  <option key={speed} value={speed}>{speed}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Application Type *</label>
              <select
                value={newEntry.application_type}
                onChange={(e) => setNewEntry({ ...newEntry, application_type: e.target.value })}
                className="w-full px-3 py-2 border rounded"
              >
                <option value="">Select Application Type</option>
                {PRICING_OPTIONS.PK_PASSPORT.applicationTypes.map((type) => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Cost Price</label>
              <input
                type="number"
                step="0.01"
                value={newEntry.cost_price}
                onChange={(e) => setNewEntry({ ...newEntry, cost_price: Number(e.target.value) })}
                className="w-full px-3 py-2 border rounded"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Sale Price</label>
              <input
                type="number"
                step="0.01"
                value={newEntry.sale_price}
                onChange={(e) => setNewEntry({ ...newEntry, sale_price: Number(e.target.value) })}
                className="w-full px-3 py-2 border rounded"
              />
            </div>
          </div>
          <button
            type="submit"
            className="inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 font-medium"
          >
            <Plus className="h-4 w-4" /> Add Service Option
          </button>
        </form>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b-2 border-gray-200 bg-gray-50">
              <th className="text-left py-3 px-4 font-semibold">Category</th>
              <th className="text-left py-3 px-4 font-semibold">Speed</th>
              <th className="text-left py-3 px-4 font-semibold">Application Type</th>
              <th className="text-right py-3 px-4 font-semibold">Cost Price</th>
              <th className="text-right py-3 px-4 font-semibold">Sale Price</th>
              <th className="text-right py-3 px-4 font-semibold">Profit</th>
              <th className="text-center py-3 px-4 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {pricing.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-8 px-4 text-center text-gray-500">
                  No Pakistani Passport services configured yet. Add one above.
                </td>
              </tr>
            ) : (
              pricing.map((item) => (
                <tr key={item.id} className="border-b border-gray-100 hover:bg-green-50">
                  <td className="py-3 px-4">{item.category}</td>
                  <td className="py-3 px-4">{item.speed}</td>
                  <td className="py-3 px-4">{item.application_type}</td>
                  {editingId === item.id ? (
                    <>
                      <td className="py-3 px-4">
                        <input
                          type="number"
                          step="0.01"
                          value={editValues.cost_price}
                          onChange={(e) => setEditValues({ ...editValues, cost_price: e.target.value })}
                          className="w-full px-2 py-1 border rounded"
                        />
                      </td>
                      <td className="py-3 px-4">
                        <input
                          type="number"
                          step="0.01"
                          value={editValues.sale_price}
                          onChange={(e) => setEditValues({ ...editValues, sale_price: e.target.value })}
                          className="w-full px-2 py-1 border rounded"
                        />
                      </td>
                      <td className="py-3 px-4 text-right text-gray-600">
                        {(Number(editValues.sale_price) - Number(editValues.cost_price)).toFixed(2)}
                      </td>
                      <td className="py-3 px-4 text-center flex gap-2 justify-center">
                        <button
                          onClick={onSave}
                          className="text-green-600 hover:text-green-900"
                          title="Save"
                        >
                          <Save className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="text-gray-600 hover:text-gray-900"
                          title="Cancel"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="py-3 px-4 text-right">{item.cost_price.toFixed(2)}</td>
                      <td className="py-3 px-4 text-right">{item.sale_price.toFixed(2)}</td>
                      <td className="py-3 px-4 text-right font-medium text-green-600">
                        {(item.sale_price - item.cost_price).toFixed(2)}
                      </td>
                      <td className="py-3 px-4 text-center flex gap-2 justify-center">
                        <button
                          onClick={() => onEdit(item)}
                          className="text-blue-600 hover:text-blue-900 font-medium text-sm"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => onDelete(item.id)}
                          className="text-red-600 hover:text-red-900"
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default memo(PKPassportPricingTabCore)
