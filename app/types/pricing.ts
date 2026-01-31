/**
 * Pricing Types - Centralized type definitions for all pricing-related interfaces
 */

export interface NadraPricing {
  id: string
  service_type: string
  service_option: string | null
  cost_price: number
  sale_price: number
  is_active: boolean
  notes: string | null
}

export interface PKPassportPricing {
  id: string
  category: string
  speed: string
  application_type: string
  cost_price: number
  sale_price: number
  is_active: boolean
  notes: string | null
}

export interface GBPassportPricing {
  id: string
  age_group: string
  pages: string
  service_type: string
  cost_price: number
  sale_price: number
  is_active: boolean
  notes: string | null
}

export interface VisaPricing {
  id: string
  country: string
  visa_type: string
  cost_price: number
  sale_price: number
  is_active: boolean
  notes: string | null
}

export type ActiveTab = 'nadra' | 'passport' | 'gb' | 'visa' | 'manage'

export interface ServicePricingTabProps {
  supabase: any
  loading: boolean
  setLoading: (loading: boolean) => void
}
