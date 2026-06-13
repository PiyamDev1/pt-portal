-- Create timeclock_manual_codes table for temporary code storage
CREATE TABLE IF NOT EXISTS timeclock_manual_codes (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE, -- 8-digit numeric code
  device_id UUID NOT NULL REFERENCES timeclock_devices(id),
  qr_payload TEXT NOT NULL, -- Full QR payload for reference
  user_id UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  used_at TIMESTAMP WITH TIME ZONE
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_timeclock_manual_codes_code ON timeclock_manual_codes(code);
CREATE INDEX IF NOT EXISTS idx_timeclock_manual_codes_user_id ON timeclock_manual_codes(user_id);
CREATE INDEX IF NOT EXISTS idx_timeclock_manual_codes_expires_at ON timeclock_manual_codes(expires_at);

-- No RLS needed - access is controlled through API endpoints with proper authentication
ALTER TABLE timeclock_manual_codes DISABLE ROW LEVEL SECURITY;

-- Cleanup: Delete expired codes older than 1 minute (automatic via trigger or manual cleanup)
-- Note: Consider adding a periodic cleanup job or trigger to remove expired codes
