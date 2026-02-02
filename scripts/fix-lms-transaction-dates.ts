import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/**
 * Fix transaction dates that were incorrectly set to "today" instead of the intended date
 * 
 * Usage:
 * 1. Find the transaction ID you want to fix
 * 2. Run: npx tsx scripts/fix-lms-transaction-dates.ts <transaction-id> <correct-date>
 * 
 * Example:
 * npx tsx scripts/fix-lms-transaction-dates.ts abc123-def456 2026-01-15
 */

async function fixTransactionDate(transactionId: string, correctDate: string) {
  console.log(`\n🔧 Fixing transaction ${transactionId} to date ${correctDate}...\n`)

  // Validate date format (YYYY-MM-DD)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(correctDate)) {
    console.error('❌ Invalid date format. Use YYYY-MM-DD (e.g., 2026-01-15)')
    process.exit(1)
  }

  // Check if transaction exists
  const { data: transaction, error: fetchError } = await supabase
    .from('loan_transactions')
    .select('*')
    .eq('id', transactionId)
    .single()

  if (fetchError || !transaction) {
    console.error('❌ Transaction not found:', transactionId)
    console.error(fetchError)
    process.exit(1)
  }

  console.log('Current transaction:')
  console.table({
    ID: transaction.id,
    Type: transaction.transaction_type,
    Amount: transaction.amount,
    'Current Date': new Date(transaction.transaction_timestamp).toISOString().split('T')[0],
    'New Date': correctDate
  })

  // Update the transaction date
  const { error: updateError } = await supabase
    .from('loan_transactions')
    .update({
      transaction_timestamp: new Date(correctDate).toISOString()
    })
    .eq('id', transactionId)

  if (updateError) {
    console.error('❌ Error updating transaction:', updateError)
    process.exit(1)
  }

  console.log('\n✅ Transaction date updated successfully!')
  console.log(`   From: ${new Date(transaction.transaction_timestamp).toISOString().split('T')[0]}`)
  console.log(`   To:   ${correctDate}`)
}

async function listRecentTransactions() {
  console.log('\n📋 Recent transactions (last 20):\n')

  const { data: transactions, error } = await supabase
    .from('loan_transactions')
    .select(`
      id,
      transaction_type,
      amount,
      transaction_timestamp,
      loan_customers!inner(first_name, last_name)
    `)
    .order('transaction_timestamp', { ascending: false })
    .limit(20)

  if (error) {
    console.error('❌ Error fetching transactions:', error)
    return
  }

  transactions?.forEach((tx: any) => {
    const customer = tx.loan_customers
    const date = new Date(tx.transaction_timestamp).toISOString().split('T')[0]
    console.log(`${tx.id.substring(0, 8)}... | ${date} | ${tx.transaction_type.padEnd(8)} | £${tx.amount.toFixed(2).padStart(8)} | ${customer.first_name} ${customer.last_name}`)
  })

  console.log('\n💡 To fix a transaction date, run:')
  console.log('   npx tsx scripts/fix-lms-transaction-dates.ts <transaction-id> <correct-date>')
  console.log('   Example: npx tsx scripts/fix-lms-transaction-dates.ts abc123 2026-01-15\n')
}

// Main execution
const args = process.argv.slice(2)

if (args.length === 0) {
  listRecentTransactions()
} else if (args.length === 2) {
  const [transactionId, correctDate] = args
  fixTransactionDate(transactionId, correctDate)
} else {
  console.error('\n❌ Invalid arguments')
  console.log('\nUsage:')
  console.log('  List recent transactions:')
  console.log('    npx tsx scripts/fix-lms-transaction-dates.ts')
  console.log('\n  Fix a transaction date:')
  console.log('    npx tsx scripts/fix-lms-transaction-dates.ts <transaction-id> <correct-date>')
  console.log('    Example: npx tsx scripts/fix-lms-transaction-dates.ts abc123-def456 2026-01-15\n')
  process.exit(1)
}
