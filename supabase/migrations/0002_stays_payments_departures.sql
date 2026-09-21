-- Hotel Operations — Milestones 3 & 4
-- Walk-in stays, payment records, and departure management.
--
-- Apply in the Supabase SQL editor (or supabase db push) AFTER the foundation
-- schema (hotels, staff_profiles, room_categories, rooms) exists.
--
-- The guard block below stops the migration early with a clear message if the
-- foundation columns differ from what this migration expects.

BEGIN;

-- ---------------------------------------------------------------------------
-- Foundation guards
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  missing text[];
BEGIN
  SELECT array_agg(expected.column_name)
  INTO missing
  FROM (VALUES
    ('rooms', 'id'),
    ('rooms', 'room_number'),
    ('rooms', 'category_id'),
    ('rooms', 'active'),
    ('room_categories', 'id'),
    ('room_categories', 'daily_rate'),
    ('staff_profiles', 'user_id'),
    ('staff_profiles', 'hotel_id'),
    ('staff_profiles', 'display_name'),
    ('staff_profiles', 'role'),
    ('staff_profiles', 'active'),
    ('hotels', 'id')
  ) AS expected(table_name, column_name)
  WHERE NOT EXISTS (
    SELECT 1
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name = expected.table_name
      AND c.column_name = expected.column_name
  );

  IF array_length(missing, 1) IS NOT NULL THEN
    RAISE EXCEPTION 'Foundation schema mismatch. Missing expected columns: %. Update this migration to match the real foundation schema before applying.', array_to_string(missing, ', ');
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
CREATE TABLE public.stays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL REFERENCES public.hotels(id),
  room_id uuid NOT NULL REFERENCES public.rooms(id),
  guest_name text NOT NULL,
  guest_phone text,
  category_id uuid REFERENCES public.room_categories(id),
  original_daily_rate numeric(12, 0) NOT NULL CHECK (original_daily_rate > 0),
  arrival_at timestamptz NOT NULL,
  departure_due_at timestamptz NOT NULL,
  paid_days integer NOT NULL CHECK (paid_days > 0),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'departed', 'void')),
  departed_at timestamptz,
  voided_at timestamptz,
  void_reason text,
  version integer NOT NULL DEFAULT 1,
  created_by uuid NOT NULL REFERENCES public.staff_profiles(user_id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- At most one active stay per room, enforced even under concurrent arrival.
CREATE UNIQUE INDEX stays_one_active_per_room
  ON public.stays (room_id)
  WHERE status = 'active';

CREATE INDEX stays_hotel_active_idx ON public.stays (hotel_id, status, departure_due_at);

CREATE TABLE public.payment_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stay_id uuid NOT NULL REFERENCES public.stays(id),
  hotel_id uuid NOT NULL REFERENCES public.hotels(id),
  kind text NOT NULL CHECK (kind IN ('initial', 'extension')),
  amount numeric(12, 0) NOT NULL CHECK (amount > 0),
  received_on date NOT NULL,
  note text,
  created_by uuid NOT NULL REFERENCES public.staff_profiles(user_id),
  created_by_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX payment_records_stay_idx ON public.payment_records (stay_id);
CREATE INDEX payment_records_hotel_day_idx ON public.payment_records (hotel_id, received_on);

CREATE TABLE public.stay_room_moves (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stay_id uuid NOT NULL REFERENCES public.stays(id),
  from_room_id uuid NOT NULL REFERENCES public.rooms(id),
  to_room_id uuid NOT NULL REFERENCES public.rooms(id),
  reason text,
  moved_by uuid NOT NULL REFERENCES public.staff_profiles(user_id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.activity_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL REFERENCES public.hotels(id),
  actor_id uuid NOT NULL REFERENCES public.staff_profiles(user_id),
  actor_name text NOT NULL,
  action text NOT NULL,
  room_id uuid REFERENCES public.rooms(id),
  stay_id uuid REFERENCES public.stays(id),
  before_facts jsonb,
  after_facts jsonb,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX activity_events_hotel_idx ON public.activity_events (hotel_id, created_at DESC);

CREATE TABLE public.inspection_requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL REFERENCES public.hotels(id),
  room_id uuid NOT NULL REFERENCES public.rooms(id),
  trigger text NOT NULL CHECK (trigger IN ('departure', 'daily')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'attention', 'access_blocked')),
  due_at timestamptz NOT NULL,
  version integer NOT NULL DEFAULT 1,
  outcome text,
  findings text,
  completed_by uuid REFERENCES public.staff_profiles(user_id),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX inspection_requirements_room_idx ON public.inspection_requirements (room_id, status);

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER stays_touch_updated_at BEFORE UPDATE ON public.stays
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER inspection_requirements_touch_updated_at BEFORE UPDATE ON public.inspection_requirements
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
ALTER TABLE public.stays ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stay_room_moves ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inspection_requirements ENABLE ROW LEVEL SECURITY;

-- Reads: active staff scoped to their own hotel. All writes happen only
-- through the SECURITY DEFINER functions below (no client write policies).
CREATE POLICY "staff read stays" ON public.stays FOR SELECT TO authenticated
  USING (hotel_id = (SELECT hotel_id FROM public.staff_profiles WHERE user_id = auth.uid() AND active));
CREATE POLICY "staff read payments" ON public.payment_records FOR SELECT TO authenticated
  USING (hotel_id = (SELECT hotel_id FROM public.staff_profiles WHERE user_id = auth.uid() AND active));
CREATE POLICY "staff read room moves" ON public.stay_room_moves FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.stays s
    WHERE s.id = stay_id
      AND s.hotel_id = (SELECT hotel_id FROM public.staff_profiles WHERE user_id = auth.uid() AND active)
  ));
