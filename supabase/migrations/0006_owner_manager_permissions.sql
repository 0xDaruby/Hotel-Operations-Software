-- Hotel Operations - finalized Owner / Manager permissions
-- Apply after 0003_inspections_maintenance.sql.
--
-- Owners retain operational reads, staff management, and independent
-- maintenance reporting/resolution. Stay writes remain receptionist-only;
-- inspection approval remains supervisor-only.

BEGIN;

CREATE OR REPLACE FUNCTION public.assert_reception_role()
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
  IF v_staff.role <> 'receptionist' THEN
    RAISE EXCEPTION 'Your role cannot perform reception actions.';
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

REVOKE ALL ON FUNCTION public.assert_reception_role() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assert_maintenance_report_role() FROM PUBLIC, anon, authenticated;

COMMIT;