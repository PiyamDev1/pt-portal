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

-- Manual codes are available only to service-role API routes.
ALTER TABLE timeclock_manual_codes ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE timeclock_manual_codes FROM anon, authenticated;
GRANT ALL PRIVILEGES ON TABLE timeclock_manual_codes TO service_role;

-- Cleanup: Delete expired codes older than 1 minute (automatic via trigger or manual cleanup)
-- Note: Consider adding a periodic cleanup job or trigger to remove expired codes
