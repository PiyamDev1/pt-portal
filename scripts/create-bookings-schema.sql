-- ============================================================
-- Booking System Schema (Branch-Aware) — Idempotent Migration
-- Safe to re-run: uses IF NOT EXISTS and ADD COLUMN IF NOT EXISTS
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
-- 2) WEEKLY BRANCH SETTINGS
-- ============================================================

-- Create fresh if it doesn't exist yet
CREATE TABLE IF NOT EXISTS branch_settings (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  day_of_week           INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  open_time             TIME NOT NULL DEFAULT '09:00',
  close_time            TIME NOT NULL DEFAULT '17:00',
  lunch_start_time      TIME,
  lunch_end_time        TIME,
  is_closed             BOOLEAN NOT NULL DEFAULT false,
  concurrent_staff      INTEGER NOT NULL DEFAULT 1,
  slot_interval_minutes INTEGER NOT NULL DEFAULT 30
);

-- Add new columns if table already existed without them
ALTER TABLE branch_settings
  ADD COLUMN IF NOT EXISTS location_id        UUID REFERENCES locations(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS prayer_start_time  TIME,
  ADD COLUMN IF NOT EXISTS prayer_end_time    TIME;

-- Drop old single-column unique constraint if it exists (pre-branch-aware schema)
ALTER TABLE branch_settings DROP CONSTRAINT IF EXISTS branch_settings_day_of_week_key;

-- Add unique constraint on (location_id, day_of_week) if it doesn't exist
DO $$ BEGIN
  ALTER TABLE branch_settings ADD CONSTRAINT branch_settings_location_day_uq UNIQUE (location_id, day_of_week);
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

-- ============================================================
-- 3) ONE-OFF SCHEDULE OVERRIDES
-- ============================================================

CREATE TABLE IF NOT EXISTS branch_schedule_overrides (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  location_id           UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  date                  DATE NOT NULL,
  open_time             TIME,
  close_time            TIME,
  lunch_start_time      TIME,
  lunch_end_time        TIME,
  prayer_start_time     TIME,
  prayer_end_time       TIME,
  is_closed             BOOLEAN NOT NULL DEFAULT false,
  concurrent_staff      INTEGER NOT NULL DEFAULT 1,
  slot_interval_minutes INTEGER NOT NULL DEFAULT 30,
  notes                 TEXT,
  UNIQUE (location_id, date)
);

-- ============================================================
-- 4) SERVICES (PER LOCATION)
-- ============================================================

