-- Disable RLS on timeclock_manual_codes table
-- Access is controlled through API endpoints with proper authentication
-- Service role operations were being blocked by RLS policies

-- Drop all existing policies
DROP POLICY IF EXISTS "Users can view their own codes" ON timeclock_manual_codes;
DROP POLICY IF EXISTS "Users can insert their own codes" ON timeclock_manual_codes;
DROP POLICY IF EXISTS "Users can delete their own codes" ON timeclock_manual_codes;
DROP POLICY IF EXISTS "Allow all operations for service role" ON timeclock_manual_codes;

-- Disable RLS entirely
ALTER TABLE timeclock_manual_codes DISABLE ROW LEVEL SECURITY;
