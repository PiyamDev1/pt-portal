const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const supabase = createClient(supabaseUrl, supabaseKey)

async function createNotesTable() {
  console.log('Creating loan_account_notes table...')

  const { data, error } = await supabase.rpc('exec_sql', {
    sql_query: `
      -- Create loan_account_notes table
      CREATE TABLE IF NOT EXISTS loan_account_notes (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        loan_customer_id UUID NOT NULL REFERENCES loan_customers(id) ON DELETE CASCADE,
        note TEXT NOT NULL,
        created_by UUID NOT NULL REFERENCES employees(id),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );

      -- Create indexes for faster queries
      CREATE INDEX IF NOT EXISTS idx_loan_account_notes_customer_id ON loan_account_notes(loan_customer_id);
      CREATE INDEX IF NOT EXISTS idx_loan_account_notes_created_at ON loan_account_notes(created_at DESC);
    `
  })

  if (error) {
    console.error('Error creating table:', error)
  } else {
    console.log('✓ Table created successfully!')
  }
}

createNotesTable()
