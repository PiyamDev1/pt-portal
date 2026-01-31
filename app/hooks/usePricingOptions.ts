/**
 * usePricingOptions Hook - Manages state and operations for pricing options
 * Centralizes logic for adding, editing, deleting, and fetching pricing data
 */

import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { 
  NadraPricing, 
  PKPassportPricing, 
  GBPassportPricing, 
  VisaPricing, 
  ActiveTab,
  PricingEditValues 
} from '@/app/types/pricing'

export const usePricingOptions = (supabase: SupabaseClient) => {
  const [nadraPricing, setNadraPricing] = useState<NadraPricing[]>([])
  const [pkPassPricing, setPKPassPricing] = useState<PKPassportPricing[]>([])
  const [gbPassPricing, setGBPassPricing] = useState<GBPassportPricing[]>([])
  const [visaPricing, setVisaPricing] = useState<VisaPricing[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValues, setEditValues] = useState<PricingEditValues>({})
  const [setupRequired, setSetupRequired] = useState(false)

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
      
      if (!pkErr && pkPricingData) {
        setPKPassPricing(pkPricingData)
      }

      const { data: gbPricingData, error: gbErr } = await supabase
        .from('gb_passport_pricing')
        .select('*')
        .order('age_group', { ascending: true })
      
      if (!gbErr && gbPricingData) {
        setGBPassPricing(gbPricingData)
      }

      const { data: visaPricingData, error: visaErr } = await supabase
        .from('visa_pricing')
        .select('*')
        .order('country', { ascending: true })
      
      if (!visaErr && visaPricingData) {
        setVisaPricing(visaPricingData)
      }
    } catch (error: any) {
      toast.error('Failed to fetch pricing: ' + error.message)
    }
  }

  const handleEdit = (item: any) => {
    setEditingId(item.id)
    setEditValues({
      cost_price: item.cost_price,
      sale_price: item.sale_price,
      is_active: item.is_active,
      notes: item.notes || ''
    })
  }

  const handleSave = async (activeTab: ActiveTab) => {
    if (!editingId) return

    try {
      let table = 'nadra_pricing'
      if (activeTab === 'passport') table = 'pk_passport_pricing'
      if (activeTab === 'gb') table = 'gb_passport_pricing'
      if (activeTab === 'visa') table = 'visa_pricing'

      const { error } = await supabase
        .from(table)
        .update({
          cost_price: Number(editValues.cost_price) || 0,
          sale_price: Number(editValues.sale_price) || 0,
          is_active: editValues.is_active,
          notes: editValues.notes || null
        })
        .eq('id', editingId)
      
      if (error) throw error

      toast.success('Pricing saved successfully')
      setEditingId(null)
      await fetchPricing()
    } catch (error: any) {
      toast.error('Failed to save pricing: ' + error.message)
    }
  }

  const handleDelete = async (id: string, serviceTab: ActiveTab) => {
    if (!id) return
    
    if (!confirm('Delete this pricing entry?')) return

    try {
      let table = 'nadra_pricing'
      if (serviceTab === 'passport') table = 'pk_passport_pricing'
      if (serviceTab === 'gb') table = 'gb_passport_pricing'
      if (serviceTab === 'visa') table = 'visa_pricing'

      const { error } = await supabase.from(table).delete().eq('id', id)
      if (error) throw error
      
      toast.success('Pricing deleted')
      await fetchPricing()
    } catch (error: any) {
      toast.error('Failed to delete: ' + error.message)
    }
  }

  return {
    // Pricing data
    nadraPricing,
    pkPassPricing,
    gbPassPricing,
    visaPricing,
    // Editing state
    editingId,
    setEditingId,
    editValues,
    setEditValues,
    // UI state
    setupRequired,
    // Operations
    fetchPricing,
    handleEdit,
    handleSave,
    handleDelete
  }
}
