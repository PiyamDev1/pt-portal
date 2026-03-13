import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )

    // nadra_pricing is the source of truth for which types/options actually exist.
    // nadra_service_types gives us the full canonical type list (including types
    // that may not have pricing rows yet).
    const { data: pricingRows, error: pricingError } = await supabase
      .from('nadra_pricing')
      .select('id, service_type, service_option, cost_price, sale_price')
      .eq('is_active', true)
      .order('service_type')
      .order('service_option')

    if (pricingError) throw pricingError

    const rows = pricingRows || []

    // Only show types that have at least one active pricing row.
    // Types in the lookup table with no pricing (e.g. POLICE VERIFICATION, FAMILY REGISTRATION)
    // are intentionally excluded — they are not operational yet.
    const allTypeNames = [...new Set(rows.map(r => r.service_type).filter(Boolean))].sort()

    // Build serviceTypes array — use name as id since nadra_services stores plain text
    const serviceTypes = allTypeNames.map(name => ({ id: name, name }))

    // Build serviceOptions array from pricing rows
    // Use "type||option" as a stable synthetic id
    const seen = new Set()
    const serviceOptions = []
    rows.forEach(r => {
      if (!r.service_option) return
      const key = r.service_type + '||' + r.service_option
      if (seen.has(key)) return
      seen.add(key)
      serviceOptions.push({
        id: key,
        name: r.service_option,
        service_type_id: r.service_type  // name-based reference matches serviceTypes[].id
      })
    })

    // Flatten pricing for frontend lookup
    const pricing = rows.map(r => ({
      id: r.id,
      cost: r.cost_price,
      price: r.sale_price,
      serviceType: r.service_type,
      serviceOption: r.service_option || null
    }))

    return NextResponse.json(
      { serviceTypes, serviceOptions, pricing }
    )

  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
