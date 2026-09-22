-- Hotel Operations — daily inspection scheduler
-- Runs the database-native enqueue job at the hotel cutoff, 08:00 Africa/Lagos.
-- This is the authoritative automation for daily inspection requirements.
--
-- The app never decides when to create the queue. The database does, by calling
-- public.enqueue_daily_inspections() at 07:00 UTC every day.
--
-- Apply after 0003_inspections_maintenance.sql.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM cron.job
    WHERE jobname = 'daily-inspections'
  ) THEN
    PERFORM cron.schedule(
      'daily-inspections',
      '0 7 * * *',
      $$SELECT public.enqueue_daily_inspections();$$
    );
  END IF;
END $$;

COMMIT;

-- The job is intentionally database-side and service-only:
--   - 08:00 Africa/Lagos is 07:00 UTC in WAT.
--   - pg_cron fires in the database timezone (UTC), so the cron expression is
--     0 7 * * *.
--   - public.enqueue_daily_inspections() enforces the one-daily-per-room rule with
--     ON CONFLICT DO NOTHING and checks for unresolved daily work.
