# Manual Entry Timeclock Fix

## Issue
The `/timeclock/manual-entry` page returns a 500 error when trying to generate codes.

## Root Causes
1. Missing `timeclock_devices` table
2. Missing `timeclock_manual_codes` table
3. RLS (Row Level Security) policies blocking service role operations

## Quick Diagnosis

Visit this URL to check your setup:
```
https://ims.piyamtravel.com/api/timeclock/manual-entry/diagnostics
```

This will show:
- ✅ Table existence checks
- ✅ Permission checks
- ✅ Test insert operations
- ❌ Any errors with details

## Complete Fix

### Option 1: Use the Comprehensive Setup Script (RECOMMENDED)

Run this script in your **Supabase SQL Editor**:

Copy the entire contents of: [`scripts/create-timeclock-tables.sql`](scripts/create-timeclock-tables.sql)

This will:
- Create `timeclock_devices` table
- Create `timeclock_manual_codes` table
- Disable RLS on both tables
- Drop any blocking policies
- Set up cleanup functions

### Option 2: Quick Manual Fix

If you already have the tables, just disable RLS:

```sql
-- Disable RLS on both tables
ALTER TABLE IF EXISTS timeclock_devices DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS timeclock_manual_codes DISABLE ROW LEVEL SECURITY;

-- Drop any blocking policies
DROP POLICY IF EXISTS "Users can view their own codes" ON timeclock_manual_codes;
DROP POLICY IF EXISTS "Users can insert their own codes" ON timeclock_manual_codes;
DROP POLICY IF EXISTS "Users can delete their own codes" ON timeclock_manual_codes;
```

## After Running the Fix

1. Visit the diagnostics URL to verify everything is working: `/api/timeclock/manual-entry/diagnostics`
2. Refresh the `/timeclock/manual-entry` page
3. Click "Generate Code"
4. You should see an 8-digit numeric code and QR code

## Files Involved

- `/app/api/timeclock/manual-entry/generate/route.ts` - API endpoint
- `/app/api/timeclock/manual-entry/diagnostics/route.ts` - Diagnostics endpoint (NEW)
- `/scripts/create-timeclock-tables.sql` - Complete table setup (NEW)
- `/scripts/create-timeclock-manual-codes-table.sql` - Manual codes table only
- `/scripts/fix-timeclock-manual-codes-rls.sql` - RLS fix script

## Why RLS is Disabled

The `timeclock_manual_codes` and `timeclock_devices` tables store temporary data accessed only through authenticated API endpoints. Access control is handled at the API level:
- Only managers and Master Admins can access `/timeclock/manual-entry` page
- API endpoints check user permissions before allowing code generation
- Codes expire in 30 seconds
- RLS would redundantly block service role operations needed for cleanup and expiry

Therefore, RLS is disabled on these tables for operational simplicity.
