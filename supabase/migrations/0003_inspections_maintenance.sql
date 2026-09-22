-- Hotel Operations — Milestones 5 & 6
-- Inspection operations and maintenance operations.
--
-- Apply after 0001_foundation_alignment.sql and 0002_stays_payments_departures.sql.
--
-- Time zone: the hotel operates on Africa/Lagos (confirmed), matching 0002's
-- received_on calculation. The daily cutoff is 08:00 Africa/Lagos; schedule
-- enqueue_daily_inspections at that local time (see the pg_cron note at the end
-- of this file). This migration schedules nothing.
--
-- Re-runnable: every statement below is guarded or CREATE OR REPLACE.

BEGIN;

-- ---------------------------------------------------------------------------
-- Guard: 0002 must be applied first
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.inspection_requirements') IS NULL
     OR to_regclass('public.activity_events') IS NULL
     OR to_regprocedure('public.log_activity(uuid, public.staff_profiles, text, uuid, uuid, jsonb, jsonb, text)') IS NULL THEN
    RAISE EXCEPTION 'Apply 0002_stays_payments_departures.sql before 0003.';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Inspection requirements
-- ---------------------------------------------------------------------------
ALTER TABLE public.inspection_requirements
  ADD COLUMN IF NOT EXISTS inspection_day date;

-- 0002 only creates 'departure' and 'daily' triggers, so this is safe for
-- existing rows: departure rows (departures, room moves, voids) keep a NULL day.
ALTER TABLE public.inspection_requirements
  DROP CONSTRAINT IF EXISTS inspection_requirement_day_matches_trigger;
ALTER TABLE public.inspection_requirements
  ADD CONSTRAINT inspection_requirement_day_matches_trigger
  CHECK (
    (trigger = 'daily' AND inspection_day IS NOT NULL)
    OR (trigger = 'departure' AND inspection_day IS NULL)
  );

-- One daily requirement per room per operating day, even if the job runs twice.
CREATE UNIQUE INDEX IF NOT EXISTS inspection_requirements_one_daily_room_day
  ON public.inspection_requirements (hotel_id, room_id, inspection_day)
  WHERE trigger = 'daily' AND inspection_day IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Maintenance issues stay independent from cleanliness and inspections.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.maintenance_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL REFERENCES public.hotels(id),
  room_id uuid NOT NULL REFERENCES public.rooms(id),
  issue_type text NOT NULL CHECK (issue_type IN ('air_conditioning', 'furniture', 'plumbing', 'electrical', 'other')),
  detail text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  reported_by uuid NOT NULL REFERENCES public.staff_profiles(user_id),
  reported_at timestamptz NOT NULL DEFAULT now(),
  resolved_by uuid REFERENCES public.staff_profiles(user_id),
  resolved_at timestamptz,
  resolution_detail text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (issue_type <> 'other' OR NULLIF(btrim(COALESCE(detail, '')), '') IS NOT NULL),
  CHECK (
    (status = 'open' AND resolved_by IS NULL AND resolved_at IS NULL AND resolution_detail IS NULL)
    OR (
      status = 'resolved'
      AND resolved_by IS NOT NULL
      AND resolved_at IS NOT NULL
      AND NULLIF(btrim(COALESCE(resolution_detail, '')), '') IS NOT NULL
    )
  )
);

CREATE INDEX IF NOT EXISTS maintenance_issues_room_open_idx
  ON public.maintenance_issues (room_id, reported_at)
  WHERE status = 'open';
CREATE INDEX IF NOT EXISTS maintenance_issues_hotel_status_idx
  ON public.maintenance_issues (hotel_id, status, reported_at DESC);

DROP TRIGGER IF EXISTS maintenance_issues_touch_updated_at ON public.maintenance_issues;
CREATE TRIGGER maintenance_issues_touch_updated_at BEFORE UPDATE ON public.maintenance_issues
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.maintenance_issues ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff read maintenance issues" ON public.maintenance_issues;
CREATE POLICY "staff read maintenance issues" ON public.maintenance_issues FOR SELECT TO authenticated
  USING (hotel_id = (SELECT hotel_id FROM public.staff_profiles WHERE user_id = auth.uid() AND active));

