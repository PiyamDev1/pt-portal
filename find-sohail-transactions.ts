import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function findTransactions() {
  // Find customer Sohail Khalil
  const { data: customer } = await supabase
    .from('loan_customers')
    .select('id, first_name, last_name')
    .ilike('first_name', 'Sohail')
    .ilike('last_name', 'Khalil')
    .single()

  if (!customer) {
    console.log('Customer not found')
    return
  }

  console.log(`Found customer: ${customer.first_name} ${customer.last_name} (${customer.id})`)

  // Get their loans
  const { data: loans } = await supabase
    .from('loans')
    .select('id')
    .eq('loan_customer_id', customer.id)

  const loanIds = loans?.map(l => l.id) || []

  // Get transactions
  const { data: transactions } = await supabase
    .from('loan_transactions')
    .select('*')
    .in('loan_id', loanIds)
    .order('transaction_timestamp', { ascending: false })

  console.log('\nTransactions:')
  transactions?.forEach(tx => {
    const date = new Date(tx.transaction_timestamp).toISOString().split('T')[0]
    console.log(`${tx.id} | ${date} | ${tx.transaction_type.padEnd(8)} | £${tx.amount}`)
  })
}

findTransactions()
