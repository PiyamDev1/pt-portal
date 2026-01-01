import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

// Mapped from your countries.json structure
const COUNTRIES_DATA = [
  { name: "Afghanistan", code: "AF" },
  { name: "Albania", code: "AL" },
  { name: "Algeria", code: "DZ" },
  { name: "United Kingdom", code: "GB" },
  { name: "United States", code: "US" },
  { name: "Saudi Arabia", code: "SA" },
  { name: "United Arab Emirates", code: "AE" },
  { name: "Turkey", code: "TR" },
  { name: "Pakistan", code: "PK" },
  { name: "India", code: "IN" },
  { name: "Canada", code: "CA" },
  { name: "Australia", code: "AU" },
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
  { name: "Japan", code: "JP" },
  { name: "Russia", code: "RU" },
  { name: "Sri Lanka", code: "LK" },
  { name: "Qatar", code: "QA" },
  { name: "Kuwait", code: "KW" },
  { name: "Oman", code: "OM" },
  { name: "Bahrain", code: "BH" }
  // Add more if needed or parse the full JSON in a loop
]

export async function GET() {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )

    let inserted = 0

    for (const c of COUNTRIES_DATA) {
      const { error } = await supabase
        .from('visa_countries')
        .upsert(
          { name: c.name, code: c.code },
          { onConflict: 'name' }
        )

      if (!error) inserted++
    }

    return NextResponse.json({ success: true, message: `Seeded ${inserted} countries` })
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}