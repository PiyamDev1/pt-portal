import { apiError, apiOk } from '@/lib/api/http'
import { getRouteSupabaseClient } from '@/lib/api/serverSupabase'

const SCHEMA_HINT =
  'Umrah transport pricing schema is not installed yet. Run scripts/migrations/20260714_create_umrah_transport_pricing.sql in Supabase SQL editor.'

function isSchemaError(error: unknown) {
  const code = (error as { code?: string } | null)?.code
  return code === '42P01' || code === '42703' || code === '42P10' || code === 'PGRST205'
}

export async function GET() {
  const supabase = await getRouteSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return apiError('Unauthorized', 401)

  const [routes, suppliers, vehicles, rates, labels, settings] = await Promise.all([
    supabase
      .from('umrah_transport_routes')
      .select('id, route_name, is_active, sort_order')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('route_name', { ascending: true }),
    supabase
      .from('umrah_transport_suppliers')
      .select('id, name, default_currency, is_active, sort_order')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true }),
    supabase
      .from('umrah_transport_vehicle_types')
      .select('id, label, passenger_capacity, is_active, sort_order')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('label', { ascending: true }),
    supabase
      .from('umrah_transport_rates')
      .select('route_id, supplier_id, vehicle_type_id, currency, cost_price, is_active')
      .eq('is_active', true),
    supabase
      .from('umrah_transport_supplier_vehicle_labels')
      .select('supplier_id, vehicle_type_id, transport_label, is_active')
      .eq('is_active', true),
    supabase
      .from('umrah_transport_settings')
      .select('setting_key, setting_value')
      .eq('setting_key', 'sar_to_gbp_exchange_rate'),
  ])

  const firstError =
    routes.error ||
    suppliers.error ||
    vehicles.error ||
    rates.error ||
    labels.error ||
    settings.error

  if (firstError) {
    if (isSchemaError(firstError)) {
      return apiOk({
        routes: [],
        suppliers: [],
        vehicles: [],
        rates: [],
        labels: [],
        sarToGbpExchangeRate: 0,
        setupRequired: true,
        message: SCHEMA_HINT,
      })
    }
    return apiError(firstError.message || 'Failed to load Umrah transport pricing', 500)
  }

  const exchangeRate = Number(settings.data?.[0]?.setting_value || 0)

  return apiOk({
    routes: routes.data || [],
    suppliers: suppliers.data || [],
    vehicles: vehicles.data || [],
    rates: rates.data || [],
    labels: labels.data || [],
    sarToGbpExchangeRate: Number.isFinite(exchangeRate) ? exchangeRate : 0,
    setupRequired: false,
  })
}
