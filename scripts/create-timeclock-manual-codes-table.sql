-- Create timeclock_manual_codes table for temporary code storage
CREATE TABLE IF NOT EXISTS timeclock_manual_codes (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE, -- 8-digit numeric code
  device_id TEXT NOT NULL REFERENCES timeclock_devices(id),
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

-- RLS: Only managers/admins can see their own codes
ALTER TABLE timeclock_manual_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own codes" ON timeclock_manual_codes
  FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own codes" ON timeclock_manual_codes
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete their own codes" ON timeclock_manual_codes
  FOR DELETE
  USING (user_id = auth.uid());

-- Cleanup: Delete expired codes older than 1 minute (automatic via trigger or manual cleanup)
-- Note: Consider adding a periodic cleanup job or trigger to remove expired codes
