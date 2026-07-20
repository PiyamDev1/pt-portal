-- Restrict timeclock_manual_codes to server-side service-role access.

-- Drop all existing policies
DROP POLICY IF EXISTS "Users can view their own codes" ON timeclock_manual_codes;
DROP POLICY IF EXISTS "Users can insert their own codes" ON timeclock_manual_codes;
DROP POLICY IF EXISTS "Users can delete their own codes" ON timeclock_manual_codes;
DROP POLICY IF EXISTS "Allow all operations for service role" ON timeclock_manual_codes;

ALTER TABLE timeclock_manual_codes ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE timeclock_manual_codes FROM anon, authenticated;
GRANT ALL PRIVILEGES ON TABLE timeclock_manual_codes TO service_role;
