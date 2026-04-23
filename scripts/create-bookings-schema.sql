-- ============================================================
-- Booking System Schema (Branch-Aware)
-- Run this in your Supabase SQL Editor
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- 1) ENUMS
-- ============================================================
DO $$ BEGIN
  CREATE TYPE booking_status AS ENUM ('pending', 'confirmed', 'cancelled', 'completed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE booking_source AS ENUM ('portal', 'whatsapp', 'website');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- 2) WEEKLY BRANCH SETTINGS (PER LOCATION + DAY)
-- ============================================================
CREATE TABLE IF NOT EXISTS branch_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),

  open_time TIME NOT NULL,
  close_time TIME NOT NULL,

  lunch_start_time TIME,
  lunch_end_time TIME,

  prayer_start_time TIME,
  prayer_end_time TIME,

  is_closed BOOLEAN NOT NULL DEFAULT false,
  concurrent_staff INTEGER NOT NULL DEFAULT 1,
  slot_interval_minutes INTEGER NOT NULL DEFAULT 30,

  UNIQUE (location_id, day_of_week)
);

-- ============================================================
-- 3) ONE-OFF SCHEDULE OVERRIDES (PER LOCATION + DATE)
-- ============================================================
CREATE TABLE IF NOT EXISTS branch_schedule_overrides (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  date DATE NOT NULL,

  open_time TIME,
  close_time TIME,

  lunch_start_time TIME,
  lunch_end_time TIME,

  prayer_start_time TIME,
  prayer_end_time TIME,

  is_closed BOOLEAN NOT NULL DEFAULT false,
  concurrent_staff INTEGER NOT NULL DEFAULT 1,
  slot_interval_minutes INTEGER NOT NULL DEFAULT 30,
  notes TEXT,

  UNIQUE (location_id, date)
);

-- ============================================================
-- 4) SERVICES (PER LOCATION)
-- ============================================================
CREATE TABLE IF NOT EXISTS booking_services (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL,
  buffer_minutes INTEGER NOT NULL DEFAULT 15,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- avoid accidental duplicate services per branch
CREATE UNIQUE INDEX IF NOT EXISTS uq_booking_services_branch_name
  ON booking_services (location_id, lower(name));

-- ============================================================
-- 5) BOOKINGS (PER LOCATION)
-- ============================================================
CREATE TABLE IF NOT EXISTS bookings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  location_id UUID NOT NULL REFERENCES locations(id) ON DELETE RESTRICT,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  service_id UUID NOT NULL REFERENCES booking_services(id) ON DELETE RESTRICT,

  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,

  status booking_status NOT NULL DEFAULT 'pending',
  source booking_source NOT NULL DEFAULT 'portal',
  notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 6) INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_bookings_location_start ON bookings (location_id, start_time);
CREATE INDEX IF NOT EXISTS idx_bookings_status         ON bookings (status);
CREATE INDEX IF NOT EXISTS idx_bookings_service_id     ON bookings (service_id);
CREATE INDEX IF NOT EXISTS idx_overrides_location_date ON branch_schedule_overrides (location_id, date);

-- ============================================================
-- 7) AUTO-UPDATE updated_at TRIGGER
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS bookings_updated_at ON bookings;
CREATE TRIGGER bookings_updated_at
  BEFORE UPDATE ON bookings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- 8) RLS
-- ============================================================
ALTER TABLE branch_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE branch_schedule_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;

-- staff/admin: read all booking config and bookings
CREATE POLICY "Authenticated can read branch settings"
  ON branch_settings FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated can read branch overrides"
  ON branch_schedule_overrides FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated can read booking services"
  ON booking_services FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated can read bookings"
  ON bookings FOR SELECT TO authenticated USING (true);

-- authenticated staff/admin can manage bookings
CREATE POLICY "Authenticated can manage bookings"
  ON bookings FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- service role can manage scheduling config
CREATE POLICY "Service role can manage branch settings"
  ON branch_settings FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Service role can manage branch overrides"
  ON branch_schedule_overrides FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Service role can manage booking services"
  ON booking_services FOR ALL TO service_role USING (true) WITH CHECK (true);

-- anon channels (website/WhatsApp)
CREATE POLICY "Anon can read branch settings"
  ON branch_settings FOR SELECT TO anon USING (true);

CREATE POLICY "Anon can read branch overrides"
  ON branch_schedule_overrides FOR SELECT TO anon USING (true);

CREATE POLICY "Anon can read active booking services"
  ON booking_services FOR SELECT TO anon USING (is_active = true);

CREATE POLICY "Anon can create bookings"
  ON bookings FOR INSERT TO anon WITH CHECK (true);
