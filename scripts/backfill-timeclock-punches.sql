-- ============================================================================
-- BACKFILL TIMECLOCK PUNCH TYPE
-- ============================================================================

ALTER TABLE public.timeclock_events
  ADD COLUMN IF NOT EXISTS punch_type TEXT NOT NULL DEFAULT 'IN';

WITH ranked AS (
  SELECT
    id,
    employee_id,
    scanned_at,
    ROW_NUMBER() OVER (
      PARTITION BY employee_id, DATE(scanned_at)
      ORDER BY scanned_at ASC
    ) AS rn
  FROM public.timeclock_events
)
UPDATE public.timeclock_events AS t
SET punch_type = CASE
  WHEN (ranked.rn - 1) % 2 = 0 THEN 'IN'
  ELSE 'OUT'
END
FROM ranked
WHERE t.id = ranked.id;
