-- ============================================================================
-- TIMECLOCK TABLES
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.timeclock_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  location_id UUID REFERENCES locations(id),
  secret TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.timeclock_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employees(id),
  device_id UUID NOT NULL REFERENCES timeclock_devices(id),
  event_type TEXT NOT NULL DEFAULT 'PUNCH',
  punch_type TEXT NOT NULL DEFAULT 'IN',
  qr_payload JSONB NOT NULL,
  nonce TEXT NOT NULL,
  device_ts TIMESTAMP WITH TIME ZONE NOT NULL,
  scanned_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  geo JSONB,
  ip TEXT,
  user_agent TEXT,
  hash TEXT NOT NULL,
  prev_hash TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  CONSTRAINT timeclock_events_device_nonce_unique UNIQUE(device_id, nonce)
);

CREATE INDEX IF NOT EXISTS timeclock_devices_location_idx ON public.timeclock_devices(location_id);
CREATE INDEX IF NOT EXISTS timeclock_devices_active_idx ON public.timeclock_devices(is_active);
CREATE INDEX IF NOT EXISTS timeclock_events_employee_idx ON public.timeclock_events(employee_id);
CREATE INDEX IF NOT EXISTS timeclock_events_device_idx ON public.timeclock_events(device_id);
CREATE INDEX IF NOT EXISTS timeclock_events_scanned_at_idx ON public.timeclock_events(scanned_at DESC);
CREATE INDEX IF NOT EXISTS timeclock_events_hash_idx ON public.timeclock_events(hash);

ALTER TABLE public.timeclock_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.timeclock_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated users to read timeclock devices"
  ON public.timeclock_devices
  FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Allow authenticated users to read timeclock events"
  ON public.timeclock_events
  FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Allow authenticated users to insert timeclock events"
  ON public.timeclock_events
  FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');