-- ---------------------------------------------------------------------------
-- Authorization helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.assert_supervisor_role()
RETURNS public.staff_profiles
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_staff public.staff_profiles;
BEGIN
  SELECT * INTO v_staff
  FROM public.staff_profiles
  WHERE user_id = auth.uid() AND active;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Your staff profile is unavailable or inactive.';
  END IF;
  IF v_staff.role <> 'supervisor' THEN
    RAISE EXCEPTION 'Only Supervisors can record inspections or report maintenance issues.';
  END IF;

  RETURN v_staff;
END;
$$;

CREATE OR REPLACE FUNCTION public.assert_maintenance_resolution_role()
RETURNS public.staff_profiles
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_staff public.staff_profiles;
BEGIN
  SELECT * INTO v_staff
  FROM public.staff_profiles
  WHERE user_id = auth.uid() AND active;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Your staff profile is unavailable or inactive.';
  END IF;
  IF v_staff.role NOT IN ('owner', 'supervisor') THEN
    RAISE EXCEPTION 'Your role cannot resolve maintenance issues.';
  END IF;

  RETURN v_staff;
END;
$$;

CREATE OR REPLACE FUNCTION public.assert_maintenance_report_role()
RETURNS public.staff_profiles
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_staff public.staff_profiles;
BEGIN
  SELECT * INTO v_staff
  FROM public.staff_profiles
  WHERE user_id = auth.uid() AND active;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Your staff profile is unavailable or inactive.';
  END IF;
  IF v_staff.role NOT IN ('owner', 'supervisor') THEN
    RAISE EXCEPTION 'Your role cannot report maintenance issues.';
  END IF;

  RETURN v_staff;
END;
$$;

-- 0002's arrival and move functions already call room_is_ready, so extending it
-- here makes an open maintenance issue block assignment authoritatively.
CREATE OR REPLACE FUNCTION public.room_is_ready(p_room_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.rooms r WHERE r.id = p_room_id AND r.active)
    AND NOT EXISTS (SELECT 1 FROM public.stays s WHERE s.room_id = p_room_id AND s.status = 'active')
    AND NOT EXISTS (
      SELECT 1 FROM public.inspection_requirements ir
      WHERE ir.room_id = p_room_id AND ir.status <> 'approved'
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.maintenance_issues mi
      WHERE mi.room_id = p_room_id AND mi.status = 'open'
    );
$$;

