-- Create auth_codes table for temporary authentication codes
-- Used for secure operations like deleting customers

CREATE TABLE IF NOT EXISTS auth_codes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  code VARCHAR(10) NOT NULL,
  purpose VARCHAR(50) NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  used_at TIMESTAMP WITH TIME ZONE
);

-- Index for faster lookups
CREATE INDEX idx_auth_codes_employee ON auth_codes(employee_id);
CREATE INDEX idx_auth_codes_code ON auth_codes(code);
CREATE INDEX idx_auth_codes_expires ON auth_codes(expires_at);

-- Clean up expired codes automatically (optional, run as cron job)
-- DELETE FROM auth_codes WHERE expires_at < NOW();

COMMENT ON TABLE auth_codes IS 'Temporary authentication codes for secure operations';
COMMENT ON COLUMN auth_codes.code IS '6-digit alphanumeric code';
COMMENT ON COLUMN auth_codes.purpose IS 'Purpose of the code (e.g., delete_customer)';
COMMENT ON COLUMN auth_codes.expires_at IS 'Expiration timestamp (typically 5 minutes)';
