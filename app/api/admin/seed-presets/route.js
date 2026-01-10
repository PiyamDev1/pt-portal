import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// HELPER: Define EU Countries once
// Note: User specified UK is included in EU for these visas
const EU_COUNTRIES = [
  "Austria", "Belgium", "Bulgaria", "Croatia", "Cyprus", "Czech Republic", 
  "Denmark", "Estonia", "Finland", "France", "Germany", "Greece", "Hungary", 
  "Ireland", "Italy", "Latvia", "Lithuania", "Luxembourg", "Malta", 
  "Netherlands", "Poland", "Portugal", "Romania", "Slovakia", "Slovenia", 
  "Spain", "Sweden", "United Kingdom"
]

const PRESETS = [
  {
    country: "Kingdom of Saudi Arabia",
    types: [
      { name: "EVW - Single Entry", validity: "90 Days", cost: 32, price: 65, nationalities: ["United Kingdom"] },
      { name: "Multiple Entry 1yr", validity: "12 Months", cost: 80, price: 125, nationalities: [...EU_COUNTRIES, "United States", "Canada", "Australia"] },
      { name: "Umrah - Single Entry (Pakistani)", validity: "30 Days", cost: 155, price: 235, nationalities: ["Pakistan"] },
      { name: "Umrah - Single Entry (Indian/Bangladeshi)", validity: "30 Days", cost: 165, price: 245, nationalities: ["India", "Bangladesh"] }
    ]
  },
  {
    country: "Pakistan",
    types: [
      { name: "Tourist", validity: "90 Days", cost: 45, price: 85, nationalities: ["Any"] },
      { name: "Family (90 Days)", validity: "90 Days", cost: 45, price: 85, nationalities: ["Any"] },
      { name: "Family (12 Months)", validity: "12 Months", cost: 68, price: 125, nationalities: ["Any"] },
      { name: "Family (12+ Months)", validity: "12+ Months", cost: 90, price: 165, nationalities: ["Any"] }
    ]
  },
  {
    country: "Schengen Area", 
    types: [
      { name: "Schengen Visa (Application Fill)", validity: "N/A", cost: 0, price: 65, nationalities: ["Any"] }
    ]
  },
  {
    country: "United Kingdom",
    types: [
      { name: "BRP - Evisa", validity: "N/A", cost: 0, price: 45, nationalities: ["Any"] },
      { name: "NTL", validity: "N/A", cost: 0, price: 125, nationalities: ["Any"] },
      { name: "Spouse - Application Only", validity: "30 Months", cost: 395, price: 0, nationalities: ["Any"] },
      { name: "Visitor (6 Months)", validity: "6 Months", cost: 0, price: 295, nationalities: ["Any"] },
      { name: "Visitor (24 Months)", validity: "24 Months", cost: 0, price: 295, nationalities: ["Any"] }
    ]
  },
  {
    country: "Iran",
    types: [
      { name: "Tourist (UK Nationals)", validity: "30 Days", cost: 220, price: 245, nationalities: ["United Kingdom"] },
      { name: "Tourist (Pakistani)", validity: "30 Days", cost: 165, price: 195, nationalities: ["Pakistan"] },
      { name: "Tourist (Travel Document)", validity: "30 Days", cost: 175, price: 220, nationalities: ["Travel Document"] }
    ]
  },
  {
    country: "Iraq",
    types: [
      { name: "Red - Single Entry (EU)", validity: "60 Days", cost: 105, price: 135, nationalities: EU_COUNTRIES },
      { name: "Green - Single Entry (Pak/Ind/Ban)", validity: "60 Days", cost: 105, price: 135, nationalities: ["Pakistan", "Bangladesh", "India"] }
    ]
  },
  {
    country: "Turkey",
    types: [
      { name: "Tourist", validity: "90 Days", cost: 55, price: 85, nationalities: ["Pakistan", "India", "Bangladesh"] }
    ]
  },
  {
    country: "United States", 
    types: [
      { name: "EVW - Single", validity: "90 Days", cost: 25, price: 65, nationalities: [...EU_COUNTRIES, "Australia"] }
    ]
  },
  {
    country: "Kuwait",
    types: [
      { name: "Tourist", validity: "90 Days", cost: 10, price: 25, nationalities: EU_COUNTRIES }
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

    // Optional: Clear old types to ensure clean slate? 
    // Uncomment next line if you want to wipe before seeding
    // await supabase.from('visa_types').delete().neq('id', '00000000-0000-0000-0000-000000000000');

    for (const group of PRESETS) {
      // 1. Create/Find Country
      let countryId = null
      const { data: existingCountry } = await supabase
        .from('visa_countries')
        .select('id')
        .ilike('name', group.country)
        .maybeSingle()

      if (existingCountry) {
        countryId = existingCountry.id
      } else {
        const { data: newCountry } = await supabase.from('visa_countries').insert({ name: group.country }).select('id').single()
        countryId = newCountry.id
      }

      // 2. Create/Update Types with Nationalities
      for (const type of group.types) {
        const { error } = await supabase
          .from('visa_types')
          .upsert({
             country_id: countryId,
             name: type.name,
             default_validity: type.validity,
             default_cost: type.cost,
             default_price: type.price,
             allowed_nationalities: type.nationalities // <--- New Field
          }, { onConflict: 'country_id, name' })

        if (error) logs.push(`Error: ${group.country} - ${type.name}: ${error.message}`)
        else logs.push(`Synced: ${group.country} - ${type.name}`)
      }
    }

    return NextResponse.json({ success: true, logs })
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
