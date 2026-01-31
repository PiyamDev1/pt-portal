import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // NADRA Pricing - 30 entries
    const nadraPricing = [
      { service_type: 'NICOP/CNIC', service_option: 'Normal', cost_price: 0, sale_price: 0 },
      { service_type: 'NICOP/CNIC', service_option: 'Executive', cost_price: 0, sale_price: 0 },
      { service_type: 'NICOP/CNIC', service_option: 'Upgrade to Fast', cost_price: 0, sale_price: 0 },
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
      { service_type: 'POA', service_option: 'Cancellation', cost_price: 0, sale_price: 0 }
    ]

    // Pakistani Passport - 24 entries
    const pkPricing = [
      { category: 'Adult 10 Year', speed: 'Normal', application_type: 'First Time', cost_price: 0, sale_price: 0 },
      { category: 'Adult 10 Year', speed: 'Normal', application_type: 'Renewal', cost_price: 0, sale_price: 0 },
      { category: 'Adult 10 Year', speed: 'Normal', application_type: 'Modification', cost_price: 0, sale_price: 0 },
      { category: 'Adult 10 Year', speed: 'Normal', application_type: 'Lost', cost_price: 0, sale_price: 0 },
      { category: 'Adult 10 Year', speed: 'Executive', application_type: 'First Time', cost_price: 0, sale_price: 0 },
      { category: 'Adult 10 Year', speed: 'Executive', application_type: 'Renewal', cost_price: 0, sale_price: 0 },
      { category: 'Adult 10 Year', speed: 'Executive', application_type: 'Modification', cost_price: 0, sale_price: 0 },
      { category: 'Adult 10 Year', speed: 'Executive', application_type: 'Lost', cost_price: 0, sale_price: 0 },
      { category: 'Adult 5 Year', speed: 'Normal', application_type: 'First Time', cost_price: 0, sale_price: 0 },
      { category: 'Adult 5 Year', speed: 'Normal', application_type: 'Renewal', cost_price: 0, sale_price: 0 },
      { category: 'Adult 5 Year', speed: 'Normal', application_type: 'Modification', cost_price: 0, sale_price: 0 },
      { category: 'Adult 5 Year', speed: 'Normal', application_type: 'Lost', cost_price: 0, sale_price: 0 },
      { category: 'Adult 5 Year', speed: 'Executive', application_type: 'First Time', cost_price: 0, sale_price: 0 },
      { category: 'Adult 5 Year', speed: 'Executive', application_type: 'Renewal', cost_price: 0, sale_price: 0 },
      { category: 'Adult 5 Year', speed: 'Executive', application_type: 'Modification', cost_price: 0, sale_price: 0 },
      { category: 'Adult 5 Year', speed: 'Executive', application_type: 'Lost', cost_price: 0, sale_price: 0 },
      { category: 'Child 5 Year', speed: 'Normal', application_type: 'First Time', cost_price: 0, sale_price: 0 },
      { category: 'Child 5 Year', speed: 'Normal', application_type: 'Renewal', cost_price: 0, sale_price: 0 },
      { category: 'Child 5 Year', speed: 'Normal', application_type: 'Modification', cost_price: 0, sale_price: 0 },
      { category: 'Child 5 Year', speed: 'Normal', application_type: 'Lost', cost_price: 0, sale_price: 0 },
      { category: 'Child 5 Year', speed: 'Executive', application_type: 'First Time', cost_price: 0, sale_price: 0 },
      { category: 'Child 5 Year', speed: 'Executive', application_type: 'Renewal', cost_price: 0, sale_price: 0 },
      { category: 'Child 5 Year', speed: 'Executive', application_type: 'Modification', cost_price: 0, sale_price: 0 },
      { category: 'Child 5 Year', speed: 'Executive', application_type: 'Lost', cost_price: 0, sale_price: 0 }
    ]

    // GB Passport - 27 entries
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
      { age_group: 'Infant', pages: '52', service_type: 'Premium', cost_price: 0, sale_price: 0 }
    ]

    // Insert NADRA pricing
    const { error: nadraErr } = await supabase
      .from('nadra_pricing')
      .insert(nadraPricing)

    // Insert Pakistani Passport pricing
    const { error: pkErr } = await supabase
      .from('pk_passport_pricing')
      .insert(pkPricing)

    // Insert GB Passport pricing
    const { error: gbErr } = await supabase
      .from('gb_passport_pricing')
      .insert(gbPricing)

    // Verify counts
    const [nadra, pk, gb] = await Promise.all([
      supabase.from('nadra_pricing').select('count()', { count: 'exact' }),
      supabase.from('pk_passport_pricing').select('count()', { count: 'exact' }),
      supabase.from('gb_passport_pricing').select('count()', { count: 'exact' })
    ])

    return NextResponse.json({
      success: true,
      message: 'Pricing data seeded successfully!',
      results: {
        nadra: nadra.count || 0,
        pkPassport: pk.count || 0,
        gbPassport: gb.count || 0
      }
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    )
  }
}
