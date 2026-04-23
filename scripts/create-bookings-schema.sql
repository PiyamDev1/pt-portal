-- ============================================================
-- Booking System Schema
-- Run this in your Supabase SQL Editor
-- ============================================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- 1. ENUMS
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
-- 2. BRANCH OPERATING HOURS & SETTINGS
-- One row per day of week (0=Sunday ... 6=Saturday)
-- ============================================================
CREATE TABLE IF NOT EXISTS branch_settings (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  day_of_week       INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  open_time         TIME NOT NULL,
  close_time        TIME NOT NULL,
  lunch_start_time  TIME,
  lunch_end_time    TIME,
  is_closed         BOOLEAN NOT NULL DEFAULT false,
  concurrent_staff  INTEGER NOT NULL DEFAULT 1,
  slot_interval_minutes INTEGER NOT NULL DEFAULT 30,  -- how often slots are generated
  UNIQUE (day_of_week)
);

-- Seed default Mon-Fri schedule (9am-5pm, 1pm-2pm lunch, 2 concurrent, 30-min slots)
INSERT INTO branch_settings (day_of_week, open_time, close_time, lunch_start_time, lunch_end_time, is_closed, concurrent_staff, slot_interval_minutes)
VALUES
  (0, '09:00', '17:00', '13:00', '14:00', true,  1, 30),  -- Sunday  (closed)
  (1, '09:00', '17:00', '13:00', '14:00', false, 2, 30),  -- Monday
  (2, '09:00', '17:00', '13:00', '14:00', false, 2, 30),  -- Tuesday
  (3, '09:00', '17:00', '13:00', '14:00', false, 2, 30),  -- Wednesday
  (4, '09:00', '17:00', '13:00', '14:00', false, 2, 30),  -- Thursday
  (5, '09:00', '17:00', '13:00', '14:00', false, 2, 30),  -- Friday
  (6, '09:00', '13:00', NULL,    NULL,    false, 1, 30)   -- Saturday (morning only)
ON CONFLICT (day_of_week) DO NOTHING;

-- ============================================================
-- 3. BOOKING SERVICES
-- ============================================================
CREATE TABLE IF NOT EXISTS booking_services (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name             TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL,
  buffer_minutes   INTEGER NOT NULL DEFAULT 15,
  is_active        BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Seed sample services
INSERT INTO booking_services (name, duration_minutes, buffer_minutes)
VALUES
  ('Visa Consultation',        30, 15),
  ('Passport Application',     45, 15),
  ('Document Review',          60, 15),
  ('Travel Insurance Enquiry', 20, 10)
ON CONFLICT DO NOTHING;

-- ============================================================
-- 4. BOOKINGS
-- ============================================================
CREATE TABLE IF NOT EXISTS bookings (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_name  TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  service_id     UUID NOT NULL REFERENCES booking_services(id) ON DELETE RESTRICT,
  start_time     TIMESTAMPTZ NOT NULL,
  end_time       TIMESTAMPTZ NOT NULL,
  status         booking_status NOT NULL DEFAULT 'pending',
  source         booking_source NOT NULL DEFAULT 'portal',
  notes          TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 5. INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_bookings_start_time ON bookings (start_time);
CREATE INDEX IF NOT EXISTS idx_bookings_status     ON bookings (status);
CREATE INDEX IF NOT EXISTS idx_bookings_service_id ON bookings (service_id);

-- ============================================================
-- 6. AUTO-UPDATE updated_at TRIGGER
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
-- 7. ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE branch_settings  ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings         ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read everything
CREATE POLICY "Authenticated can read branch_settings"
  ON branch_settings FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated can read booking_services"
  ON booking_services FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated can read bookings"
  ON bookings FOR SELECT TO authenticated USING (true);

-- Authenticated users can manage services and bookings
CREATE POLICY "Authenticated can manage bookings"
  ON bookings FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Only service_role (API) can modify branch_settings and services
CREATE POLICY "Service role can manage branch_settings"
  ON branch_settings FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Service role can manage booking_services"
  ON booking_services FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Anon can read active services and available slots (for WhatsApp / website)
CREATE POLICY "Anon can read active booking_services"
  ON booking_services FOR SELECT TO anon USING (is_active = true);

CREATE POLICY "Anon can read branch_settings"
  ON branch_settings FOR SELECT TO anon USING (true);

-- Allow anon to INSERT bookings (from website / WhatsApp bot)
CREATE POLICY "Anon can create bookings"
  ON bookings FOR INSERT TO anon WITH CHECK (true);
