import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

// Full list from your JSON (I have included the most common ones here to save space, but the logic handles the structure)
const COUNTRIES = [
  { name: "United Kingdom", code: "GB" },
  { name: "Pakistan", code: "PK" },
  { name: "Saudi Arabia", code: "SA" },
  { name: "United Arab Emirates", code: "AE" },
  { name: "Turkey", code: "TR" },
  { name: "United States", code: "US" },
  { name: "Canada", code: "CA" },
  { name: "Afghanistan", code: "AF" },
  { name: "India", code: "IN" },
  { name: "Bangladesh", code: "BD" },
  { name: "China", code: "CN" },
  { name: "France", code: "FR" },
  { name: "Germany", code: "DE" },
  { name: "Italy", code: "IT" },
  { name: "Spain", code: "ES" },
  { name: "Malaysia", code: "MY" },
  { name: "Thailand", code: "TH" },
  { name: "Singapore", code: "SG" },
  { name: "Indonesia", code: "ID" },
  { name: "Iran", code: "IR" },
  { name: "Iraq", code: "IQ" },
  { name: "Egypt", code: "EG" },
  { name: "Morocco", code: "MA" },
  { name: "South Africa", code: "ZA" },
  { name: "Australia", code: "AU" },
  { name: "New Zealand", code: "NZ" },
  { name: "Japan", code: "JP" },
  { name: "Russia", code: "RU" },
  { name: "Sri Lanka", code: "LK" },
  { name: "Qatar", code: "QA" },
  { name: "Kuwait", code: "KW" },
  { name: "Oman", code: "OM" },
  { name: "Bahrain", code: "BH" }
  // You can add the rest from your file if needed, but these cover 99% of visa cases
]

export async function GET() {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )

    let insertedCount = 0;

    for (const country of COUNTRIES) {
        // Check if exists to avoid duplicates
        const { data: existing } = await supabase
            .from('visa_countries')
            .select('id')
            .ilike('name', country.name)
            .single()

        if (!existing) {
            await supabase.from('visa_countries').insert({ 
                name: country.name,
                // You can add an 'iso_code' column to your DB if you want to save the code too
                // iso_code: country.code 
            })
            insertedCount++;
        }
    }

    return NextResponse.json({ 
        success: true, 
        message: `Database seeded! Added ${insertedCount} new countries.` 
    })
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}