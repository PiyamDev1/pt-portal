# IMMEDIATE ACTION REQUIRED

## The Problem
Your pricing tables exist but have **incorrect schemas** (missing columns). They need to be dropped and recreated.

## Solution - Execute This SQL Now

I've opened the Supabase SQL Editor for you. Follow these steps:

### Step 1: Copy SQL from File
The SQL is ready in: `scripts/recreate-pricing-tables.sql`

OR copy from terminal output above (between ---SQL START--- and ---SQL END---)

### Step 2: Paste and Run in Supabase
1. Go to the browser tab that just opened
2. Paste the entire SQL
3. Click **RUN** button

### Step 3: Confirm Tables Created
Once you click RUN in Supabase, come back here and run:

```bash
node scripts/setup-direct.js
```

This will seed 81 pricing entries automatically.

---

## What's Happening

**Current State:**
- ❌ nadra_pricing: Table exists but has 0 columns (should have 9)
- ❌ pk_passport_pricing: Table exists but has 0 columns (should have 9)
- ✅ gb_passport_pricing: Table exists with 8 columns (almost correct)
- ❌ visa_pricing: Table does not exist

**After Running SQL:**
- ✅ All 4 tables will be properly created with correct columns
- ✅ Indexes and RLS policies will be set up
- ✅ Ready for seeding 81 pricing entries

## Quick Reference

**SQL File:** `scripts/recreate-pricing-tables.sql`  
**Supabase URL:** https://supabase.com/dashboard/project/ckubfbjfjbhuotyfwmac/sql/new  
**Next Command:** `node scripts/setup-direct.js`