-- ---------------------------------------------------------------------------
-- Inspections
-- ---------------------------------------------------------------------------
-- No client-supplied clock: completion time is always the database's now().
CREATE OR REPLACE FUNCTION public.submit_inspection(
  p_requirement_id uuid,
  p_outcome text,
  p_findings text,
  p_personally_verified boolean,
  p_expected_version integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_staff public.staff_profiles;
  v_requirement public.inspection_requirements;
  v_completed_by_name text;
  v_completed_when text;
  v_room_number text;
  v_findings text;
BEGIN
  v_staff := public.assert_supervisor_role();

  IF NOT COALESCE(p_personally_verified, false) THEN
    RAISE EXCEPTION 'Confirm that this outcome reflects your personal verification.';
  END IF;
  IF p_outcome IS NULL OR p_outcome NOT IN ('approved', 'attention', 'access_blocked') THEN
    RAISE EXCEPTION 'Choose an inspection outcome.';
  END IF;

  v_findings := NULLIF(btrim(COALESCE(p_findings, '')), '');
  IF p_outcome <> 'approved' AND v_findings IS NULL THEN
    RAISE EXCEPTION 'Record the reason before leaving this inspection unresolved.';
  END IF;
  IF char_length(COALESCE(v_findings, '')) > 250 THEN
    RAISE EXCEPTION 'Keep findings to 250 characters or fewer.';
  END IF;

  SELECT * INTO v_requirement
  FROM public.inspection_requirements
  WHERE id = p_requirement_id AND hotel_id = v_staff.hotel_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'That inspection requirement is no longer available.';
  END IF;

  IF v_requirement.completed_by IS NOT NULL THEN
    SELECT display_name INTO v_completed_by_name
    FROM public.staff_profiles
    WHERE user_id = v_requirement.completed_by;
    v_completed_when := to_char(v_requirement.completed_at AT TIME ZONE 'Africa/Lagos', 'DD Mon YYYY HH24:MI') || ' WAT';
  END IF;

  IF v_requirement.status = 'approved' THEN
    RAISE EXCEPTION 'This inspection was already completed by % at %.',
      COALESCE(v_completed_by_name, 'another Supervisor'),
      COALESCE(v_completed_when, 'an earlier time');
  END IF;

  -- IS DISTINCT FROM so a missing version can never bypass stale protection.
  IF v_requirement.version IS DISTINCT FROM p_expected_version THEN
    IF v_completed_by_name IS NOT NULL THEN
      RAISE EXCEPTION 'This inspection was updated by % at %. Review the latest result and try again.',
        v_completed_by_name, v_completed_when;
    END IF;
    RAISE EXCEPTION 'This inspection changed before your submission. Refresh the shared queue and try again.';
  END IF;

  UPDATE public.inspection_requirements
  SET status = p_outcome,
      outcome = p_outcome,
      findings = v_findings,
      completed_by = v_staff.user_id,
      completed_at = now(),
      version = version + 1
  WHERE id = v_requirement.id;

  SELECT room_number INTO v_room_number FROM public.rooms WHERE id = v_requirement.room_id;

  PERFORM public.log_activity(
    v_staff.hotel_id,
    v_staff,
    'inspection.' || p_outcome,
    v_requirement.room_id,
    NULL,
    jsonb_build_object('status', v_requirement.status, 'trigger', v_requirement.trigger, 'findings', v_requirement.findings),
    jsonb_build_object('status', p_outcome, 'trigger', v_requirement.trigger, 'findings', v_findings, 'room', v_room_number),
    v_findings
  );
END;
$$;

-- Service-only. Run it at the hotel-approved local cutoff. An unresolved daily
-- requirement for a room blocks a new one, so unfinished work carries forward
-- instead of piling up; re-running on the same day is a no-op.
CREATE OR REPLACE FUNCTION public.enqueue_daily_inspections(p_now timestamptz DEFAULT now())
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted integer;
BEGIN
  INSERT INTO public.inspection_requirements (hotel_id, room_id, trigger, status, due_at, inspection_day)
  SELECT s.hotel_id,
         s.room_id,
         'daily',
         'pending',
         p_now,
         (p_now AT TIME ZONE 'Africa/Lagos')::date
  FROM public.stays s
  WHERE s.status = 'active'
    AND NOT EXISTS (
      SELECT 1
      FROM public.inspection_requirements ir
      WHERE ir.room_id = s.room_id
        AND ir.trigger = 'daily'
        AND ir.status <> 'approved'
    )
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END;
$$;

-- ---------------------------------------------------------------------------
-- Maintenance
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.report_maintenance_issue(
  p_room_id uuid,
  p_issue_type text,
  p_detail text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_staff public.staff_profiles;
  v_room public.rooms;
  v_issue_id uuid;
  v_detail text;
BEGIN
  v_staff := public.assert_maintenance_report_role();

  SELECT * INTO v_room FROM public.rooms WHERE id = p_room_id AND active;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Select an active room.';
  END IF;
  IF p_issue_type IS NULL OR p_issue_type NOT IN ('air_conditioning', 'furniture', 'plumbing', 'electrical', 'other') THEN
    RAISE EXCEPTION 'Choose a maintenance issue type.';
  END IF;

  v_detail := NULLIF(btrim(COALESCE(p_detail, '')), '');
  IF p_issue_type = 'other' AND v_detail IS NULL THEN
    RAISE EXCEPTION 'Describe this maintenance issue.';
  END IF;
  -- 250 is the prototype's limit; the final limit is still open (FR-096).
  IF char_length(COALESCE(v_detail, '')) > 250 THEN
    RAISE EXCEPTION 'Keep the issue details to 250 characters or fewer.';
  END IF;

  INSERT INTO public.maintenance_issues (hotel_id, room_id, issue_type, detail, reported_by)
  VALUES (v_staff.hotel_id, p_room_id, p_issue_type, v_detail, v_staff.user_id)
  RETURNING id INTO v_issue_id;

  PERFORM public.log_activity(
    v_staff.hotel_id,
    v_staff,
    'maintenance.reported',
    p_room_id,
    NULL,
    NULL,
    jsonb_build_object('room', v_room.room_number, 'issue_type', p_issue_type, 'detail', v_detail, 'status', 'open'),
    v_detail
  );

  RETURN v_issue_id;
END;
$$;

-- Resolves exactly one issue. It never touches inspection requirements or
-- other issues, so cleanliness and remaining blocks are unaffected.
CREATE OR REPLACE FUNCTION public.resolve_maintenance_issue(
  p_issue_id uuid,
  p_resolution_detail text,
  p_expected_version integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_staff public.staff_profiles;
  v_issue public.maintenance_issues;
  v_detail text;
BEGIN
  v_staff := public.assert_maintenance_resolution_role();
  v_detail := NULLIF(btrim(COALESCE(p_resolution_detail, '')), '');

  IF v_detail IS NULL THEN
    RAISE EXCEPTION 'Record how this maintenance issue was resolved.';
  END IF;
  IF char_length(v_detail) > 250 THEN
    RAISE EXCEPTION 'Keep the resolution note to 250 characters or fewer.';
  END IF;

  SELECT * INTO v_issue
  FROM public.maintenance_issues
  WHERE id = p_issue_id AND hotel_id = v_staff.hotel_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'That maintenance issue is no longer available.';
  END IF;
  IF v_issue.status <> 'open' THEN
    RAISE EXCEPTION 'This maintenance issue was already resolved.';
  END IF;
  IF v_issue.version IS DISTINCT FROM p_expected_version THEN
    RAISE EXCEPTION 'This maintenance issue changed before your submission. Refresh and try again.';
  END IF;

  UPDATE public.maintenance_issues
  SET status = 'resolved',
      resolved_by = v_staff.user_id,
      resolved_at = now(),
      resolution_detail = v_detail,
      version = version + 1
  WHERE id = v_issue.id;

  PERFORM public.log_activity(
    v_staff.hotel_id,
    v_staff,
    'maintenance.resolved',
    v_issue.room_id,
    NULL,
    jsonb_build_object('status', 'open', 'issue_type', v_issue.issue_type, 'detail', v_issue.detail),
    jsonb_build_object('status', 'resolved', 'issue_type', v_issue.issue_type, 'resolution_detail', v_detail),
    v_detail
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Privileges
-- Supabase grants EXECUTE on new public functions to anon and authenticated by
-- default, so revoke explicitly and re-grant only what each caller needs.
-- SECURITY DEFINER functions still call each other as the function owner.
-- ---------------------------------------------------------------------------
-- New RPCs: signed-in staff only.
REVOKE ALL ON FUNCTION public.submit_inspection(uuid, text, text, boolean, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.report_maintenance_issue(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.resolve_maintenance_issue(uuid, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_inspection(uuid, text, text, boolean, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.report_maintenance_issue(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_maintenance_issue(uuid, text, integer) TO authenticated;

-- Scheduler only.
REVOKE ALL ON FUNCTION public.enqueue_daily_inspections(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_daily_inspections(timestamptz) TO service_role;

-- Internal helpers must not be callable from the client. log_activity in
-- particular would let any signed-in user write forged audit events.
REVOKE ALL ON FUNCTION public.log_activity(uuid, public.staff_profiles, text, uuid, uuid, jsonb, jsonb, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assert_reception_role() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assert_supervisor_role() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assert_maintenance_resolution_role() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assert_maintenance_report_role() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.room_is_ready(uuid) FROM PUBLIC, anon;

-- 0002 RPCs: remove the anonymous grant; authenticated staff keep access.
REVOKE ALL ON FUNCTION public.record_arrival(uuid, text, text, integer, numeric, timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.extend_stay(uuid, integer, numeric, integer, timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.confirm_departure(uuid, integer, timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.move_stay(uuid, uuid, text, integer, timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.correct_stay(uuid, text, text, integer, text, integer, timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.void_stay(uuid, text, integer, timestamptz) FROM PUBLIC, anon;

COMMIT;

-- ---------------------------------------------------------------------------
-- Scheduling (NOT part of this migration — run once the cutoff is approved).
-- Example with pg_cron, 14:00 Africa/Lagos = 13:00 UTC (Lagos has no DST):
--
--   create extension if not exists pg_cron;
--   select cron.schedule('daily-inspections', '0 13 * * *',
--                        $$select public.enqueue_daily_inspections()$$);
-- ---------------------------------------------------------------------------