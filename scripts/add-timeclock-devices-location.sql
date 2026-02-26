-- Add missing columns to timeclock_devices table
-- Run this if you get: "Could not find the 'location' column"

-- Add location column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'timeclock_devices' 
        AND column_name = 'location'
    ) THEN
        ALTER TABLE timeclock_devices ADD COLUMN location TEXT;
        RAISE NOTICE 'Added location column to timeclock_devices';
    ELSE
        RAISE NOTICE 'location column already exists';
    END IF;
END $$;

-- Add updated_at column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'timeclock_devices' 
        AND column_name = 'updated_at'
    ) THEN
        ALTER TABLE timeclock_devices ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
        RAISE NOTICE 'Added updated_at column to timeclock_devices';
    ELSE
        RAISE NOTICE 'updated_at column already exists';
    END IF;
END $$;

-- Ensure RLS is disabled
ALTER TABLE timeclock_devices DISABLE ROW LEVEL SECURITY;

-- Verify columns
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' 
AND table_name = 'timeclock_devices'
ORDER BY ordinal_position;
