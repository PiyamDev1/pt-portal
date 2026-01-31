'use client'

import { useState, memo } from 'react'
import { toast } from 'sonner'
import { Trash2, Save, X, Plus } from 'lucide-react'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { VisaPricing, PricingEditValues } from '@/app/types/pricing'

interface VisaPricingTabProps {
  pricing: VisaPricing[]
  editingId: string | null
  editValues: PricingEditValues
  setEditingId: (id: string | null) => void
  setEditValues: (values: PricingEditValues) => void
  onEdit: (item: VisaPricing) => void
  onSave: () => void
  onDelete: (id: string) => void
  onAddEntry: (entry: { country: string; visa_type: string; cost_price: number; sale_price: number }) => Promise<void>
  supabase: SupabaseClient
}

const VISA_TYPES = ['Tourist', 'Business', 'Student', 'Work']

function VisaPricingTabCore({
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
}: VisaPricingTabProps) {
  const [newEntry, setNewEntry] = useState({ country: '', visa_type: '', cost_price: 0, sale_price: 0 })

  const handleAddEntry = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newEntry.country.trim() || !newEntry.visa_type.trim()) {
      toast.error('All fields (Country, Visa Type) are required')
      return
    }

    try {
      await onAddEntry(newEntry)
      setNewEntry({ country: '', visa_type: '', cost_price: 0, sale_price: 0 })
    } catch (error: any) {
      console.error('[VisaPricingTab] Error adding visa pricing:', error)
      toast.error('Failed to add visa pricing. Please try again or contact support.')
    }
  }

  return (
    <div className="space-y-6">
      <div className="p-4 bg-purple-50 rounded-lg border border-purple-200">
        <h3 className="font-semibold text-purple-900 mb-4">Add New Visa Pricing</h3>
        <form onSubmit={handleAddEntry} className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="visa-country" className="block text-sm font-medium mb-1">Country *</label>
              <input
                id="visa-country"
                type="text"
                placeholder="Enter country name"
                value={newEntry.country}
                onChange={(e) => setNewEntry({ ...newEntry, country: e.target.value })}
                aria-label="Enter country name for visa pricing"
                className="w-full px-3 py-2 border rounded"
              />
            </div>
            <div>
              <label htmlFor="visa-type" className="block text-sm font-medium mb-1">Visa Type *</label>
              <select
                id="visa-type"
                value={newEntry.visa_type}
                onChange={(e) => setNewEntry({ ...newEntry, visa_type: e.target.value })}
                aria-label="Select visa type"
                className="w-full px-3 py-2 border rounded"
              >
                <option value="">Select Visa Type</option>
                {VISA_TYPES.map((type) => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="visa-cost-price" className="block text-sm font-medium mb-1">Cost Price</label>
              <input
                id="visa-cost-price"
                type="number"
                step="0.01"
                value={newEntry.cost_price}
                onChange={(e) => setNewEntry({ ...newEntry, cost_price: Number(e.target.value) })}
                aria-label="Enter cost price for visa"
                className="w-full px-3 py-2 border rounded"
              />
            </div>
            <div>
              <label htmlFor="visa-sale-price" className="block text-sm font-medium mb-1">Sale Price</label>
              <input
                id="visa-sale-price"
                type="number"
                step="0.01"
                value={newEntry.sale_price}
                onChange={(e) => setNewEntry({ ...newEntry, sale_price: Number(e.target.value) })}
                aria-label="Enter sale price for visa"
                className="w-full px-3 py-2 border rounded"
              />
            </div>
          </div>
          <button
            type="submit"
            aria-label="Add new visa pricing entry"
            className="inline-flex items-center gap-2 bg-purple-600 text-white px-4 py-2 rounded hover:bg-purple-700 font-medium"
          >
            <Plus className="h-4 w-4" /> Add Visa Pricing
          </button>
        </form>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b-2 border-gray-200 bg-gray-50">
              <th className="text-left py-3 px-4 font-semibold">Country</th>
              <th className="text-left py-3 px-4 font-semibold">Visa Type</th>
              <th className="text-right py-3 px-4 font-semibold">Cost Price</th>
              <th className="text-right py-3 px-4 font-semibold">Sale Price</th>
              <th className="text-right py-3 px-4 font-semibold">Profit</th>
              <th className="text-center py-3 px-4 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {pricing.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-8 px-4 text-center text-gray-500">
                  No visa pricing configured yet. Add one above.
                </td>
              </tr>
            ) : (
              pricing.map((item) => (
                <tr key={item.id} className="border-b border-gray-100 hover:bg-purple-50">
                  <td className="py-3 px-4">{item.country}</td>
                  <td className="py-3 px-4">{item.visa_type}</td>
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

export default memo(VisaPricingTabCore)
