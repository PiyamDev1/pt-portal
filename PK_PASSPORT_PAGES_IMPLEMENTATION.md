# PK Passport Pages Support - Implementation Complete

## Summary
Added support for different page counts (34, 50, 72, 100 pages) to PK Passport pricing system, matching the GB Passport structure.

## What Changed

### 1. Database Schema Updates (⚠️ REQUIRES SQL EXECUTION)
**File:** `/workspaces/pt-portal/scripts/migrations/add-pk-passport-pages.sql`

**You need to run this SQL in Supabase SQL Editor:**
```sql
-- Creates pk_passport_pages lookup table
-- Adds 'pages' column to pk_passport_pricing table
-- Inserts default page options: 34, 50, 72, 100 pages
-- Sets default value '34 pages' for existing records
```

### 2. TypeScript Types
**File:** `/workspaces/pt-portal/app/types/pricing.ts`
- Added `pages: string` field to `PKPassportPricing` interface

### 3. Pricing Management Tab
**File:** `/workspaces/pt-portal/app/dashboard/settings/components/pricing/PKPassportPricingTab.tsx`
- Added Pages dropdown to the "Add New" form (4 columns now: Category, Speed, Application Type, Pages)
- Added Pages column to pricing table
- Updated validation to require Pages selection
- Updated new entry state to include pages field

### 4. Service Pricing Tab (Parent)
**File:** `/workspaces/pt-portal/app/dashboard/settings/components/ServicePricingTab.tsx`
- Added `pkPages` state for storing page options
- Updated `fetchPkLookupOptions()` to query `pk_passport_pages` table
- Updated `handleAddPKEntry()` to include pages field when inserting
- Passed `pages` prop to PKPassportPricingTab component

### 5. Metadata API
**File:** `/workspaces/pt-portal/app/api/passports/pak/metadata/route.js`
- Added query for `pk_passport_pages` lookup table
- Included `pages` field in pricing query
- Added `pageCounts` to API response
- Included `pages` in flatPricing objects

## How It Works Now

### Pricing Management Flow:
1. Admin loads "Settings > Pricing Management > PK Passport" tab
2. System fetches page options from `pk_passport_pages` lookup table
3. "Add New" form shows 4 dropdowns: Category, Speed, Application Type, **Pages**
4. Admin selects all 4 fields + enters cost/sale prices
5. System saves to `pk_passport_pricing` table with pages value
6. Pricing table displays all fields including Pages column

### Application Form Flow:
1. User opens PK Passport application form
2. Form fetches metadata from `/api/passports/pak/metadata`
3. API returns `pageCounts` array from `pk_passport_pages` table
4. Form renders pageCount dropdown with database-driven options
5. User selects page count (e.g., "72 pages")
6. Price calculated based on category + speed + application_type + **pages** combination

## Current Pricing Structure

### Before:
- Category (Adult 10 Year, Adult 5 Year, Child 5 Year)
- Speed (Normal, Executive)
- Application Type (First Time, Renewal, Modification, Lost)
- **All assumed 34 pages standard**

### After:
- Category (Adult 10 Year, Adult 5 Year, Child 5 Year)
- Speed (Normal, Executive)  
- Application Type (First Time, Renewal, Modification, Lost)
- **Pages (34 pages, 50 pages, 72 pages, 100 pages)** ✅

## Required Action

**⚠️ You must run the SQL migration before the app will work:**

1. Go to Supabase Dashboard → SQL Editor
2. Copy contents of `/workspaces/pt-portal/scripts/migrations/add-pk-passport-pages.sql`
3. Execute the SQL
4. Verify:
   - `pk_passport_pages` table created with 4 page options
   - `pk_passport_pricing` table has new `pages` column (default '34 pages')

## Adding New Pricing Entries

After running the migration, you can add pricing for different page counts:

**Example entries you might add:**
- Adult 10 Year | Normal | Renewal | **50 pages** | £100 | £150
- Adult 10 Year | Normal | Renewal | **72 pages** | £110 | £165
- Adult 10 Year | Normal | Renewal | **100 pages** | £120 | £180
- Child 5 Year | Normal | First Time | **50 pages** | £90 | £135
- etc.

**Note:** All existing pricing records will have '34 pages' as default value.

## Database Consistency

✅ **GB Passports** have pages support (gb_passport_pages table)
✅ **PK Passports** now have pages support (pk_passport_pages table)

Both systems now use the same pattern:
- Lookup tables for all dropdown options
- Pricing tables with TEXT columns matching lookup values
- Metadata APIs returning database-driven options
- Forms rendering options dynamically from API

## Files Modified

1. `/workspaces/pt-portal/app/types/pricing.ts`
2. `/workspaces/pt-portal/app/dashboard/settings/components/pricing/PKPassportPricingTab.tsx`
3. `/workspaces/pt-portal/app/dashboard/settings/components/ServicePricingTab.tsx`
4. `/workspaces/pt-portal/app/api/passports/pak/metadata/route.js`

## Files Created

1. `/workspaces/pt-portal/scripts/migrations/add-pk-passport-pages.sql` (SQL migration)
2. `/workspaces/pt-portal/scripts/add-pk-passport-pages.ts` (TypeScript attempt - not used)
