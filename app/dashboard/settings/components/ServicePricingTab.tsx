'use client'

import { useEffect, useState, useMemo } from 'react'
import { toast } from 'sonner'
import { Copy, Trash2, Save, X, AlertCircle } from 'lucide-react'

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

interface NadraService {
  service_type: string
  service_option?: string
}

interface PKPassportService {
  category: string
  speed: string
  application_type: string
}

export default function ServicePricingTab({ supabase, loading, setLoading }: ServicePricingTabProps) {
  const [nadraServices, setNadraServices] = useState<NadraService[]>([])
  const [pkPassServices, setPKPassServices] = useState<PKPassportService[]>([])
  const [nadraPricing, setNadraPricing] = useState<NadraPricing[]>([])
  const [pkPassPricing, setPKPassPricing] = useState<PKPassportPricing[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValues, setEditValues] = useState<Record<string, any>>({})
  const [activeTab, setActiveTab] = useState<'nadra' | 'passport'>('nadra')
  const [setupRequired, setSetupRequired] = useState(false)

  const fetchServices = async () => {
    try {
      // Fetch NADRA services
      const { data: nadraData } = await supabase
        .from('nadra_services')
        .select('service_type')
        .limit(1000)
      
      if (nadraData) {
        const nadraOptions = await supabase
          .from('nicop_cnic_details')
          .select('service_option')
          .limit(1000)
        
        const nadraUniqueServices: NadraService[] = []
        const serviceTypeSet = new Set<string>()
        
        nadraData.forEach((item: any) => {
          if (item.service_type && !serviceTypeSet.has(item.service_type)) {
            serviceTypeSet.add(item.service_type)
            // For NICOP/CNIC, get distinct options
            if (nadraOptions.data) {
              const uniqueOptions = [...new Set(nadraOptions.data.map((d: any) => d.service_option))]
              uniqueOptions.forEach(opt => {
                nadraUniqueServices.push({
                  service_type: item.service_type,
                   service_option: opt as string | undefined
                })
              })
            }
          }
        })
        
        setNadraServices(nadraUniqueServices.length > 0 ? nadraUniqueServices : [{ service_type: 'NICOP/CNIC', service_option: 'Normal' }])
      }

      // Fetch PK Passport services (distinct combinations)
      const { data: pkData } = await supabase
        .from('pakistani_passport_applications')
        .select('category, speed, application_type')
        .limit(1000)
      
      if (pkData && pkData.length > 0) {
        const uniqueServices = new Map<string, PKPassportService>()
        pkData.forEach((item: any) => {
          const key = `${item.category}|${item.speed}|${item.application_type}`
          if (!uniqueServices.has(key)) {
            uniqueServices.set(key, {
              category: item.category,
              speed: item.speed,
              application_type: item.application_type
            })
          }
        })
        setPKPassServices(Array.from(uniqueServices.values()))
      }

      // Fetch existing pricing
      await fetchPricing()
    } catch (error: any) {
      console.error('Error fetching services:', error)
      if (error.code === 'PGRST116' || error.message?.includes('relation')) {
        setSetupRequired(true)
      } else {
        toast.error('Failed to load services')
      }
    } finally {
      setLoading(false)
    }
  }

  const fetchPricing = async () => {
    try {
      // Fetch NADRA pricing
      const { data: nadraPricingData, error: nadraErr } = await supabase
        .from('nadra_pricing')
        .select('*')
      
      if (!nadraErr && nadraPricingData) {
        setNadraPricing(nadraPricingData)
      } else if (nadraErr?.code === 'PGRST116') {
        setSetupRequired(true)
      }

      // Fetch PK Passport pricing
      const { data: pkPricingData, error: pkErr } = await supabase
        .from('pk_passport_pricing')
        .select('*')
      
      if (!pkErr && pkPricingData) {
        setPKPassPricing(pkPricingData)
      }
    } catch (error) {
      console.error('Error fetching pricing:', error)
    }
  }

  useEffect(() => {
    setLoading(true)
    fetchServices()
  }, [])

  // Match pricing to services and fill gaps
  const nadraWithPricing = useMemo(() => {
    return nadraServices.map(service => {
      const existing = nadraPricing.find(
        p => p.service_type === service.service_type && p.service_option === service.service_option
      )
      return existing || {
        id: '',
        service_type: service.service_type,
        service_option: service.service_option,
        cost_price: 0,
        sale_price: 0,
        is_active: true,
        notes: null
      }
    })
  }, [nadraServices, nadraPricing])

  const pkPassWithPricing = useMemo(() => {
    return pkPassServices.map(service => {
      const existing = pkPassPricing.find(
        p => p.category === service.category && p.speed === service.speed && p.application_type === service.application_type
      )
      return existing || {
        id: '',
        category: service.category,
        speed: service.speed,
        application_type: service.application_type,
        cost_price: 0,
        sale_price: 0,
        is_active: true,
        notes: null
      }
    })
  }, [pkPassServices, pkPassPricing])

  const handleEdit = (item: any) => {
    setEditingId(item.id || `new-${Date.now()}`)
    setEditValues({ ...item })
  }

  const handleSave = async () => {
    if (!editingId) return
    if (setupRequired) {
      toast.error('Please set up the database tables first')
      return
    }

    try {
      const { cost_price, sale_price } = editValues
      
      if (activeTab === 'nadra') {
        const { service_type, service_option } = editValues
        
        if (editingId.startsWith('new-')) {
          // Insert new
          const { error } = await supabase.from('nadra_pricing').insert({
            service_type,
            service_option,
            cost_price: Number(cost_price) || 0,
            sale_price: Number(sale_price) || 0,
            is_active: editValues.is_active
          })
          if (error) throw error
        } else {
          // Update existing
          const { error } = await supabase
            .from('nadra_pricing')
            .update({
              cost_price: Number(cost_price) || 0,
              sale_price: Number(sale_price) || 0,
              is_active: editValues.is_active,
              notes: editValues.notes || null
            })
            .eq('id', editingId)
          if (error) throw error
        }
      } else {
        const { category, speed, application_type } = editValues
        
        if (editingId.startsWith('new-')) {
          // Insert new
          const { error } = await supabase.from('pk_passport_pricing').insert({
            category,
            speed,
            application_type,
            cost_price: Number(cost_price) || 0,
            sale_price: Number(sale_price) || 0,
            is_active: editValues.is_active
          })
          if (error) throw error
        } else {
          // Update existing
          const { error } = await supabase
            .from('pk_passport_pricing')
            .update({
              cost_price: Number(cost_price) || 0,
              sale_price: Number(sale_price) || 0,
              is_active: editValues.is_active,
              notes: editValues.notes || null
            })
            .eq('id', editingId)
          if (error) throw error
        }
      }

      toast.success('Pricing saved successfully')
      setEditingId(null)
      await fetchPricing()
    } catch (error: any) {
      toast.error('Failed to save pricing: ' + error.message)
    }
  }

  const handleDelete = async (id: string, serviceType: 'nadra' | 'passport') => {
    if (!id || id.startsWith('new-')) return
    
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

  const handleCopySql = async () => {
    const sql = `-- Copy this SQL and run it in your Supabase SQL Editor
CREATE TABLE IF NOT EXISTS public.nadra_pricing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_type TEXT NOT NULL,
  service_option TEXT,
  cost_price NUMERIC(10, 2) DEFAULT 0,
  sale_price NUMERIC(10, 2) DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  CONSTRAINT nadra_pricing_unique UNIQUE(service_type, service_option)
);

CREATE TABLE IF NOT EXISTS public.pk_passport_pricing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL,
  speed TEXT NOT NULL,
  application_type TEXT NOT NULL,
  cost_price NUMERIC(10, 2) DEFAULT 0,
  sale_price NUMERIC(10, 2) DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  CONSTRAINT pk_passport_pricing_unique UNIQUE(category, speed, application_type)
);`
    
    await navigator.clipboard.writeText(sql)
    toast.success('SQL copied to clipboard')
  }

  if (loading) {
    return <div className="p-6 text-center">Loading services...</div>
  }

  if (setupRequired) {
    return (
      <div className="p-6">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <h3 className="font-semibold text-yellow-900 mb-2">Database Setup Required</h3>
            <p className="text-sm text-yellow-800 mb-4">The pricing tables don't exist yet. Run this SQL in your Supabase project:</p>
            <button
              onClick={handleCopySql}
              className="inline-flex items-center gap-2 bg-yellow-600 text-white px-3 py-2 rounded text-sm hover:bg-yellow-700"
            >
              <Copy className="h-4 w-4" /> Copy SQL & Run in Supabase
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold mb-4">Service Pricing Management</h2>
        <div className="flex gap-2 border-b">
          <button
            onClick={() => setActiveTab('nadra')}
            className={`px-4 py-2 font-medium transition-colors ${
              activeTab === 'nadra'
                ? 'border-b-2 border-blue-600 text-blue-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            NADRA (Nicop, Poc, etc.)
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

      {activeTab === 'nadra' && (
        <div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b-2 border-gray-200">
                  <th className="text-left py-3 px-4 font-semibold">Service Type</th>
                  <th className="text-left py-3 px-4 font-semibold">Service Option</th>
                  <th className="text-right py-3 px-4 font-semibold">Cost Price</th>
                  <th className="text-right py-3 px-4 font-semibold">Sale Price</th>
                  <th className="text-center py-3 px-4 font-semibold">Active</th>
                  <th className="text-center py-3 px-4 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {nadraWithPricing.map((item) => (
                  <tr key={`${item.service_type}-${item.service_option}`} className="border-b border-gray-100 hover:bg-blue-50">
                    <td className="py-3 px-4">{item.service_type}</td>
                    <td className="py-3 px-4">{item.service_option}</td>
                    {editingId === (item.id || `nadra-${item.service_type}-${item.service_option}`) ? (
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
                          {item.id && (
                            <button
                              onClick={() => handleDelete(item.id, 'nadra')}
                              className="text-red-600 hover:text-red-900"
                              title="Delete"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'passport' && (
        <div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b-2 border-gray-200">
                  <th className="text-left py-3 px-4 font-semibold">Category</th>
                  <th className="text-left py-3 px-4 font-semibold">Speed</th>
                  <th className="text-left py-3 px-4 font-semibold">Application Type</th>
                  <th className="text-right py-3 px-4 font-semibold">Cost Price</th>
                  <th className="text-right py-3 px-4 font-semibold">Sale Price</th>
                  <th className="text-center py-3 px-4 font-semibold">Active</th>
                  <th className="text-center py-3 px-4 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pkPassWithPricing.map((item) => (
                  <tr key={`${item.category}-${item.speed}-${item.application_type}`} className="border-b border-gray-100 hover:bg-blue-50">
                    <td className="py-3 px-4">{item.category}</td>
                    <td className="py-3 px-4">{item.speed}</td>
                    <td className="py-3 px-4">{item.application_type}</td>
                    {editingId === (item.id || `passport-${item.category}-${item.speed}-${item.application_type}`) ? (
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
                          {item.id && (
                            <button
                              onClick={() => handleDelete(item.id, 'passport')}
                              className="text-red-600 hover:text-red-900"
                              title="Delete"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
