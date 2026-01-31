'use client'

import { useEffect, useState, memo } from 'react'
import { AlertCircle } from 'lucide-react'
import { 
  ActiveTab,
  ServicePricingTabProps 
} from '@/app/types/pricing'
import { PRICING_OPTIONS } from '@/app/lib/pricingOptions'
import { usePricingOptions } from '@/app/hooks/usePricingOptions'
import NadraPricingTab from './pricing/NadraPricingTab'
import PKPassportPricingTab from './pricing/PKPassportPricingTab'
import GBPassportPricingTab from './pricing/GBPassportPricingTab'
import VisaPricingTab from './pricing/VisaPricingTab'
import ManagePricingOptionsTab from './pricing/ManagePricingOptionsTab'

function ServicePricingTabCore({ supabase, loading: initialLoading, setLoading }: ServicePricingTabProps) {
  const [activeTab, setActiveTab] = useState<ActiveTab>('nadra')
  const [loading, setLoadingState] = useState(initialLoading)
  const {
    nadraPricing,
    pkPassPricing,
    gbPassPricing,
    visaPricing,
    editingId,
    setEditingId,
    editValues,
    setEditValues,
    setupRequired,
    fetchPricing,
    handleEdit,
    handleSave,
    handleDelete
  } = usePricingOptions(supabase)

  // Available options state
  const [nadrServiceTypes, setNadrServiceTypes] = useState(PRICING_OPTIONS.NADRA.serviceTypes)
  const [nadrServiceOptions, setNadrServiceOptions] = useState(PRICING_OPTIONS.NADRA.serviceOptions)
  const [pkCategories, setPKCategories] = useState(PRICING_OPTIONS.PK_PASSPORT.categories)
  const [pkSpeeds, setPKSpeeds] = useState(PRICING_OPTIONS.PK_PASSPORT.speeds)
  const [pkApplicationTypes, setPKApplicationTypes] = useState(PRICING_OPTIONS.PK_PASSPORT.applicationTypes)
  const [gbAgeGroups, setGBAgeGroups] = useState(PRICING_OPTIONS.GB_PASSPORT.ageGroups)
  const [gbPages, setGBPages] = useState(PRICING_OPTIONS.GB_PASSPORT.pages)
  const [gbServiceTypes, setGBServiceTypes] = useState(PRICING_OPTIONS.GB_PASSPORT.serviceTypes)

  useEffect(() => {
    setLoading(true)
    setLoadingState(true)
    fetchPricing().then(() => {
      setLoading(false)
      setLoadingState(false)
    })
  }, [fetchPricing, setLoading])

  // Handler wrappers for database operations
  const handleAddNadraEntry = async (entry: { service_type: string; service_option: string; cost_price: number; sale_price: number }) => {
    const { error } = await supabase.from('nadra_pricing').insert({
      service_type: entry.service_type.trim(),
      service_option: entry.service_option?.trim() || null,
      cost_price: Number(entry.cost_price) || 0,
      sale_price: Number(entry.sale_price) || 0,
      is_active: true
    })
    if (error) throw error
    await fetchPricing()
  }

  const handleAddPKEntry = async (entry: { category: string; speed: string; application_type: string; cost_price: number; sale_price: number }) => {
    const { error } = await supabase.from('pk_passport_pricing').insert({
      category: entry.category.trim(),
      speed: entry.speed.trim(),
      application_type: entry.application_type.trim(),
      cost_price: Number(entry.cost_price) || 0,
      sale_price: Number(entry.sale_price) || 0,
      is_active: true
    })
    if (error) throw error
    await fetchPricing()
  }

  const handleAddGBEntry = async (entry: { age_group: string; pages: string; service_type: string; cost_price: number; sale_price: number }) => {
    const { error } = await supabase.from('gb_passport_pricing').insert({
      age_group: entry.age_group.trim(),
      pages: entry.pages.trim(),
      service_type: entry.service_type.trim(),
      cost_price: Number(entry.cost_price) || 0,
      sale_price: Number(entry.sale_price) || 0,
      is_active: true
    })
    if (error) throw error
    await fetchPricing()
  }

  const handleAddVisaEntry = async (entry: { country: string; visa_type: string; cost_price: number; sale_price: number }) => {
    const { error } = await supabase.from('visa_pricing').insert({
      country: entry.country.trim(),
      visa_type: entry.visa_type.trim(),
      cost_price: Number(entry.cost_price) || 0,
      sale_price: Number(entry.sale_price) || 0,
      is_active: true
    })
    if (error) throw error
    await fetchPricing()
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="space-y-4">
          {/* Header skeleton */}
          <div className="space-y-2">
            <div className="h-8 bg-slate-200 rounded w-48 animate-pulse"></div>
            <div className="h-4 bg-slate-200 rounded w-96 animate-pulse"></div>
          </div>

          {/* Tabs skeleton */}
          <div className="flex gap-4 border-b">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="h-10 bg-slate-200 rounded w-32 animate-pulse"></div>
            ))}
          </div>

          {/* Content skeleton */}
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-12 bg-slate-200 rounded animate-pulse"></div>
            ))}
          </div>
        </div>

        <div className="mt-8 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin w-8 h-8 border-4 border-slate-200 border-t-slate-900 rounded-full mx-auto mb-3"></div>
            <p className="text-slate-600 font-medium">Loading pricing options...</p>
          </div>
        </div>
      </div>
    )
  }

  if (setupRequired) {
    return (
      <div className="p-6">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <h3 className="font-semibold text-yellow-900 mb-2">Database Setup Required</h3>
            <p className="text-sm text-yellow-800 mb-4">The pricing tables do not exist yet. Run the SQL from scripts/create-pricing-tables.sql in your Supabase project SQL Editor.</p>
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
        
        <div className="flex gap-2 border-b overflow-x-auto">
          {['nadra', 'passport', 'gb', 'visa'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab as ActiveTab)}
              className={`px-4 py-2 font-medium transition-colors whitespace-nowrap ${
                activeTab === tab
                  ? 'border-b-2 border-blue-600 text-blue-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {tab === 'nadra' && 'NADRA Services'}
              {tab === 'passport' && 'Pakistani Passport'}
              {tab === 'gb' && 'GB Passport'}
              {tab === 'visa' && 'Visa Services'}
            </button>
          ))}
          <button
            onClick={() => setActiveTab('manage')}
            className={`px-4 py-2 font-medium transition-colors whitespace-nowrap ml-auto ${
              activeTab === 'manage'
                ? 'border-b-2 border-green-600 text-green-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            ⚙️ Manage Options
          </button>
        </div>
      </div>

      {activeTab === 'nadra' && (
        <NadraPricingTab
          nadraPricing={nadraPricing}
          editingId={editingId}
          editValues={editValues}
          setEditingId={setEditingId}
          setEditValues={setEditValues}
          onEdit={handleEdit}
          onSave={() => handleSave('nadra')}
          onDelete={(id) => handleDelete(id, 'nadra')}
          onAddEntry={handleAddNadraEntry}
          supabase={supabase}
        />
      )}

      {activeTab === 'passport' && (
        <PKPassportPricingTab
          pricing={pkPassPricing}
          editingId={editingId}
          editValues={editValues}
          setEditingId={setEditingId}
          setEditValues={setEditValues}
          onEdit={handleEdit}
          onSave={() => handleSave('passport')}
          onDelete={(id) => handleDelete(id, 'passport')}
          onAddEntry={handleAddPKEntry}
          supabase={supabase}
        />
      )}

      {activeTab === 'gb' && (
        <GBPassportPricingTab
          pricing={gbPassPricing}
          editingId={editingId}
          editValues={editValues}
          setEditingId={setEditingId}
          setEditValues={setEditValues}
          onEdit={handleEdit}
          onSave={() => handleSave('gb')}
          onDelete={(id) => handleDelete(id, 'gb')}
          onAddEntry={handleAddGBEntry}
          supabase={supabase}
        />
      )}

      {activeTab === 'visa' && (
        <VisaPricingTab
          pricing={visaPricing}
          editingId={editingId}
          editValues={editValues}
          setEditingId={setEditingId}
          setEditValues={setEditValues}
          onEdit={handleEdit}
          onSave={() => handleSave('visa')}
          onDelete={(id) => handleDelete(id, 'visa')}
          onAddEntry={handleAddVisaEntry}
          supabase={supabase}
        />
      )}

      {activeTab === 'manage' && (
        <div className="mt-6">
          <ManagePricingOptionsTab
            nadrServiceTypes={nadrServiceTypes}
            setNadrServiceTypes={setNadrServiceTypes}
            nadrServiceOptions={nadrServiceOptions}
            setNadrServiceOptions={setNadrServiceOptions}
            pkCategories={pkCategories}
            setPKCategories={setPKCategories}
            pkSpeeds={pkSpeeds}
            setPKSpeeds={setPKSpeeds}
            pkApplicationTypes={pkApplicationTypes}
            setPKApplicationTypes={setPKApplicationTypes}
            gbAgeGroups={gbAgeGroups}
            setGBAgeGroups={setGBAgeGroups}
            gbPages={gbPages}
            setGBPages={setGBPages}
            gbServiceTypes={gbServiceTypes}
            setGBServiceTypes={setGBServiceTypes}
          />
        </div>
      )}
    </div>
  )
}

export default memo(ServicePricingTabCore)
