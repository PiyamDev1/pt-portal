-- Migration: Add pages support to PK Passport pricing system
-- Run this SQL in your Supabase SQL Editor

-- Step 1: Create pk_passport_pages lookup table
CREATE TABLE IF NOT EXISTS pk_passport_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  option_label TEXT NOT NULL UNIQUE,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Step 2: Insert page options
INSERT INTO pk_passport_pages (option_label) VALUES
  ('34 pages'),
  ('50 pages'),
  ('72 pages'),
  ('100 pages')
ON CONFLICT (option_label) DO NOTHING;

-- Step 3: Add pages column to pk_passport_pricing table
ALTER TABLE pk_passport_pricing 
ADD COLUMN IF NOT EXISTS pages TEXT DEFAULT '34 pages';

-- Step 4: Verify the changes
SELECT id, category, speed, application_type, pages, cost_price, sale_price 
FROM pk_passport_pricing 
LIMIT 5;
