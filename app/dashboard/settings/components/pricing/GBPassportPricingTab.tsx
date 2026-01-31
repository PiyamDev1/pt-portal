'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Trash2, Save, X, Plus } from 'lucide-react'
import { GBPassportPricing } from '@/app/types/pricing'
import { PRICING_OPTIONS } from '@/app/lib/pricingOptions'

interface GBPassportPricingTabProps {
  pricing: GBPassportPricing[]
  editingId: string | null
  editValues: Record<string, any>
  setEditingId: (id: string | null) => void
  setEditValues: (values: Record<string, any>) => void
  onEdit: (item: GBPassportPricing) => void
  onSave: () => void
  onDelete: (id: string) => void
  onAddEntry: (entry: { age_group: string; pages: string; service_type: string; cost_price: number; sale_price: number }) => Promise<void>
  supabase: any
}

export default function GBPassportPricingTab({
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
}: GBPassportPricingTabProps) {
  const [newEntry, setNewEntry] = useState({ age_group: '', pages: '', service_type: '', cost_price: 0, sale_price: 0 })

  const handleAddEntry = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newEntry.age_group.trim() || !newEntry.pages.trim() || !newEntry.service_type.trim()) {
      toast.error('All fields (Age Group, Pages, Service Type) are required')
      return
    }

    try {
      await onAddEntry(newEntry)
      setNewEntry({ age_group: '', pages: '', service_type: '', cost_price: 0, sale_price: 0 })
    } catch (error: any) {
      toast.error('Failed to add service: ' + error.message)
    }
  }

  return (
    <div className="space-y-6">
      <div className="p-4 bg-green-50 rounded-lg border border-green-200">
        <h3 className="font-semibold text-green-900 mb-4">Add New GB Passport Service Option</h3>
        <form onSubmit={handleAddEntry} className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Age Group *</label>
              <select
                value={newEntry.age_group}
                onChange={(e) => setNewEntry({ ...newEntry, age_group: e.target.value })}
                className="w-full px-3 py-2 border rounded"
              >
                <option value="">Select Age Group</option>
                {PRICING_OPTIONS.GB_PASSPORT.ageGroups.map((group) => (
                  <option key={group} value={group}>{group}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Pages *</label>
              <select
                value={newEntry.pages}
                onChange={(e) => setNewEntry({ ...newEntry, pages: e.target.value })}
                className="w-full px-3 py-2 border rounded"
              >
                <option value="">Select Pages</option>
                {PRICING_OPTIONS.GB_PASSPORT.pages.map((page) => (
                  <option key={page} value={page}>{page}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Service Type *</label>
              <select
                value={newEntry.service_type}
                onChange={(e) => setNewEntry({ ...newEntry, service_type: e.target.value })}
                className="w-full px-3 py-2 border rounded"
              >
                <option value="">Select Service Type</option>
                {PRICING_OPTIONS.GB_PASSPORT.serviceTypes.map((type) => (
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
            className="inline-flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 font-medium"
          >
            <Plus className="h-4 w-4" /> Add Service Option
          </button>
        </form>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b-2 border-gray-200 bg-gray-50">
              <th className="text-left py-3 px-4 font-semibold">Age Group</th>
              <th className="text-left py-3 px-4 font-semibold">Pages</th>
              <th className="text-left py-3 px-4 font-semibold">Service Type</th>
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
                  No GB Passport services configured yet. Add one above.
                </td>
              </tr>
            ) : (
              pricing.map((item) => (
                <tr key={item.id} className="border-b border-gray-100 hover:bg-green-50">
                  <td className="py-3 px-4">{item.age_group}</td>
                  <td className="py-3 px-4">{item.pages}</td>
                  <td className="py-3 px-4">{item.service_type}</td>
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
