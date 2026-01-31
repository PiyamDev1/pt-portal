-- Create loan_account_notes table
CREATE TABLE IF NOT EXISTS loan_account_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_customer_id UUID NOT NULL REFERENCES loan_customers(id) ON DELETE CASCADE,
  note TEXT NOT NULL,
  created_by UUID NOT NULL REFERENCES employees(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_loan_account_notes_customer_id ON loan_account_notes(loan_customer_id);
CREATE INDEX IF NOT EXISTS idx_loan_account_notes_created_at ON loan_account_notes(created_at DESC);

-- Add RLS policies (if using Row Level Security)
ALTER TABLE loan_account_notes ENABLE ROW LEVEL SECURITY;

-- Policy: Allow all authenticated users to read notes
CREATE POLICY "Allow authenticated users to read notes"
  ON loan_account_notes
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- Policy: Allow authenticated users to insert notes
CREATE POLICY "Allow authenticated users to insert notes"
  ON loan_account_notes
  FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- Policy: Allow users to delete their own notes (or all notes for admins)
CREATE POLICY "Allow users to delete notes"
  ON loan_account_notes
  FOR DELETE
  USING (auth.role() = 'authenticated');
