-- Complete Timeclock Tables Setup
-- Run this script to create all required tables for manual entry timeclock

-- 1. Create timeclock_devices table (if it doesn't exist)
CREATE TABLE IF NOT EXISTS timeclock_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  secret TEXT NOT NULL, -- HMAC secret for QR code signing
  device_type TEXT NOT NULL DEFAULT 'physical' CHECK (device_type IN ('physical', 'virtual')),
  location TEXT,
  location_id UUID REFERENCES locations(id) ON DELETE SET NULL,
  qr_interval_sec INTEGER NOT NULL DEFAULT 30 CHECK (qr_interval_sec BETWEEN 5 AND 300),
  is_active BOOLEAN DEFAULT true,
  last_seen_at TIMESTAMP WITH TIME ZONE,
  firmware_version TEXT,
  ip TEXT,
  wifi_rssi INTEGER,
  free_heap BIGINT,
  uptime_sec BIGINT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for active devices
CREATE INDEX IF NOT EXISTS idx_timeclock_devices_active ON timeclock_devices(is_active);

-- Secrets are available only to service-role API routes.
ALTER TABLE timeclock_devices ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE timeclock_devices FROM anon, authenticated;
GRANT ALL PRIVILEGES ON TABLE timeclock_devices TO service_role;

-- 2. Create timeclock_manual_codes table (if it doesn't exist)
CREATE TABLE IF NOT EXISTS timeclock_manual_codes (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE, -- 8-digit numeric code
  device_id UUID NOT NULL REFERENCES timeclock_devices(id) ON DELETE CASCADE,
  qr_payload TEXT NOT NULL, -- Full QR payload for reference
  user_id UUID, -- Null for physical-device generated codes
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  used_at TIMESTAMP WITH TIME ZONE
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_timeclock_manual_codes_code ON timeclock_manual_codes(code);
CREATE INDEX IF NOT EXISTS idx_timeclock_manual_codes_user_id ON timeclock_manual_codes(user_id);
CREATE INDEX IF NOT EXISTS idx_timeclock_manual_codes_expires_at ON timeclock_manual_codes(expires_at);

-- Manual codes are available only to service-role API routes.
ALTER TABLE timeclock_manual_codes ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE timeclock_manual_codes FROM anon, authenticated;
GRANT ALL PRIVILEGES ON TABLE timeclock_manual_codes TO service_role;

CREATE TABLE IF NOT EXISTS timeclock_device_request_nonces (
  device_id UUID NOT NULL REFERENCES timeclock_devices(id) ON DELETE CASCADE,
  nonce TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  PRIMARY KEY (device_id, nonce)
);

CREATE TABLE IF NOT EXISTS timeclock_qr_nonces (
  device_id UUID NOT NULL REFERENCES timeclock_devices(id) ON DELETE CASCADE,
  nonce TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  PRIMARY KEY (device_id, nonce)
);

CREATE TABLE IF NOT EXISTS timeclock_device_manual_code_limits (
  device_id UUID PRIMARY KEY REFERENCES timeclock_devices(id) ON DELETE CASCADE,
  next_allowed_at TIMESTAMP WITH TIME ZONE NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

ALTER TABLE timeclock_device_request_nonces ENABLE ROW LEVEL SECURITY;
ALTER TABLE timeclock_qr_nonces ENABLE ROW LEVEL SECURITY;
ALTER TABLE timeclock_device_manual_code_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE timeclock_device_request_nonces FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE timeclock_qr_nonces FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE timeclock_device_manual_code_limits FROM anon, authenticated;
GRANT ALL PRIVILEGES ON TABLE timeclock_device_request_nonces TO service_role;
GRANT ALL PRIVILEGES ON TABLE timeclock_qr_nonces TO service_role;
GRANT ALL PRIVILEGES ON TABLE timeclock_device_manual_code_limits TO service_role;

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

REVOKE EXECUTE ON FUNCTION cleanup_expired_manual_codes() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION cleanup_expired_manual_codes() TO service_role;

-- Success message
DO $$
BEGIN
  RAISE NOTICE 'Timeclock tables created successfully!';
  RAISE NOTICE 'Tables: timeclock_devices, timeclock_manual_codes';
  RAISE NOTICE 'RLS: Enabled; anon/authenticated privileges revoked';
END $$;
