import { createClient } from '@supabase/supabase-js'

// Read from .env.local file
const fs = require('fs')
const path = require('path')
const envPath = path.join(__dirname, '.env.local')
const envFile = fs.readFileSync(envPath, 'utf8')
const envVars: any = {}
envFile.split('\n').forEach((line: string) => {
  const [key, ...valueParts] = line.split('=')
  if (key && valueParts.length) {
    envVars[key.trim()] = valueParts.join('=').trim()
  }
})

const supabase = createClient(
  envVars.NEXT_PUBLIC_SUPABASE_URL,
  envVars.SUPABASE_SERVICE_ROLE_KEY
)

async function fixDates() {
  // Find Sohail Khalil
  const { data: customer } = await supabase
    .from('loan_customers')
    .select('id')
    .ilike('first_name', 'Sohail')
    .ilike('last_name', 'Khalil')
    .single()

  if (!customer) {
    console.log('Customer not found')
    return
  }

  // Get loans
  const { data: loans } = await supabase
    .from('loans')
    .select('id')
    .eq('loan_customer_id', customer.id)

  const loanIds = loans?.map(l => l.id) || []

  // Get fee transactions (showing as 02/02/2026)
  const { data: transactions } = await supabase
    .from('loan_transactions')
    .select('*')
    .in('loan_id', loanIds)
    .eq('transaction_type', 'fee')
    .order('amount', { ascending: false })

  if (!transactions || transactions.length === 0) {
    console.log('No fee transactions found')
    return
  }

  console.log('Found transactions to fix:\n')
  transactions.forEach(tx => {
    console.log(`${tx.id} | £${tx.amount} | ${new Date(tx.transaction_timestamp).toISOString().split('T')[0]}`)
  })

  // Update based on amounts
  // £2003 -> 2025-11-03
  // £250 -> 2025-11-26
  // £40 -> 2025-11-26
  // £150 -> 2026-01-30

  const updates = [
    { amount: 2003, date: '2025-11-03' },
    { amount: 250, date: '2025-11-26' },
    { amount: 40, date: '2025-11-26' },
    { amount: 150, date: '2026-01-30' }
  ]

  for (const update of updates) {
    const tx = transactions.find(t => t.amount === update.amount)
    if (tx) {
      console.log(`\nUpdating £${update.amount} to ${update.date}...`)
      const { error } = await supabase
        .from('loan_transactions')
        .update({ transaction_timestamp: new Date(update.date).toISOString() })
        .eq('id', tx.id)
      
      if (error) {
        console.error('Error:', error)
      } else {
        console.log('✅ Updated successfully')
      }
    } else {
      console.log(`❌ Transaction with £${update.amount} not found`)
    }
  }

  console.log('\n✅ All dates fixed!')
}

fixDates()
