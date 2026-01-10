import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// YOUR PRESETS CONFIGURATION
const PRESETS = [
  {
    country: "Kingdom of Saudi Arabia",
    types: [
      { name: "EVW - Single Entry (UK Nationals)", validity: "90 Days", cost: 32, price: 65 },
      { name: "Multiple Entry 1yr (EU/US/Can/Aus)", validity: "12 Months", cost: 80, price: 125 },
      { name: "Umrah - Single Entry (Pakistani)", validity: "30 Days", cost: 155, price: 235 },
      { name: "Umrah - Single Entry (Indian/Bangla)", validity: "30 Days", cost: 165, price: 245 }
    ]
  },
  {
    country: "Pakistan",
    types: [
      { name: "Tourist", validity: "90 Days", cost: 45, price: 85 },
      { name: "Family (90 Days)", validity: "90 Days", cost: 45, price: 85 },
      { name: "Family (1 Year)", validity: "12 Months", cost: 68, price: 125 },
      { name: "Family (Over 1 Year)", validity: "12+ Months", cost: 90, price: 165 }
    ]
  },
  {
    country: "Schengen Area", // Represents "All EU Countries in Schengen Zone"
    types: [
      { name: "Schengen Visa (Application Fill)", validity: "N/A", cost: 0, price: 65 }
    ]
  },
  {
    country: "United Kingdom",
    types: [
      { name: "BRP - Evisa", validity: "N/A", cost: 0, price: 45 },
      { name: "NTL", validity: "N/A", cost: 0, price: 125 },
      { name: "Spouse - Application Only", validity: "30 Months", cost: 395, price: 0 }, // Agency price 0 means maybe quoted custom?
      { name: "Visitor (6 Months)", validity: "6 Months", cost: 0, price: 295 },
      { name: "Visitor (2 Years)", validity: "24 Months", cost: 0, price: 295 }
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
      { name: "Tourist (Sticker)", validity: "90 Days", cost: 55, price: 85 }
    ]
  },
  {
    country: "United States", // Standardized from United States of America
    types: [
      { name: "EVW / ESTA", validity: "90 Days", cost: 25, price: 65 }
    ]
  },
  {
    country: "Kuwait",
    types: [
      { name: "Tourist E-Visa (EU Nationals)", validity: "90 Days", cost: 10, price: 25 }
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
      // 1. Upsert Country
      const { data: countryData, error: countryError } = await supabase
        .from('visa_countries')
        .upsert({ name: group.country }, { onConflict: 'name' })
        .select('id')
        .single()
      
      if (countryError) {
        logs.push(`Error creating country ${group.country}: ${countryError.message}`)
        continue
      }

      const countryId = countryData.id

      // 2. Upsert Types for this Country
      for (const type of group.types) {
        const { error: typeError } = await supabase
          .from('visa_types')
          .upsert({
             country_id: countryId,
             name: type.name,
             default_validity: type.validity,
             default_cost: type.cost,
             default_price: type.price
          }, { onConflict: 'country_id, name' })

        if (typeError) {
           logs.push(`Error creating type ${type.name} for ${group.country}: ${typeError.message}`)
        }
      }
      logs.push(`Processed ${group.country} with ${group.types.length} types.`)
    }

    return NextResponse.json({ success: true, logs })
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
