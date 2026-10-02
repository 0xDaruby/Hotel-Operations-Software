-- Database-owned timestamps for stay and inspection queue operations.
--
-- p_now is retained for RPC compatibility but deliberately ignored. Existing
-- authenticated callers and the service scheduler cannot backdate persisted
-- events, inspection deadlines, or hotel-day payment attribution.

BEGIN;

CREATE OR REPLACE FUNCTION public.record_arrival(
  p_room_id uuid,
  p_guest_name text,
  p_guest_phone text,
  p_paid_days integer,
  p_expected_amount numeric,
  p_now timestamptz DEFAULT now()
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_staff public.staff_profiles;
  v_room public.rooms;
  v_rate numeric;
  v_expected numeric;
  v_now timestamptz := now();
  v_deadline timestamptz;
  v_stay_id uuid;
BEGIN
  v_staff := public.assert_reception_role();

  SELECT * INTO v_room FROM public.rooms WHERE id = p_room_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Select a room to record the arrival.';
  END IF;
  IF NOT public.room_is_ready(p_room_id) THEN
    RAISE EXCEPTION 'Room % is not ready for check-in.', v_room.room_number;
  END IF;
  IF p_guest_name IS NULL OR btrim(p_guest_name) = '' THEN
    RAISE EXCEPTION 'A guest name is required.';
  END IF;
  IF p_paid_days IS NULL OR p_paid_days < 1 OR p_paid_days > 30 THEN
    RAISE EXCEPTION 'Paid days must be between 1 and 30.';
  END IF;

  SELECT daily_rate INTO v_rate FROM public.room_categories WHERE id = v_room.category_id;
  IF v_rate IS NULL OR v_rate <= 0 THEN
    RAISE EXCEPTION 'The category rate for this room is missing.';
  END IF;
  v_expected := v_rate * p_paid_days;
  IF p_expected_amount IS DISTINCT FROM v_expected THEN
    RAISE EXCEPTION 'The charge no longer matches the current rate. Review the amount and try again.';
  END IF;

  v_deadline := v_now + make_interval(hours => 24 * p_paid_days);

  INSERT INTO public.stays (
    hotel_id, room_id, guest_name, guest_phone, category_id,
    original_daily_rate, arrival_at, departure_due_at, paid_days, created_by
  ) VALUES (
    v_staff.hotel_id, p_room_id, btrim(p_guest_name),
    NULLIF(btrim(COALESCE(p_guest_phone, '')), ''),
    v_room.category_id, v_rate, v_now, v_deadline, p_paid_days, v_staff.user_id
  ) RETURNING id INTO v_stay_id;

  INSERT INTO public.payment_records (stay_id, hotel_id, kind, amount, received_on, created_by, created_by_name)
  VALUES (v_stay_id, v_staff.hotel_id, 'initial', v_expected, (v_now AT TIME ZONE 'Africa/Lagos')::date, v_staff.user_id, v_staff.display_name);

  PERFORM public.log_activity(
    v_staff.hotel_id, v_staff, 'stay.arrived', p_room_id, v_stay_id, NULL,
    jsonb_build_object(
      'room', v_room.room_number,
      'guest', btrim(p_guest_name),
      'days', p_paid_days,
      'rate', v_rate,
      'amount', v_expected,
      'arrival', v_now,
      'departure_due', v_deadline
    ),
    NULL
  );

  RETURN v_stay_id;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'That room was just occupied by another receptionist. Choose another room.';
END;
$$;

CREATE OR REPLACE FUNCTION public.extend_stay(
  p_stay_id uuid,
  p_added_days integer,
  p_expected_amount numeric,
  p_expected_version integer,
  p_now timestamptz DEFAULT now()
)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_staff public.staff_profiles;
  v_stay public.stays;
  v_room_number text;
  v_amount numeric;
  v_now timestamptz := now();
  v_deadline timestamptz;
BEGIN
  v_staff := public.assert_reception_role();

  SELECT * INTO v_stay FROM public.stays WHERE id = p_stay_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That stay no longer exists.';
  END IF;
  IF v_stay.status <> 'active' THEN
    RAISE EXCEPTION 'Only an active stay can be extended.';
  END IF;
  IF p_added_days IS NULL OR p_added_days < 1 OR p_added_days > 30 THEN
    RAISE EXCEPTION 'Added days must be between 1 and 30.';
  END IF;

  v_amount := v_stay.original_daily_rate * p_added_days;
  IF p_expected_amount IS DISTINCT FROM v_amount THEN
    RAISE EXCEPTION 'The extension charge no longer matches the original stay rate. Review the amount and try again.';
  END IF;

  v_deadline := v_stay.departure_due_at + make_interval(hours => 24 * p_added_days);

  UPDATE public.stays
  SET departure_due_at = v_deadline,
      paid_days = paid_days + p_added_days,
      version = version + 1
  WHERE id = p_stay_id AND version = p_expected_version AND status = 'active';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This stay was changed by someone else just now. Refresh and try again.';
  END IF;

  SELECT room_number INTO v_room_number FROM public.rooms WHERE id = v_stay.room_id;

  INSERT INTO public.payment_records (stay_id, hotel_id, kind, amount, received_on, created_by, created_by_name)
  VALUES (p_stay_id, v_staff.hotel_id, 'extension', v_amount, (v_now AT TIME ZONE 'Africa/Lagos')::date, v_staff.user_id, v_staff.display_name);

  PERFORM public.log_activity(
    v_staff.hotel_id, v_staff, 'stay.extended', v_stay.room_id, p_stay_id,
    jsonb_build_object('departure_due', v_stay.departure_due_at, 'paid_days', v_stay.paid_days),
    jsonb_build_object('departure_due', v_deadline, 'paid_days', v_stay.paid_days + p_added_days, 'extension_amount', v_amount, 'room', v_room_number),
    NULL
  );

  RETURN v_deadline;
END;
$$;

CREATE OR REPLACE FUNCTION public.confirm_departure(
  p_stay_id uuid,
  p_expected_version integer,
  p_now timestamptz DEFAULT now()
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_staff public.staff_profiles;
  v_stay public.stays;
  v_room_number text;
  v_now timestamptz := now();
BEGIN
  v_staff := public.assert_reception_role();

  SELECT * INTO v_stay FROM public.stays WHERE id = p_stay_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That stay no longer exists.';
  END IF;
  IF v_stay.status <> 'active' THEN
    RAISE EXCEPTION 'This stay is no longer active.';
  END IF;

  UPDATE public.stays
  SET status = 'departed', departed_at = v_now, version = version + 1
  WHERE id = p_stay_id AND version = p_expected_version AND status = 'active';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This stay was changed by someone else just now. Refresh and try again.';
  END IF;

  SELECT room_number INTO v_room_number FROM public.rooms WHERE id = v_stay.room_id;

  INSERT INTO public.inspection_requirements (hotel_id, room_id, trigger, status, due_at)
  VALUES (v_staff.hotel_id, v_stay.room_id, 'departure', 'pending', v_now);

  PERFORM public.log_activity(
    v_staff.hotel_id, v_staff, 'stay.departed', v_stay.room_id, p_stay_id,
    jsonb_build_object('room', v_room_number, 'guest', v_stay.guest_name, 'departure_due', v_stay.departure_due_at),
    jsonb_build_object('departed_at', v_now, 'inspection_triggered', 'departure'),
    NULL
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.move_stay(
  p_stay_id uuid,
  p_to_room_id uuid,
  p_reason text,
  p_expected_version integer,
  p_now timestamptz DEFAULT now()
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_staff public.staff_profiles;
  v_stay public.stays;
  v_from_room public.rooms;
  v_to_room public.rooms;
  v_now timestamptz := now();
BEGIN
  v_staff := public.assert_reception_role();

  SELECT * INTO v_stay FROM public.stays WHERE id = p_stay_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That stay no longer exists.';
  END IF;
  IF v_stay.status <> 'active' THEN
    RAISE EXCEPTION 'Only an active stay can move rooms.';
  END IF;
  IF p_to_room_id = v_stay.room_id THEN
    RAISE EXCEPTION 'The guest is already in that room.';
  END IF;
  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'A reason for the room move is required.';
  END IF;

  SELECT * INTO v_from_room FROM public.rooms WHERE id = v_stay.room_id;
  SELECT * INTO v_to_room FROM public.rooms WHERE id = p_to_room_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Select a destination room.';
  END IF;
  IF NOT public.room_is_ready(p_to_room_id) THEN
    RAISE EXCEPTION 'Room % is not ready for check-in.', v_to_room.room_number;
  END IF;

  UPDATE public.stays
  SET room_id = p_to_room_id, version = version + 1
  WHERE id = p_stay_id AND version = p_expected_version AND status = 'active';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This stay was changed by someone else just now. Refresh and try again.';
  END IF;

  INSERT INTO public.stay_room_moves (stay_id, from_room_id, to_room_id, reason, moved_by)
  VALUES (p_stay_id, v_stay.room_id, p_to_room_id, btrim(p_reason), v_staff.user_id);

  INSERT INTO public.inspection_requirements (hotel_id, room_id, trigger, status, due_at)
  VALUES (v_staff.hotel_id, v_stay.room_id, 'departure', 'pending', v_now);

  PERFORM public.log_activity(
    v_staff.hotel_id, v_staff, 'stay.moved', p_to_room_id, p_stay_id,
    jsonb_build_object('room', v_from_room.room_number, 'guest', v_stay.guest_name),
    jsonb_build_object('from_room', v_from_room.room_number, 'to_room', v_to_room.room_number),
    btrim(p_reason)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.correct_stay(
  p_stay_id uuid,
  p_guest_name text,
  p_guest_phone text,
  p_paid_days integer,
  p_reason text,
  p_expected_version integer,
  p_now timestamptz DEFAULT now()
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_staff public.staff_profiles;
  v_stay public.stays;
  v_room_number text;
  v_name text;
  v_phone text;
  v_days integer;
  v_deadline timestamptz;
BEGIN
  v_staff := public.assert_reception_role();

  SELECT * INTO v_stay FROM public.stays WHERE id = p_stay_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That stay no longer exists.';
  END IF;
  IF v_stay.status <> 'active' THEN
    RAISE EXCEPTION 'Only an active stay can be corrected.';
  END IF;
  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'A reason for the correction is required.';
  END IF;

  v_name := btrim(COALESCE(p_guest_name, ''));
  IF v_name = '' THEN
    RAISE EXCEPTION 'A guest name is required.';
  END IF;
  v_phone := NULLIF(btrim(COALESCE(p_guest_phone, '')), '');
  IF p_paid_days IS NULL OR p_paid_days < 1 OR p_paid_days > 30 THEN
    RAISE EXCEPTION 'Paid days must be between 1 and 30.';
  END IF;
  v_days := p_paid_days;
  v_deadline := v_stay.arrival_at + make_interval(hours => 24 * v_days);

  UPDATE public.stays
  SET guest_name = v_name,
      guest_phone = v_phone,
      paid_days = v_days,
      departure_due_at = v_deadline,
      version = version + 1
  WHERE id = p_stay_id AND version = p_expected_version AND status = 'active';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This stay was changed by someone else just now. Refresh and try again.';
  END IF;

  SELECT room_number INTO v_room_number FROM public.rooms WHERE id = v_stay.room_id;

  PERFORM public.log_activity(
    v_staff.hotel_id, v_staff, 'stay.corrected', v_stay.room_id, p_stay_id,
    jsonb_build_object(
      'room', v_room_number,
      'guest', v_stay.guest_name,
      'guest_phone', v_stay.guest_phone,
      'paid_days', v_stay.paid_days,
      'departure_due', v_stay.departure_due_at,
      'recorded_amount', v_stay.paid_days * v_stay.original_daily_rate
    ),
    jsonb_build_object(
      'room', v_room_number,
      'guest', v_name,
      'guest_phone', v_phone,
      'paid_days', v_days,
      'departure_due', v_deadline,
      'recorded_amount', v_days * v_stay.original_daily_rate
    ),
    btrim(p_reason)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.void_stay(
  p_stay_id uuid,
  p_reason text,
  p_expected_version integer,
  p_now timestamptz DEFAULT now()
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_staff public.staff_profiles;
  v_stay public.stays;
  v_room_number text;
  v_now timestamptz := now();
BEGIN
  v_staff := public.assert_reception_role();

  SELECT * INTO v_stay FROM public.stays WHERE id = p_stay_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That stay no longer exists.';
  END IF;
  IF v_stay.status = 'void' THEN
    RAISE EXCEPTION 'This stay is already void.';
  END IF;
  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'A reason for voiding is required.';
  END IF;

  UPDATE public.stays
  SET status = 'void', voided_at = v_now, void_reason = btrim(p_reason), version = version + 1
  WHERE id = p_stay_id AND version = p_expected_version AND status <> 'void';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This stay was changed by someone else just now. Refresh and try again.';
  END IF;

  SELECT room_number INTO v_room_number FROM public.rooms WHERE id = v_stay.room_id;

  INSERT INTO public.inspection_requirements (hotel_id, room_id, trigger, status, due_at)
  VALUES (v_staff.hotel_id, v_stay.room_id, 'departure', 'pending', v_now);

  PERFORM public.log_activity(
    v_staff.hotel_id, v_staff, 'stay.voided', v_stay.room_id, p_stay_id,
    jsonb_build_object('room', v_room_number, 'guest', v_stay.guest_name, 'status', v_stay.status),
    jsonb_build_object('status', 'void'),
    btrim(p_reason)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.enqueue_daily_inspections(p_now timestamptz DEFAULT now())
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now timestamptz := now();
  v_inserted integer;
BEGIN
  INSERT INTO public.inspection_requirements (hotel_id, room_id, trigger, status, due_at, inspection_day)
  SELECT s.hotel_id,
         s.room_id,
         'daily',
         'pending',
         v_now,
         (v_now AT TIME ZONE 'Africa/Lagos')::date
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

COMMENT ON FUNCTION public.record_arrival(uuid, text, text, integer, numeric, timestamptz)
  IS 'p_now is retained for compatibility and ignored; stored timestamps and payment day use database now().';
COMMENT ON FUNCTION public.extend_stay(uuid, integer, numeric, integer, timestamptz)
  IS 'p_now is retained for compatibility and ignored; stored timestamps and payment day use database now().';
COMMENT ON FUNCTION public.confirm_departure(uuid, integer, timestamptz)
  IS 'p_now is retained for compatibility and ignored; stored timestamps use database now().';
COMMENT ON FUNCTION public.move_stay(uuid, uuid, text, integer, timestamptz)
  IS 'p_now is retained for compatibility and ignored; stored timestamps use database now().';
COMMENT ON FUNCTION public.correct_stay(uuid, text, text, integer, text, integer, timestamptz)
  IS 'p_now is retained for compatibility and ignored; stored timestamps use database now().';
COMMENT ON FUNCTION public.void_stay(uuid, text, integer, timestamptz)
  IS 'p_now is retained for compatibility and ignored; stored timestamps use database now().';
COMMENT ON FUNCTION public.enqueue_daily_inspections(timestamptz)
  IS 'p_now is retained for compatibility and ignored; requirement timestamps and operating date use database now().';

COMMIT;