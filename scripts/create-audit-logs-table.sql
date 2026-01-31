-- Create audit_logs table
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES employees(id),
  action VARCHAR(50) NOT NULL,
  entity_type VARCHAR(50) NOT NULL,
  entity_id UUID NOT NULL,
  changes JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_id ON audit_logs(entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);

-- Add RLS policies (if using Row Level Security)
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Policy: Allow all authenticated users to read audit logs
CREATE POLICY "Allow authenticated users to read audit logs"
  ON audit_logs
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- Policy: Allow authenticated users to insert audit logs
CREATE POLICY "Allow authenticated users to insert audit logs"
  ON audit_logs
  FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- Comment on table for documentation
COMMENT ON TABLE audit_logs IS 'Audit trail for tracking all changes to loan accounts and related entities';
COMMENT ON COLUMN audit_logs.action IS 'Action type: CREATE, UPDATE, DELETE, PAYMENT, SKIP, MODIFY, etc.';
COMMENT ON COLUMN audit_logs.entity_type IS 'Type of entity affected: ACCOUNT, SERVICE, INSTALLMENT, etc.';
COMMENT ON COLUMN audit_logs.entity_id IS 'ID of the entity (account ID, transaction ID, etc.)';
COMMENT ON COLUMN audit_logs.changes IS 'JSON object tracking what changed - can contain before/after values';
