/**
 * Pricing Types - Centralized type definitions for all pricing-related interfaces
 */

import type { SupabaseClient } from '@supabase/supabase-js'

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
  pages: string
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

export interface UmrahTransportSupplier {
  id: string
  name: string
  contact_name: string | null
  contact_phone: string | null
  default_currency: string
  is_active: boolean
  sort_order: number
  notes: string | null
}

export interface UmrahTransportVehicleType {
  id: string
  label: string
  passenger_capacity: string | null
  is_active: boolean
  sort_order: number
  notes: string | null
}

export interface UmrahTransportRoute {
  id: string
  route_name: string
  preferred_supplier_id: string | null
  is_active: boolean
  sort_order: number
  notes: string | null
}

export interface UmrahTransportRoutePlan {
  id: string
  plan_name: string
  preferred_supplier_id: string | null
  is_active: boolean
  sort_order: number
  notes: string | null
}

export interface UmrahTransportRoutePlanSegment {
  id: string
  plan_id: string
  route_id: string
  segment_label: string | null
  sort_order: number
}

export interface UmrahTransportRate {
  id: string
  route_id: string
  supplier_id: string
  vehicle_type_id: string
  currency: string
  cost_price: number
  is_active: boolean
  notes: string | null
}

export interface UmrahTransportGuideRate {
  id: string
  supplier_id: string
  guide_service: string
  currency: string
  cost_price: number
  is_active: boolean
  notes: string | null
}

export interface UmrahTransportSupplierVehicleLabel {
  id: string
  supplier_id: string
  vehicle_type_id: string
  transport_label: string | null
  passenger_capacity_label: string | null
  is_active: boolean
  notes: string | null
}

export interface UmrahTransportSetting {
  setting_key: string
  setting_value: string
  notes: string | null
}

export type ActiveTab = 'nadra' | 'passport' | 'gb' | 'visa' | 'umrah_transport' | 'manage'

export interface ServicePricingTabProps {
  supabase: SupabaseClient
  loading: boolean
  setLoading: (loading: boolean) => void
}

export interface PricingEditValues {
  [key: string]: string | number | undefined
}
