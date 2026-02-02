import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
)

async function queryNadra() {
  try {
    const { data, error } = await supabase
      .from('nadra_services')
      .select(`
        id,
        service_type,
        tracking_number,
        nicop_cnic_details (
          service_option
        )
      `)
      .eq('service_type', 'NICOP/CNIC')

    if (error) {
      console.error('Error:', error)
      return
    }

    if (!data || data.length === 0) {
      console.log('No NICOP/CNIC applications found in database')
      process.exit(0)
      return
    }

    let normalCount = 0
    let executiveCount = 0
    let unknownCount = 0

    data.forEach((record: any) => {
      const details = Array.isArray(record.nicop_cnic_details) 
        ? record.nicop_cnic_details[0] 
        : record.nicop_cnic_details

      const option = details?.service_option || 'Unknown'
      
      if (option === 'Normal') normalCount++
      else if (option === 'Executive') executiveCount++
      else unknownCount++
    })

    console.log('\n📊 NADRA NICOP/CNIC Applications Count:\n')
    console.log(`✓ Normal NICOP Applications:     ${normalCount}`)
    console.log(`✓ Executive NICOP Applications: ${executiveCount}`)
    if (unknownCount > 0) {
      console.log(`⚠ Unknown/Unspecified:          ${unknownCount}`)
    }
    console.log(`\nTotal NICOP/CNIC Applications: ${normalCount + executiveCount + unknownCount}`)
    console.log('\n')

  } catch (err: any) {
    console.error('Error:', err.message)
  }
  process.exit(0)
}

queryNadra()