CREATE POLICY "staff read activity" ON public.activity_events FOR SELECT TO authenticated
  USING (hotel_id = (SELECT hotel_id FROM public.staff_profiles WHERE user_id = auth.uid() AND active));
CREATE POLICY "staff read inspections" ON public.inspection_requirements FOR SELECT TO authenticated
  USING (hotel_id = (SELECT hotel_id FROM public.staff_profiles WHERE user_id = auth.uid() AND active));

-- ---------------------------------------------------------------------------
-- Shared helpers
-- ---------------------------------------------------------------------------
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
  SELECT * INTO v_staff FROM public.staff_profiles
  WHERE user_id = auth.uid() AND active;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Your staff profile is unavailable or inactive.';
  END IF;
  IF v_staff.role NOT IN ('owner', 'receptionist') THEN
    RAISE EXCEPTION 'Your role cannot perform reception actions.';
  END IF;
  RETURN v_staff;
END;
$$;

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
    );
$$;

CREATE OR REPLACE FUNCTION public.log_activity(
  p_hotel_id uuid,
  p_actor public.staff_profiles,
  p_action text,
  p_room_id uuid,
  p_stay_id uuid,
  p_before jsonb,
  p_after jsonb,
  p_reason text
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.activity_events (hotel_id, actor_id, actor_name, action, room_id, stay_id, before_facts, after_facts, reason)
  VALUES (p_hotel_id, p_actor.user_id, p_actor.display_name, p_action, p_room_id, p_stay_id, p_before, p_after, p_reason);
$$;

-- ---------------------------------------------------------------------------
-- record_arrival — atomic stay + initial payment + activity
-- ---------------------------------------------------------------------------
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

  v_deadline := p_now + make_interval(hours => 24 * p_paid_days);

  INSERT INTO public.stays (
    hotel_id, room_id, guest_name, guest_phone, category_id,
    original_daily_rate, arrival_at, departure_due_at, paid_days, created_by
  ) VALUES (
    v_staff.hotel_id, p_room_id, btrim(p_guest_name),
    NULLIF(btrim(COALESCE(p_guest_phone, '')), ''),
    v_room.category_id, v_rate, p_now, v_deadline, p_paid_days, v_staff.user_id
  ) RETURNING id INTO v_stay_id;

  INSERT INTO public.payment_records (stay_id, hotel_id, kind, amount, received_on, created_by, created_by_name)
  VALUES (v_stay_id, v_staff.hotel_id, 'initial', v_expected, (p_now AT TIME ZONE 'Africa/Lagos')::date, v_staff.user_id, v_staff.display_name);

  PERFORM public.log_activity(
    v_staff.hotel_id, v_staff, 'stay.arrived', p_room_id, v_stay_id, NULL,
    jsonb_build_object(
      'room', v_room.room_number,
      'guest', btrim(p_guest_name),
      'days', p_paid_days,
      'rate', v_rate,
      'amount', v_expected,
      'arrival', p_now,
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

-- ---------------------------------------------------------------------------
-- extend_stay — original rate retained; extension payment on the day paid
-- ---------------------------------------------------------------------------
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
  VALUES (p_stay_id, v_staff.hotel_id, 'extension', v_amount, (p_now AT TIME ZONE 'Africa/Lagos')::date, v_staff.user_id, v_staff.display_name);

  PERFORM public.log_activity(
    v_staff.hotel_id, v_staff, 'stay.extended', v_stay.room_id, p_stay_id,
    jsonb_build_object('departure_due', v_stay.departure_due_at, 'paid_days', v_stay.paid_days),
    jsonb_build_object('departure_due', v_deadline, 'paid_days', v_stay.paid_days + p_added_days, 'extension_amount', v_amount, 'room', v_room_number),
    NULL
  );

  RETURN v_deadline;
END;
$$;

-- ---------------------------------------------------------------------------
-- confirm_departure — ends occupancy, creates fresh departure inspection
-- ---------------------------------------------------------------------------
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
  SET status = 'departed', departed_at = p_now, version = version + 1
  WHERE id = p_stay_id AND version = p_expected_version AND status = 'active';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This stay was changed by someone else just now. Refresh and try again.';
  END IF;

  SELECT room_number INTO v_room_number FROM public.rooms WHERE id = v_stay.room_id;

  INSERT INTO public.inspection_requirements (hotel_id, room_id, trigger, status, due_at)
  VALUES (v_staff.hotel_id, v_stay.room_id, 'departure', 'pending', p_now);

  PERFORM public.log_activity(
    v_staff.hotel_id, v_staff, 'stay.departed', v_stay.room_id, p_stay_id,
    jsonb_build_object('room', v_room_number, 'guest', v_stay.guest_name, 'departure_due', v_stay.departure_due_at),
    jsonb_build_object('departed_at', p_now, 'inspection_triggered', 'departure'),
    NULL
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- move_stay — guest changes room within the same stay
-- ---------------------------------------------------------------------------
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

  -- The vacated room goes for inspection; the stay continues unchanged.
  INSERT INTO public.inspection_requirements (hotel_id, room_id, trigger, status, due_at)
  VALUES (v_staff.hotel_id, v_stay.room_id, 'departure', 'pending', p_now);

  PERFORM public.log_activity(
    v_staff.hotel_id, v_staff, 'stay.moved', p_to_room_id, p_stay_id,
    jsonb_build_object('room', v_from_room.room_number, 'guest', v_stay.guest_name),
    jsonb_build_object('from_room', v_from_room.room_number, 'to_room', v_to_room.room_number),
    btrim(p_reason)
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- correct_stay — attributed correction of guest details / paid days
-- ---------------------------------------------------------------------------
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

  -- Payment rows are untouched: a correction explains the record; it does not
  -- claim money moved. The owner sees the before/after arithmetic here.
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

-- ---------------------------------------------------------------------------
-- void_stay — removes the stay from active records without deleting history
-- ---------------------------------------------------------------------------
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
  SET status = 'void', voided_at = p_now, void_reason = btrim(p_reason), version = version + 1
  WHERE id = p_stay_id AND version = p_expected_version AND status <> 'void';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This stay was changed by someone else just now. Refresh and try again.';
  END IF;

  SELECT room_number INTO v_room_number FROM public.rooms WHERE id = v_stay.room_id;

  -- Voiding never declares the room clean; it goes for inspection.
  INSERT INTO public.inspection_requirements (hotel_id, room_id, trigger, status, due_at)
  VALUES (v_staff.hotel_id, v_stay.room_id, 'departure', 'pending', p_now);

  PERFORM public.log_activity(
    v_staff.hotel_id, v_staff, 'stay.voided', v_stay.room_id, p_stay_id,
    jsonb_build_object('room', v_room_number, 'guest', v_stay.guest_name, 'status', v_stay.status),
    jsonb_build_object('status', 'void'),
    btrim(p_reason)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_arrival(uuid, text, text, integer, numeric, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.extend_stay(uuid, integer, numeric, integer, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_departure(uuid, integer, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.move_stay(uuid, uuid, text, integer, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.correct_stay(uuid, text, text, integer, text, integer, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.void_stay(uuid, text, integer, timestamptz) TO authenticated;

COMMIT;
