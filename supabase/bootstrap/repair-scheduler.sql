-- Replacement for historical 0004 on clean replay; also safe as a forward repair.
-- Preserve existing job identity, but reconcile its schedule and command.
-- Rollback: restore the previous cron.job schedule/command captured before applying.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pg_cron;
DO $scheduler$
DECLARE existing_job bigint;
BEGIN
  SELECT jobid INTO existing_job FROM cron.job WHERE jobname = 'daily-inspections';
  IF existing_job IS NULL THEN
    PERFORM cron.schedule('daily-inspections', '0 7 * * *', 'SELECT public.enqueue_daily_inspections();');
  ELSE
    PERFORM cron.alter_job(existing_job, schedule := '0 7 * * *', command := 'SELECT public.enqueue_daily_inspections();', active := true);
  END IF;
END
$scheduler$;
COMMIT;
