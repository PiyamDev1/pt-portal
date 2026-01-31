'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Trash2, Save, X, AlertCircle, Plus } from 'lucide-react'

interface ServicePricingTabProps {
  supabase: any
  loading: boolean
  setLoading: (loading: boolean) => void
}

interface NadraPricing {
  id: string
  service_type: string
  service_option: string | null
  cost_price: number
  sale_price: number
  is_active: boolean
  notes: string | null
}

interface PKPassportPricing {
  id: string
  category: string
  speed: string
  application_type: string
  cost_price: number
  sale_price: number
  is_active: boolean
  notes: string | null
}

export default function ServicePricingTab({ supabase, loading, setLoading }: ServicePricingTabProps) {
  const [nadraPricing, setNadraPricing] = useState<NadraPricing[]>([])
  const [pkPassPricing, setPKPassPricing] = useState<PKPassportPricing[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValues, setEditValues] = useState<Record<string, any>>({})
  const [activeTab, setActiveTab] = useState<'nadra' | 'passport'>('nadra')
  const [setupRequired, setSetupRequired] = useState(false)

  // Form state for adding new entries
  const [newNadraEntry, setNewNadraEntry] = useState({ service_type: '', service_option: '', cost_price: 0, sale_price: 0 })
  const [newPKEntry, setNewPKEntry] = useState({ category: '', speed: '', application_type: '', cost_price: 0, sale_price: 0 })

  const fetchPricing = async () => {
    try {
      const { data: nadraPricingData, error: nadraErr } = await supabase
        .from('nadra_pricing')
        .select('*')
        .order('service_type', { ascending: true })
        .order('service_option', { ascending: true })
      
      if (!nadraErr && nadraPricingData) {
        setNadraPricing(nadraPricingData)
      } else if (nadraErr?.code === 'PGRST116') {
        setSetupRequired(true)
      }

      const { data: pkPricingData, error: pkErr } = await supabase
        .from('pk_passport_pricing')
        .select('*')
        .order('category', { ascending: true })
        .order('speed', { ascending: true })
        .order('application_type', { ascending: true })
      
      if (!pkErr && pkPricingData) {
        setPKPassPricing(pkPricingData)
      }
    } catch (error: any) {
      console.error('Error fetching pricing:', error)
      toast.error('Failed to load pricing data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    setLoading(true)
    fetchPricing()
  }, [])

  const handleEdit = (item: any) => {
    setEditingId(item.id)
    setEditValues({ ...item })
  }

  const handleAddNadraEntry = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newNadraEntry.service_type.trim()) {
      toast.error('Service type is required')
      return
    }

    try {
      const { error } = await supabase.from('nadra_pricing').insert({
        service_type: newNadraEntry.service_type.trim(),
        service_option: newNadraEntry.service_option?.trim() || null,
        cost_price: Number(newNadraEntry.cost_price) || 0,
        sale_price: Number(newNadraEntry.sale_price) || 0,
        is_active: true
      })
      if (error) throw error
      
      toast.success('Service option added')
      setNewNadraEntry({ service_type: '', service_option: '', cost_price: 0, sale_price: 0 })
      await fetchPricing()
    } catch (error: any) {
      toast.error('Failed to add service: ' + error.message)
    }
  }

  const handleAddPKEntry = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newPKEntry.category.trim() || !newPKEntry.speed.trim() || !newPKEntry.application_type.trim()) {
      toast.error('Category, Speed, and Application Type are required')
      return
    }

    try {
      const { error } = await supabase.from('pk_passport_pricing').insert({
        category: newPKEntry.category.trim(),
        speed: newPKEntry.speed.trim(),
        application_type: newPKEntry.application_type.trim(),
        cost_price: Number(newPKEntry.cost_price) || 0,
        sale_price: Number(newPKEntry.sale_price) || 0,
        is_active: true
      })
      if (error) throw error
      
      toast.success('Service option added')
      setNewPKEntry({ category: '', speed: '', application_type: '', cost_price: 0, sale_price: 0 })
      await fetchPricing()
    } catch (error: any) {
      toast.error('Failed to add service: ' + error.message)
    }
  }

  const handleSave = async () => {
    if (!editingId) return
    if (setupRequired) {
      toast.error('Please set up the database tables first')
      return
    }

    try {
      if (activeTab === 'nadra') {
        const { error } = await supabase
          .from('nadra_pricing')
          .update({
            cost_price: Number(editValues.cost_price) || 0,
            sale_price: Number(editValues.sale_price) || 0,
            is_active: editValues.is_active,
            notes: editValues.notes || null
          })
          .eq('id', editingId)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('pk_passport_pricing')
          .update({
            cost_price: Number(editValues.cost_price) || 0,
            sale_price: Number(editValues.sale_price) || 0,
            is_active: editValues.is_active,
            notes: editValues.notes || null
          })
          .eq('id', editingId)
        if (error) throw error
      }

      toast.success('Pricing saved successfully')
      setEditingId(null)
      await fetchPricing()
    } catch (error: any) {
      toast.error('Failed to save pricing: ' + error.message)
    }
  }

  const handleDelete = async (id: string, serviceType: 'nadra' | 'passport') => {
    if (!id) return
    
    if (!confirm('Delete this pricing entry?')) return

    try {
      const table = serviceType === 'nadra' ? 'nadra_pricing' : 'pk_passport_pricing'
      const { error } = await supabase.from(table).delete().eq('id', id)
      if (error) throw error
      
      toast.success('Pricing deleted')
      await fetchPricing()
    } catch (error: any) {
      toast.error('Failed to delete: ' + error.message)
    }
  }

  if (loading) {
    return <div className="p-6 text-center">Loading pricing options...</div>
  }

  if (setupRequired) {
    return (
      <div className="p-6">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <h3 className="font-semibold text-yellow-900 mb-2">Database Setup Required</h3>
            <p className="text-sm text-yellow-800 mb-4">The pricing tables don't exist yet. Run the SQL from scripts/create-pricing-tables.sql in your Supabase project SQL Editor.</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold mb-4">Service Pricing Management</h2>
        <p className="text-gray-600 mb-4">Add and manage service pricing options. Configure what services you offer and their costs.</p>
        
        <div className="flex gap-2 border-b">
          <button
            onClick={() => setActiveTab('nadra')}
            className={`px-4 py-2 font-medium transition-colors ${
              activeTab === 'nadra'
                ? 'border-b-2 border-blue-600 text-blue-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            NADRA Services
          </button>
          <button
            onClick={() => setActiveTab('passport')}
            className={`px-4 py-2 font-medium transition-colors ${
              activeTab === 'passport'
                ? 'border-b-2 border-blue-600 text-blue-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Pakistani Passport
          </button>
        </div>
      </div>

      {/* NADRA Tab */}
      {activeTab === 'nadra' && (
        <div className="space-y-6">
          {/* Add New Entry Form */}
          <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
            <h3 className="font-semibold text-blue-900 mb-4">Add New NADRA Service Option</h3>
            <form onSubmit={handleAddNadraEntry} className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Service Type *</label>
                  <input
                    type="text"
                    placeholder="e.g., NICOP/CNIC, POC, FRC, CRC"
                    value={newNadraEntry.service_type}
                    onChange={(e) => setNewNadraEntry({ ...newNadraEntry, service_type: e.target.value })}
                    className="w-full px-3 py-2 border rounded"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Service Option</label>
                  <input
                    type="text"
                    placeholder="e.g., Normal, Executive, Cancellation"
                    value={newNadraEntry.service_option}
                    onChange={(e) => setNewNadraEntry({ ...newNadraEntry, service_option: e.target.value })}
                    className="w-full px-3 py-2 border rounded"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Cost Price</label>
                  <input
                    type="number"
                    step="0.01"
                    value={newNadraEntry.cost_price}
                    onChange={(e) => setNewNadraEntry({ ...newNadraEntry, cost_price: Number(e.target.value) })}
                    className="w-full px-3 py-2 border rounded"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Sale Price</label>
                  <input
                    type="number"
                    step="0.01"
                    value={newNadraEntry.sale_price}
                    onChange={(e) => setNewNadraEntry({ ...newNadraEntry, sale_price: Number(e.target.value) })}
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

          {/* Existing Entries Table */}
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b-2 border-gray-200 bg-gray-50">
                  <th className="text-left py-3 px-4 font-semibold">Service Type</th>
                  <th className="text-left py-3 px-4 font-semibold">Service Option</th>
                  <th className="text-right py-3 px-4 font-semibold">Cost Price</th>
                  <th className="text-right py-3 px-4 font-semibold">Sale Price</th>
                  <th className="text-right py-3 px-4 font-semibold">Profit</th>
                  <th className="text-center py-3 px-4 font-semibold">Active</th>
                  <th className="text-center py-3 px-4 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {nadraPricing.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 px-4 text-center text-gray-500">
                      No NADRA services configured yet. Add one above.
                    </td>
                  </tr>
                ) : (
                  nadraPricing.map((item) => (
                    <tr key={item.id} className="border-b border-gray-100 hover:bg-blue-50">
                      <td className="py-3 px-4">{item.service_type}</td>
                      <td className="py-3 px-4">{item.service_option || '-'}</td>
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
                          <td className="py-3 px-4 text-center">
                            <input
                              type="checkbox"
                              checked={editValues.is_active}
                              onChange={(e) => setEditValues({ ...editValues, is_active: e.target.checked })}
                              className="w-4 h-4"
                            />
                          </td>
                          <td className="py-3 px-4 text-center flex gap-2 justify-center">
                            <button
                              onClick={handleSave}
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
                          <td className="py-3 px-4 text-center">
                            <span className={item.is_active ? 'text-green-600 font-medium' : 'text-gray-400'}>
                              {item.is_active ? '✓' : '✗'}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center flex gap-2 justify-center">
                            <button
                              onClick={() => handleEdit(item)}
                              className="text-blue-600 hover:text-blue-900 font-medium text-sm"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleDelete(item.id, 'nadra')}
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
      )}

      {/* Pakistani Passport Tab */}
      {activeTab === 'passport' && (
        <div className="space-y-6">
          {/* Add New Entry Form */}
          <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
            <h3 className="font-semibold text-blue-900 mb-4">Add New Pakistani Passport Service Option</h3>
            <form onSubmit={handleAddPKEntry} className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Category *</label>
                  <input
                    type="text"
                    placeholder="e.g., Child 5 Year, Adult 10 Year, Normal"
                    value={newPKEntry.category}
                    onChange={(e) => setNewPKEntry({ ...newPKEntry, category: e.target.value })}
                    className="w-full px-3 py-2 border rounded"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Speed *</label>
                  <input
                    type="text"
                    placeholder="e.g., Executive, Normal, Express"
                    value={newPKEntry.speed}
                    onChange={(e) => setNewPKEntry({ ...newPKEntry, speed: e.target.value })}
                    className="w-full px-3 py-2 border rounded"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Application Type *</label>
                  <input
                    type="text"
                    placeholder="e.g., First Time, Renewal, Replacement"
                    value={newPKEntry.application_type}
                    onChange={(e) => setNewPKEntry({ ...newPKEntry, application_type: e.target.value })}
                    className="w-full px-3 py-2 border rounded"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Cost Price</label>
                  <input
                    type="number"
                    step="0.01"
                    value={newPKEntry.cost_price}
                    onChange={(e) => setNewPKEntry({ ...newPKEntry, cost_price: Number(e.target.value) })}
                    className="w-full px-3 py-2 border rounded"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Sale Price</label>
                  <input
                    type="number"
                    step="0.01"
                    value={newPKEntry.sale_price}
                    onChange={(e) => setNewPKEntry({ ...newPKEntry, sale_price: Number(e.target.value) })}
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

          {/* Existing Entries Table */}
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
                  <th className="text-center py-3 px-4 font-semibold">Active</th>
                  <th className="text-center py-3 px-4 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pkPassPricing.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 px-4 text-center text-gray-500">
                      No Pakistani Passport services configured yet. Add one above.
                    </td>
                  </tr>
                ) : (
                  pkPassPricing.map((item) => (
                    <tr key={item.id} className="border-b border-gray-100 hover:bg-blue-50">
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
                          <td className="py-3 px-4 text-center">
                            <input
                              type="checkbox"
                              checked={editValues.is_active}
                              onChange={(e) => setEditValues({ ...editValues, is_active: e.target.checked })}
                              className="w-4 h-4"
                            />
                          </td>
                          <td className="py-3 px-4 text-center flex gap-2 justify-center">
                            <button
                              onClick={handleSave}
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
                          <td className="py-3 px-4 text-center">
                            <span className={item.is_active ? 'text-green-600 font-medium' : 'text-gray-400'}>
                              {item.is_active ? '✓' : '✗'}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center flex gap-2 justify-center">
                            <button
                              onClick={() => handleEdit(item)}
                              className="text-blue-600 hover:text-blue-900 font-medium text-sm"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleDelete(item.id, 'passport')}
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
      )}
    </div>
  )
}
