import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// YOUR PRESETS CONFIGURATION - Exact specifications from user
const PRESETS = [
  {
    country: "Kingdom of Saudi Arabia",
    types: [
      { name: "EVW - Single Entry", validity: "90 days", cost: 32, price: 65 },
      { name: "Multiple Entry 1yr", validity: "12 months", cost: 80, price: 125 },
      { name: "Umrah - Single Entry", validity: "30 days", cost: 155, price: 235 }
    ]
  },
  {
    country: "Pakistan",
    types: [
      { name: "Tourist", validity: "90 days", cost: 45, price: 85 },
      { name: "Family", validity: "90 days", cost: 45, price: 85 },
      { name: "Family", validity: "12 months", cost: 68, price: 125 },
      { name: "Family", validity: "12+ months", cost: 90, price: 165 }
    ]
  },
  {
    country: "All EU countries in Schengen Zone",
    types: [
      { name: "Schengen Visa - Application fill", validity: "N/A", cost: 0, price: 65 }
    ]
  },
  {
    country: "United Kingdom",
    types: [
      { name: "BRP - Evisa", validity: "N/A", cost: 0, price: 45 },
      { name: "NTL", validity: "N/A", cost: 0, price: 125 },
      { name: "Spouse - Application only", validity: "30 months", cost: 395, price: 0 },
      { name: "Visitor", validity: "6 months", cost: 0, price: 295 },
      { name: "Visitor", validity: "24 months", cost: 0, price: 295 }
    ]
  },
  {
    country: "Iran",
    types: [
      { name: "Tourist", validity: "30 days", cost: 220, price: 245 },
      { name: "Tourist", validity: "30 days", cost: 165, price: 195 },
      { name: "Tourist", validity: "30 days", cost: 175, price: 220 }
    ]
  },
  {
    country: "Iraq",
    types: [
      { name: "Red - Single Entry", validity: "60 days", cost: 105, price: 135 },
      { name: "Green - Single Entry", validity: "60 days", cost: 105, price: 135 }
    ]
  },
  {
    country: "Turkey",
    types: [
      { name: "Tourist", validity: "90 days", cost: 55, price: 85 }
    ]
  },
  {
    country: "United States of America",
    types: [
      { name: "EVW - Single", validity: "90 days", cost: 25, price: 65 }
    ]
  },
  {
    country: "Kuwait",
    types: [
      { name: "Tourist", validity: "90 days", cost: 10, price: 25 }
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

      // 2. Upsert Types for this Country (manual upsert since no composite unique index exists)
      for (const type of group.types) {
        const { data: existingType, error: fetchErr } = await supabase
          .from('visa_types')
          .select('id')
          .eq('country_id', countryId)
          .ilike('name', type.name)
          .maybeSingle()

        if (fetchErr) {
          logs.push(`Error fetching type ${type.name} for ${group.country}: ${fetchErr.message}`)
          continue
        }

        if (existingType) {
          const { error: updateErr } = await supabase
            .from('visa_types')
            .update({
              name: type.name,
              default_validity: type.validity,
              default_cost: type.cost,
              default_price: type.price
            })
            .eq('id', existingType.id)

          if (updateErr) {
            logs.push(`Error updating type ${type.name} for ${group.country}: ${updateErr.message}`)
          }
        } else {
          const { error: insertErr } = await supabase
            .from('visa_types')
            .insert({
              country_id: countryId,
              name: type.name,
              default_validity: type.validity,
              default_cost: type.cost,
              default_price: type.price
            })

          if (insertErr) {
            logs.push(`Error creating type ${type.name} for ${group.country}: ${insertErr.message}`)
          }
        }
      }
      logs.push(`Processed ${group.country} with ${group.types.length} types.`)
    }

    return NextResponse.json({ success: true, logs })
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
