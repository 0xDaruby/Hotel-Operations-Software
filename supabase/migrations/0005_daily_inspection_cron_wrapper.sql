-- Hotel Operations — cron visibility for daily inspection scheduler
-- Safe wrapper: expose only the metadata the service role needs without exposing
-- the cron schema to the public Data API.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_daily_inspection_cron_runs()
RETURNS TABLE (
  jobname text,
  jobid bigint,
  runid bigint,
  start_time timestamptz,
  end_time timestamptz,
  status text,
  return_message text,
  command text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    j.jobname,
    r.jobid,
    r.runid,
    r.start_time,
    r.end_time,
    r.status,
    r.return_message,
    j.command
  FROM cron.job_run_details r
  JOIN cron.job j ON j.jobid = r.jobid
  WHERE j.jobname = 'daily-inspections'
  ORDER BY r.start_time DESC
  LIMIT 20;
END;
$$;

REVOKE ALL ON FUNCTION public.get_daily_inspection_cron_runs() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_daily_inspection_cron_runs() TO service_role;

COMMIT;
