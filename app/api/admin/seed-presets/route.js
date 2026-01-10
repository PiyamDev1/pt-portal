import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const PRESETS = [
  {
    country: "Kingdom of Saudi Arabia",
    types: [
      { name: "EVW - Single Entry (UK)", validity: "90 Days", cost: 32, price: 65 },
      { name: "Multiple Entry 1yr", validity: "12 Months", cost: 80, price: 125 },
      { name: "Umrah - Single Entry (Pakistani)", validity: "30 Days", cost: 155, price: 235 },
      { name: "Umrah - Single Entry (Indian/Bangladeshi)", validity: "30 Days", cost: 165, price: 245 }
    ]
  },
  {
    country: "Pakistan",
    types: [
      { name: "Tourist", validity: "90 Days", cost: 45, price: 85 },
      { name: "Family (90 Days)", validity: "90 Days", cost: 45, price: 85 },
      { name: "Family (12 Months)", validity: "12 Months", cost: 68, price: 125 },
      { name: "Family (12+ Months)", validity: "12+ Months", cost: 90, price: 165 }
    ]
  },
  {
    country: "Schengen Area", 
    types: [
      { name: "Schengen Visa (Application Fill)", validity: "N/A", cost: 0, price: 65 }
    ]
  },
  {
    country: "United Kingdom",
    types: [
      { name: "BRP - Evisa", validity: "N/A", cost: 0, price: 45 },
      { name: "NTL", validity: "N/A", cost: 0, price: 125 },
      { name: "Spouse - Application Only", validity: "30 Months", cost: 395, price: 0 },
      { name: "Visitor (6 Months)", validity: "6 Months", cost: 0, price: 295 },
      { name: "Visitor (24 Months)", validity: "24 Months", cost: 0, price: 295 }
    ]
  },
  {
    country: "Iran",
    types: [
      { name: "Tourist (UK Nationals)", validity: "30 Days", cost: 220, price: 245 },
      { name: "Tourist (Pakistani)", validity: "30 Days", cost: 165, price: 195 },
      { name: "Tourist (Travel Document)", validity: "30 Days", cost: 175, price: 220 }
    ]
  },
  {
    country: "Iraq",
    types: [
      { name: "Red - Single Entry (EU)", validity: "60 Days", cost: 105, price: 135 },
      { name: "Green - Single Entry (Pak/Ind/Ban)", validity: "60 Days", cost: 105, price: 135 }
    ]
  },
  {
    country: "Turkey",
    types: [
      { name: "Tourist", validity: "90 Days", cost: 55, price: 85 }
    ]
  },
  {
    country: "United States", 
    types: [
      { name: "EVW - Single", validity: "90 Days", cost: 25, price: 65 }
    ]
  },
  {
    country: "Kuwait",
    types: [
      { name: "Tourist", validity: "90 Days", cost: 10, price: 25 }
    ]
  }
]

export async function GET() {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )

    const logs = []

    for (const group of PRESETS) {
      // 1. Find or Create Country
      // We check case-insensitive name to avoid duplicates
      let countryId = null
      
      const { data: existingCountry } = await supabase
        .from('visa_countries')
        .select('id')
        .ilike('name', group.country)
        .maybeSingle()

      if (existingCountry) {
        countryId = existingCountry.id
      } else {
        const { data: newCountry, error: cErr } = await supabase
          .from('visa_countries')
          .insert({ name: group.country })
          .select('id')
          .single()
        
        if (cErr) {
          logs.push(`Failed to create country ${group.country}: ${cErr.message}`)
          continue
        }
        countryId = newCountry.id
      }

      // 2. Process Visa Types (Smart Update)
      for (const type of group.types) {
        // Check if type exists for this country (Case Insensitive)
        const { data: existingType } = await supabase
          .from('visa_types')
          .select('id')
          .eq('country_id', countryId)
          .ilike('name', type.name)
          .maybeSingle()

        const payload = {
            name: type.name,
            country_id: countryId,
            default_validity: type.validity,
            default_cost: type.cost,
            default_price: type.price
        }

        if (existingType) {
            // Update existing
            await supabase.from('visa_types').update(payload).eq('id', existingType.id)
            logs.push(`Updated: ${group.country} - ${type.name}`)
        } else {
            // Insert new
            await supabase.from('visa_types').insert(payload)
            logs.push(`Created: ${group.country} - ${type.name}`)
        }
      }
  }

  return NextResponse.json({ ok: true, logs })
  } catch (error) {
    console.error('Seeder error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