CREATE TABLE IF NOT EXISTS booking_services (
  id                                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  location_id                         UUID REFERENCES locations(id) ON DELETE CASCADE,
  name                                TEXT NOT NULL,
  duration_minutes                    INTEGER NOT NULL,
  buffer_minutes                      INTEGER NOT NULL DEFAULT 15,
  available_days                      SMALLINT[],
  service_start_time                  TIME,
  service_end_time                    TIME,
  confirmation_template               TEXT,
  modification_template               TEXT,
  cancellation_template               TEXT,
  duration_per_additional_person_minutes INTEGER NOT NULL DEFAULT 0,
  person_count_excludes_family_head   BOOLEAN NOT NULL DEFAULT true,
  close_overrun_tolerance_minutes     INTEGER NOT NULL DEFAULT 15,
  is_active                           BOOLEAN NOT NULL DEFAULT true,
  created_at                          TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE booking_services
  ADD COLUMN IF NOT EXISTS location_id UUID REFERENCES locations(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS available_days SMALLINT[],
  ADD COLUMN IF NOT EXISTS confirmation_template TEXT,
  ADD COLUMN IF NOT EXISTS modification_template TEXT,
  ADD COLUMN IF NOT EXISTS cancellation_template TEXT,
  ADD COLUMN IF NOT EXISTS service_start_time TIME,
  ADD COLUMN IF NOT EXISTS service_end_time TIME,
  ADD COLUMN IF NOT EXISTS duration_per_additional_person_minutes INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS person_count_excludes_family_head BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS close_overrun_tolerance_minutes INTEGER NOT NULL DEFAULT 15;

-- Unique index per branch name (skip if already exists)
CREATE UNIQUE INDEX IF NOT EXISTS uq_booking_services_branch_name
  ON booking_services (location_id, lower(name));

-- ============================================================
-- 5) BOOKINGS (PER LOCATION)
-- ============================================================

CREATE TABLE IF NOT EXISTS bookings (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  location_id     UUID REFERENCES locations(id) ON DELETE RESTRICT,
  customer_name   TEXT NOT NULL,
  customer_phone  TEXT NOT NULL,
  customer_email  TEXT,
  service_id      UUID NOT NULL REFERENCES booking_services(id) ON DELETE RESTRICT,
  person_count    INTEGER NOT NULL DEFAULT 1,
  tags            TEXT[] NOT NULL DEFAULT '{}',
  start_time      TIMESTAMPTZ NOT NULL,
  end_time        TIMESTAMPTZ NOT NULL,
  status          booking_status NOT NULL DEFAULT 'pending',
  source          booking_source NOT NULL DEFAULT 'portal',
  notes           TEXT,
  last_email_sent_at TIMESTAMPTZ,
  last_email_kind TEXT,
  last_email_status TEXT,
  last_email_error TEXT,
  last_email_subject TEXT,
  last_email_recipient TEXT,
  last_rescheduled_at TIMESTAMPTZ,
  reschedule_count INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS location_id UUID REFERENCES locations(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS customer_email TEXT,
  ADD COLUMN IF NOT EXISTS person_count INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS last_email_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_email_kind TEXT,
  ADD COLUMN IF NOT EXISTS last_email_status TEXT,
  ADD COLUMN IF NOT EXISTS last_email_error TEXT,
  ADD COLUMN IF NOT EXISTS last_email_subject TEXT,
  ADD COLUMN IF NOT EXISTS last_email_recipient TEXT,
  ADD COLUMN IF NOT EXISTS last_rescheduled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reschedule_count INTEGER NOT NULL DEFAULT 0;

-- Add address/contact fields to locations if not already present
ALTER TABLE locations
  ADD COLUMN IF NOT EXISTS address_line1 TEXT,
  ADD COLUMN IF NOT EXISTS address_line2 TEXT,
  ADD COLUMN IF NOT EXISTS city          TEXT,
  ADD COLUMN IF NOT EXISTS postcode      TEXT,
  ADD COLUMN IF NOT EXISTS country       TEXT,
  ADD COLUMN IF NOT EXISTS phone         TEXT,
  ADD COLUMN IF NOT EXISTS email         TEXT,
  ADD COLUMN IF NOT EXISTS appointments_enabled BOOLEAN NOT NULL DEFAULT true;

-- ============================================================
-- 6) BOOKING EMAIL AUDIT LOGS
-- ============================================================

CREATE TABLE IF NOT EXISTS booking_email_logs (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id     UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  location_id    UUID REFERENCES locations(id) ON DELETE SET NULL,
  customer_email TEXT NOT NULL,
  email_kind     TEXT NOT NULL CHECK (email_kind IN ('confirmation', 'modification', 'cancellation', 'reminder')),
  email_subject  TEXT NOT NULL,
  sender_email   TEXT NOT NULL,
  status         TEXT NOT NULL CHECK (status IN ('sent', 'failed')),
  failure_reason TEXT,
  metadata       JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS booking_idempotency_keys (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  action_name     TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  location_id     UUID REFERENCES locations(id) ON DELETE CASCADE,
  booking_id      UUID REFERENCES bookings(id) ON DELETE CASCADE,
  response_code   INTEGER NOT NULL DEFAULT 200,
  metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (action_name, idempotency_key)
);

-- ============================================================
-- 7) REMINDERS, ATTENDANCE CONFIRMATION, PENALTY FLAGS
-- ============================================================

CREATE TABLE IF NOT EXISTS booking_reminder_settings (
  location_id                    UUID PRIMARY KEY REFERENCES locations(id) ON DELETE CASCADE,
  reminders_enabled              BOOLEAN NOT NULL DEFAULT true,
  reminder_hours_before          INTEGER NOT NULL DEFAULT 24 CHECK (reminder_hours_before BETWEEN 1 AND 168),
  same_day_reminder_enabled      BOOLEAN NOT NULL DEFAULT true,
  same_day_reminder_hours_before INTEGER NOT NULL DEFAULT 2 CHECK (same_day_reminder_hours_before BETWEEN 1 AND 12),
  reminder_subject               TEXT NOT NULL DEFAULT 'Appointment reminder: [service booked] on [date booked] at [time booked]',
  reminder_template              TEXT NOT NULL DEFAULT 'Dear [Customer Name],\n\nThis is a reminder that your [service booked] appointment is scheduled for [date booked] at [time booked] at [branch name].\n\nIf you cannot attend, please contact us as soon as possible.\n\nKind regards,\nPiyam Travel',
  attendance_confirmation_required BOOLEAN NOT NULL DEFAULT true,
  penalty_enabled                BOOLEAN NOT NULL DEFAULT true,
  penalty_threshold              INTEGER NOT NULL DEFAULT 3 CHECK (penalty_threshold BETWEEN 1 AND 20),
  penalty_action                 TEXT NOT NULL DEFAULT 'block_until_manual_review' CHECK (penalty_action IN ('warn_only', 'block_until_manual_review')),
  penalty_note                   TEXT,
  created_at                     TIMESTAMPTZ DEFAULT NOW(),
  updated_at                     TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS booking_reminder_events (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id           UUID NOT NULL UNIQUE REFERENCES bookings(id) ON DELETE CASCADE,
  location_id          UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  reminder_sent_at     TIMESTAMPTZ,
  reminder_hours_before INTEGER,
  same_day_reminder_sent_at TIMESTAMPTZ,
  same_day_reminder_hours_before INTEGER,
  response_token       TEXT UNIQUE,
  response_status      TEXT NOT NULL DEFAULT 'unknown' CHECK (response_status IN ('unknown', 'present', 'missed')),
  responded_at         TIMESTAMPTZ,
  confirmation_source  TEXT,
  metadata             JSONB,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS booking_contact_flags (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  location_id          UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  customer_phone_norm  TEXT,
  customer_email_norm  TEXT,
  missed_count         INTEGER NOT NULL DEFAULT 0,
  penalty_applied      BOOLEAN NOT NULL DEFAULT false,
  penalty_applied_at   TIMESTAMPTZ,
  last_missed_booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL,
  notes                TEXT,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW(),
  CHECK (customer_phone_norm IS NOT NULL OR customer_email_norm IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_booking_contact_flags_location_phone
  ON booking_contact_flags (location_id, customer_phone_norm)
  WHERE customer_phone_norm IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_booking_contact_flags_location_email
  ON booking_contact_flags (location_id, customer_email_norm)
  WHERE customer_email_norm IS NOT NULL;

-- ============================================================
-- 8) INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_bookings_location_start ON bookings (location_id, start_time);
CREATE INDEX IF NOT EXISTS idx_bookings_status         ON bookings (status);
CREATE INDEX IF NOT EXISTS idx_bookings_service_id     ON bookings (service_id);
CREATE INDEX IF NOT EXISTS idx_overrides_location_date ON branch_schedule_overrides (location_id, date);
CREATE INDEX IF NOT EXISTS idx_booking_email_logs_booking_id ON booking_email_logs (booking_id);
CREATE INDEX IF NOT EXISTS idx_booking_email_logs_location_created ON booking_email_logs (location_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_booking_idempotency_keys_created ON booking_idempotency_keys (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_booking_reminder_events_location_created ON booking_reminder_events (location_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_booking_contact_flags_penalty ON booking_contact_flags (location_id, penalty_applied, missed_count DESC);

-- ============================================================
-- 9) AUTO-UPDATE updated_at TRIGGER
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

DROP TRIGGER IF EXISTS booking_reminder_settings_updated_at ON booking_reminder_settings;
CREATE TRIGGER booking_reminder_settings_updated_at
  BEFORE UPDATE ON booking_reminder_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS booking_reminder_events_updated_at ON booking_reminder_events;
CREATE TRIGGER booking_reminder_events_updated_at
  BEFORE UPDATE ON booking_reminder_events
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS booking_contact_flags_updated_at ON booking_contact_flags;
CREATE TRIGGER booking_contact_flags_updated_at
  BEFORE UPDATE ON booking_contact_flags
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- 10) RLS
-- ============================================================
ALTER TABLE branch_settings           ENABLE ROW LEVEL SECURITY;
ALTER TABLE branch_schedule_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_services          ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_email_logs        ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_idempotency_keys  ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_reminder_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_reminder_events   ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_contact_flags     ENABLE ROW LEVEL SECURITY;

-- Drop old policies before recreating to avoid duplicate errors
DO $$ DECLARE r RECORD; BEGIN
  FOR r IN
    SELECT policyname, tablename FROM pg_policies
    WHERE tablename IN (
      'branch_settings',
      'branch_schedule_overrides',
      'booking_services',
      'bookings',
      'booking_email_logs',
      'booking_idempotency_keys',
      'booking_reminder_settings',
      'booking_reminder_events',
      'booking_contact_flags'
    )
  LOOP
    EXECUTE 'DROP POLICY IF EXISTS ' || quote_ident(r.policyname) || ' ON ' || quote_ident(r.tablename);
  END LOOP;
END $$;

-- Authenticated staff can read everything
CREATE POLICY "Authenticated can read branch settings"
  ON branch_settings FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated can read branch overrides"
  ON branch_schedule_overrides FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated can read booking services"
  ON booking_services FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated can read bookings"
  ON bookings FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated can read booking email logs"
  ON booking_email_logs FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated can read booking idempotency keys"
  ON booking_idempotency_keys FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated can read booking reminder settings"
  ON booking_reminder_settings FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated can read booking reminder events"
  ON booking_reminder_events FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated can read booking contact flags"
  ON booking_contact_flags FOR SELECT TO authenticated USING (true);

-- Authenticated staff can manage bookings
CREATE POLICY "Authenticated can manage bookings"
  ON bookings FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated can manage booking email logs"
  ON booking_email_logs FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated can manage booking idempotency keys"
  ON booking_idempotency_keys FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated can manage booking reminder settings"
  ON booking_reminder_settings FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated can manage booking reminder events"
  ON booking_reminder_events FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated can manage booking contact flags"
  ON booking_contact_flags FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Service role can manage all scheduling config
CREATE POLICY "Service role can manage branch settings"
  ON branch_settings FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Service role can manage branch overrides"
  ON branch_schedule_overrides FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Service role can manage booking services"
  ON booking_services FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Service role can manage booking email logs"
  ON booking_email_logs FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Service role can manage booking idempotency keys"
  ON booking_idempotency_keys FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Service role can manage booking reminder settings"
  ON booking_reminder_settings FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Service role can manage booking reminder events"
  ON booking_reminder_events FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Service role can manage booking contact flags"
  ON booking_contact_flags FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Anon (WhatsApp/website)
CREATE POLICY "Anon can read branch settings"
  ON branch_settings FOR SELECT TO anon USING (true);

CREATE POLICY "Anon can read branch overrides"
  ON branch_schedule_overrides FOR SELECT TO anon USING (true);

CREATE POLICY "Anon can read active booking services"
  ON booking_services FOR SELECT TO anon USING (is_active = true);

CREATE POLICY "Anon can create bookings"
  ON bookings FOR INSERT TO anon WITH CHECK (true);
