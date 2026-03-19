import { createClient } from '@supabase/supabase-js'
import { NextRequest } from 'next/server'
import { toErrorMessage } from '@/lib/api/error'
import { apiError, apiOk } from '@/lib/api/http'

export async function POST(request: NextRequest) {
  try {
    // Only allow from localhost/internal requests
    const authHeader = request.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return apiError('Unauthorized', 401)
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!url || !key) {
      return apiError('Supabase not configured', 500)
    }

    const supabase = createClient(url, key)

    // Insert NADRA pricing
    const nadraPricing = [
      { service_type: 'NICOP/CNIC', service_option: 'Normal', cost_price: 0, sale_price: 0 },
      { service_type: 'NICOP/CNIC', service_option: 'Executive', cost_price: 0, sale_price: 0 },
      {
        service_type: 'NICOP/CNIC',
        service_option: 'Upgrade to Fast',
        cost_price: 0,
        sale_price: 0,
      },
      { service_type: 'NICOP/CNIC', service_option: 'Modification', cost_price: 0, sale_price: 0 },
      { service_type: 'NICOP/CNIC', service_option: 'Reprint', cost_price: 0, sale_price: 0 },
      { service_type: 'NICOP/CNIC', service_option: 'Cancellation', cost_price: 0, sale_price: 0 },
      { service_type: 'POC', service_option: 'Normal', cost_price: 0, sale_price: 0 },
      { service_type: 'POC', service_option: 'Executive', cost_price: 0, sale_price: 0 },
      { service_type: 'POC', service_option: 'Upgrade to Fast', cost_price: 0, sale_price: 0 },
      { service_type: 'POC', service_option: 'Modification', cost_price: 0, sale_price: 0 },
      { service_type: 'POC', service_option: 'Reprint', cost_price: 0, sale_price: 0 },
      { service_type: 'POC', service_option: 'Cancellation', cost_price: 0, sale_price: 0 },
      { service_type: 'FRC', service_option: 'Normal', cost_price: 0, sale_price: 0 },
      { service_type: 'FRC', service_option: 'Executive', cost_price: 0, sale_price: 0 },
      { service_type: 'FRC', service_option: 'Upgrade to Fast', cost_price: 0, sale_price: 0 },
      { service_type: 'FRC', service_option: 'Modification', cost_price: 0, sale_price: 0 },
      { service_type: 'FRC', service_option: 'Reprint', cost_price: 0, sale_price: 0 },
      { service_type: 'FRC', service_option: 'Cancellation', cost_price: 0, sale_price: 0 },
      { service_type: 'CRC', service_option: 'Normal', cost_price: 0, sale_price: 0 },
      { service_type: 'CRC', service_option: 'Executive', cost_price: 0, sale_price: 0 },
      { service_type: 'CRC', service_option: 'Upgrade to Fast', cost_price: 0, sale_price: 0 },
      { service_type: 'CRC', service_option: 'Modification', cost_price: 0, sale_price: 0 },
      { service_type: 'CRC', service_option: 'Reprint', cost_price: 0, sale_price: 0 },
      { service_type: 'CRC', service_option: 'Cancellation', cost_price: 0, sale_price: 0 },
      { service_type: 'POA', service_option: 'Normal', cost_price: 0, sale_price: 0 },
      { service_type: 'POA', service_option: 'Executive', cost_price: 0, sale_price: 0 },
      { service_type: 'POA', service_option: 'Upgrade to Fast', cost_price: 0, sale_price: 0 },
      { service_type: 'POA', service_option: 'Modification', cost_price: 0, sale_price: 0 },
      { service_type: 'POA', service_option: 'Reprint', cost_price: 0, sale_price: 0 },
      { service_type: 'POA', service_option: 'Cancellation', cost_price: 0, sale_price: 0 },
    ]

    const pkPricing = [
      {
        category: 'Adult 10 Year',
        speed: 'Normal',
        application_type: 'First Time',
        cost_price: 0,
        sale_price: 0,
      },
      {
        category: 'Adult 10 Year',
        speed: 'Normal',
        application_type: 'Renewal',
        cost_price: 0,
        sale_price: 0,
      },
      {
        category: 'Adult 10 Year',
        speed: 'Normal',
        application_type: 'Modification',
        cost_price: 0,
        sale_price: 0,
      },
      {
        category: 'Adult 10 Year',
        speed: 'Normal',
        application_type: 'Lost',
        cost_price: 0,
        sale_price: 0,
      },
      {
        category: 'Adult 10 Year',
        speed: 'Executive',
        application_type: 'First Time',
        cost_price: 0,
        sale_price: 0,
      },
      {
        category: 'Adult 10 Year',
        speed: 'Executive',
        application_type: 'Renewal',
        cost_price: 0,
        sale_price: 0,
      },
      {
        category: 'Adult 10 Year',
        speed: 'Executive',
        application_type: 'Modification',
        cost_price: 0,
        sale_price: 0,
      },
      {
        category: 'Adult 10 Year',
        speed: 'Executive',
        application_type: 'Lost',
        cost_price: 0,
        sale_price: 0,
      },
      {
        category: 'Adult 5 Year',
        speed: 'Normal',
        application_type: 'First Time',
        cost_price: 0,
        sale_price: 0,
      },
      {
        category: 'Adult 5 Year',
        speed: 'Normal',
        application_type: 'Renewal',
        cost_price: 0,
        sale_price: 0,
      },
      {
        category: 'Adult 5 Year',
        speed: 'Normal',
        application_type: 'Modification',
        cost_price: 0,
        sale_price: 0,
      },
      {
        category: 'Adult 5 Year',
        speed: 'Normal',
        application_type: 'Lost',
        cost_price: 0,
        sale_price: 0,
      },
      {
        category: 'Adult 5 Year',
        speed: 'Executive',
        application_type: 'First Time',
        cost_price: 0,
        sale_price: 0,
      },
      {
        category: 'Adult 5 Year',
        speed: 'Executive',
        application_type: 'Renewal',
        cost_price: 0,
        sale_price: 0,
      },
      {
        category: 'Adult 5 Year',
        speed: 'Executive',
        application_type: 'Modification',
        cost_price: 0,
        sale_price: 0,
      },
      {
        category: 'Adult 5 Year',
        speed: 'Executive',
        application_type: 'Lost',
        cost_price: 0,
        sale_price: 0,
      },
      {
        category: 'Child 5 Year',
        speed: 'Normal',
        application_type: 'First Time',
        cost_price: 0,
        sale_price: 0,
      },
      {
        category: 'Child 5 Year',
        speed: 'Normal',
        application_type: 'Renewal',
        cost_price: 0,
        sale_price: 0,
      },
      {
        category: 'Child 5 Year',
        speed: 'Normal',
        application_type: 'Modification',
        cost_price: 0,
        sale_price: 0,
      },
      {
        category: 'Child 5 Year',
        speed: 'Normal',
        application_type: 'Lost',
        cost_price: 0,
        sale_price: 0,
      },
      {
        category: 'Child 5 Year',
        speed: 'Executive',
        application_type: 'First Time',
        cost_price: 0,
        sale_price: 0,
      },
      {
        category: 'Child 5 Year',
        speed: 'Executive',
        application_type: 'Renewal',
        cost_price: 0,
        sale_price: 0,
      },
      {
        category: 'Child 5 Year',
        speed: 'Executive',
        application_type: 'Modification',
        cost_price: 0,
        sale_price: 0,
      },
      {
        category: 'Child 5 Year',
        speed: 'Executive',
        application_type: 'Lost',
        cost_price: 0,
        sale_price: 0,
      },
    ]

    const gbPricing = [
      { age_group: 'Adult', pages: '32', service_type: 'Standard', cost_price: 0, sale_price: 0 },
      { age_group: 'Adult', pages: '32', service_type: 'Express', cost_price: 0, sale_price: 0 },
      { age_group: 'Adult', pages: '32', service_type: 'Premium', cost_price: 0, sale_price: 0 },
      { age_group: 'Adult', pages: '48', service_type: 'Standard', cost_price: 0, sale_price: 0 },
      { age_group: 'Adult', pages: '48', service_type: 'Express', cost_price: 0, sale_price: 0 },
      { age_group: 'Adult', pages: '48', service_type: 'Premium', cost_price: 0, sale_price: 0 },
      { age_group: 'Adult', pages: '52', service_type: 'Standard', cost_price: 0, sale_price: 0 },
      { age_group: 'Adult', pages: '52', service_type: 'Express', cost_price: 0, sale_price: 0 },
      { age_group: 'Adult', pages: '52', service_type: 'Premium', cost_price: 0, sale_price: 0 },
      { age_group: 'Child', pages: '32', service_type: 'Standard', cost_price: 0, sale_price: 0 },
      { age_group: 'Child', pages: '32', service_type: 'Express', cost_price: 0, sale_price: 0 },
      { age_group: 'Child', pages: '32', service_type: 'Premium', cost_price: 0, sale_price: 0 },
      { age_group: 'Child', pages: '48', service_type: 'Standard', cost_price: 0, sale_price: 0 },
      { age_group: 'Child', pages: '48', service_type: 'Express', cost_price: 0, sale_price: 0 },
      { age_group: 'Child', pages: '48', service_type: 'Premium', cost_price: 0, sale_price: 0 },
      { age_group: 'Child', pages: '52', service_type: 'Standard', cost_price: 0, sale_price: 0 },
      { age_group: 'Child', pages: '52', service_type: 'Express', cost_price: 0, sale_price: 0 },
      { age_group: 'Child', pages: '52', service_type: 'Premium', cost_price: 0, sale_price: 0 },
      { age_group: 'Infant', pages: '32', service_type: 'Standard', cost_price: 0, sale_price: 0 },
      { age_group: 'Infant', pages: '32', service_type: 'Express', cost_price: 0, sale_price: 0 },
      { age_group: 'Infant', pages: '32', service_type: 'Premium', cost_price: 0, sale_price: 0 },
      { age_group: 'Infant', pages: '48', service_type: 'Standard', cost_price: 0, sale_price: 0 },
      { age_group: 'Infant', pages: '48', service_type: 'Express', cost_price: 0, sale_price: 0 },
      { age_group: 'Infant', pages: '48', service_type: 'Premium', cost_price: 0, sale_price: 0 },
      { age_group: 'Infant', pages: '52', service_type: 'Standard', cost_price: 0, sale_price: 0 },
      { age_group: 'Infant', pages: '52', service_type: 'Express', cost_price: 0, sale_price: 0 },
      { age_group: 'Infant', pages: '52', service_type: 'Premium', cost_price: 0, sale_price: 0 },
    ]

    // Insert all pricing data
    const [{ error: nadraInsertError }, { error: pkInsertError }, { error: gbInsertError }] =
      await Promise.all([
        supabase.from('nadra_pricing').insert(nadraPricing),
        supabase.from('pk_passport_pricing').insert(pkPricing),
        supabase.from('gb_passport_pricing').insert(gbPricing),
      ])

    if (nadraInsertError) throw new Error(nadraInsertError.message)
    if (pkInsertError) throw new Error(pkInsertError.message)
    if (gbInsertError) throw new Error(gbInsertError.message)

    // Verify counts
    const [nadra, pk, gb] = await Promise.all([
      supabase.from('nadra_pricing').select('count()', { count: 'exact', head: true }),
      supabase.from('pk_passport_pricing').select('count()', { count: 'exact', head: true }),
      supabase.from('gb_passport_pricing').select('count()', { count: 'exact', head: true }),
    ])

    return apiOk({
      nadraCount: nadra.count || 0,
      pkCount: pk.count || 0,
      gbCount: gb.count || 0,
    })
  } catch (error) {
    return apiError(toErrorMessage(error, 'Failed to seed pricing data'), 500)
  }
}
