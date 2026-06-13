-- Complete Timeclock Tables Setup
-- Run this script to create all required tables for manual entry timeclock

-- 1. Create timeclock_devices table (if it doesn't exist)
CREATE TABLE IF NOT EXISTS timeclock_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  secret TEXT NOT NULL, -- HMAC secret for QR code signing
  location TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for active devices
CREATE INDEX IF NOT EXISTS idx_timeclock_devices_active ON timeclock_devices(is_active);

-- No RLS on devices table - controlled at API level
ALTER TABLE timeclock_devices DISABLE ROW LEVEL SECURITY;

-- 2. Create timeclock_manual_codes table (if it doesn't exist)
CREATE TABLE IF NOT EXISTS timeclock_manual_codes (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE, -- 8-digit numeric code
  device_id UUID NOT NULL REFERENCES timeclock_devices(id) ON DELETE CASCADE,
  qr_payload TEXT NOT NULL, -- Full QR payload for reference
  user_id UUID NOT NULL, -- References auth.users(id) but no FK to avoid issues
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  used_at TIMESTAMP WITH TIME ZONE
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_timeclock_manual_codes_code ON timeclock_manual_codes(code);
CREATE INDEX IF NOT EXISTS idx_timeclock_manual_codes_user_id ON timeclock_manual_codes(user_id);
CREATE INDEX IF NOT EXISTS idx_timeclock_manual_codes_expires_at ON timeclock_manual_codes(expires_at);

-- No RLS - access controlled at API level
ALTER TABLE timeclock_manual_codes DISABLE ROW LEVEL SECURITY;

-- 3. Drop any existing restrictive policies
DROP POLICY IF EXISTS "Users can view their own codes" ON timeclock_manual_codes;
DROP POLICY IF EXISTS "Users can insert their own codes" ON timeclock_manual_codes;
DROP POLICY IF EXISTS "Users can delete their own codes" ON timeclock_manual_codes;

-- 4. Optional: Function to clean up expired codes (run periodically)
CREATE OR REPLACE FUNCTION cleanup_expired_manual_codes()
RETURNS void AS $$
BEGIN
  DELETE FROM timeclock_manual_codes
  WHERE expires_at < NOW() - INTERVAL '5 minutes';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Success message
DO $$
BEGIN
  RAISE NOTICE 'Timeclock tables created successfully!';
  RAISE NOTICE 'Tables: timeclock_devices, timeclock_manual_codes';
  RAISE NOTICE 'RLS: Disabled on both tables (API-level control)';
END $$;
