# Manual Entry Timeclock Fix

## Issue
The `/timeclock/manual-entry` page returns a 500 error when trying to generate codes.

## Root Cause
The `timeclock_manual_codes` table either:
1. Doesn't exist in the database, OR
2. Has RLS (Row Level Security) enabled with policies that block service role operations

## Solution

Run this SQL script in your Supabase SQL Editor:

```sql
-- Step 1: Check if table exists
SELECT EXISTS (
  SELECT FROM information_schema.tables 
  WHERE table_schema = 'public' 
  AND table_name = 'timeclock_manual_codes'
);

-- Step 2: If table doesn't exist, create it
-- Run: scripts/create-timeclock-manual-codes-table.sql

-- Step 3: If table exists but RLS is causing issues, disable RLS
-- Run: scripts/fix-timeclock-manual-codes-rls.sql
```

### Quick Fix (Copy and paste into Supabase SQL Editor):

```sql
-- Disable RLS on timeclock_manual_codes
ALTER TABLE IF EXISTS timeclock_manual_codes DISABLE ROW LEVEL SECURITY;

-- Drop any blocking policies
DROP POLICY IF EXISTS "Users can view their own codes" ON timeclock_manual_codes;
DROP POLICY IF EXISTS "Users can insert their own codes" ON timeclock_manual_codes;
DROP POLICY IF EXISTS "Users can delete their own codes" ON timeclock_manual_codes;
```

## Files Involved

- `/app/api/timeclock/manual-entry/generate/route.ts` - API endpoint
- `/scripts/create-timeclock-manual-codes-table.sql` - Table creation script
- `/scripts/fix-timeclock-manual-codes-rls.sql` - RLS fix script

## After Running the Fix

1. Refresh the `/timeclock/manual-entry` page
2. Click "Generate Code"
3. You should see an 8-digit numeric code and QR code

## Why RLS is Disabled

The `timeclock_manual_codes` table stores temporary codes (30-second expiry) used for manual timeclock entry. Access control is handled at the API level:
- Only managers and Master Admins can access `/timeclock/manual-entry` page
- API endpoints check user permissions before allowing code generation
- RLS would redundantly block service role operations needed for cleanup and expiry

Therefore, RLS is disabled on this table for operational simplicity.
